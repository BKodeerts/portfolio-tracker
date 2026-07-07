import { portfolioStore } from '$lib/stores/portfolio.svelte';
import { intradayStore } from '$lib/stores/intraday.svelte';
import { getTradingMins, isExchangeOpen, normalizeMarketState, sessionBounds, fmtSessionTime } from '$lib/market';
import { toEurLive, liveRateFor } from '$lib/fx';
import type { ChartPoint } from '$lib/types/portfolio';
import type { IntradayData, IntradayPoint } from '$lib/types/candle';
import type { LegacyPeriod } from '$lib/utils/period';

/**
 * Dashboard derived state. Plain functions over the reactive stores —
 * call them inside `$derived` in components to stay reactive.
 */

export interface SparkCard {
  ticker: string;
  yahoo: string;
  label: string;
  shares: number;
  prevClose: number | null;
  price: number | null;
  changePct: number | null;
  changeEur: number | null;
  marketState: string;
}

export interface Movers {
  top: SparkCard | null;
  bot: SparkCard | null;
}

/** Live portfolio value + day P&L from intraday quotes (null until loaded). */
export function getLiveData(): { value: number; dayPl: number } | null {
  if (!intradayStore.loaded || portfolioStore.positions.length === 0) return null;
  const rates = intradayStore.liveRates;
  let liveValue = 0;
  let prevValue = 0;
  for (const pos of portfolioStore.positions) {
    const yahoo = pos.yahoo ?? pos.ticker;
    const intra = intradayStore.data[yahoo];
    // No intraday data or no live FX rate for this position's currency:
    // fall back to the server-computed static value.
    const liveEur = intra?.previousClose
      ? toEurLive(pos.currency, pos.shares * ((intra.points ?? []).at(-1)?.close ?? intra.previousClose), rates)
      : null;
    const prevEur = intra?.previousClose
      ? toEurLive(pos.currency, pos.shares * intra.previousClose, rates)
      : null;
    if (liveEur == null || prevEur == null) {
      liveValue += pos.value;
      prevValue += pos.value;
      continue;
    }
    liveValue += liveEur;
    prevValue += prevEur;
  }
  return { value: liveValue, dayPl: liveValue - prevValue };
}

/** One card per current ticker with intraday price/change/market state. */
export function buildCards(): SparkCard[] {
  return portfolioStore.currentTickers.map((ticker) => {
    const meta   = portfolioStore.tickerMeta[ticker];
    const yahoo  = meta?.yahoo ?? ticker;
    const label  = meta?.label ?? ticker;
    const pos    = portfolioStore.positions.find((p) => p.ticker === ticker);
    const shares = pos?.shares ?? 0;
    const intra  = intradayStore.data[yahoo];
    const prevClose   = intra?.previousClose ?? null;
    const pts         = intra?.points ?? [];
    const lastPt      = pts[pts.length - 1];
    const price       = lastPt?.close ?? null;
    const changePct   = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const currency  = pos?.currency ?? meta?.currency;
    const changeEur = price != null && prevClose && shares
      ? toEurLive(currency, (price - prevClose) * shares, intradayStore.liveRates)
      : null;
    const rawState    = intra?.marketState ?? '';
    const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
    return { ticker, yahoo, label, shares, prevClose, price, changePct, changeEur, marketState };
  });
}

/** True when any tracked exchange is in its regular session (nav status chip). */
export function anyMarketOpen(): boolean {
  return buildCards().some((c) => c.marketState === 'REGULAR');
}

/** Ticker sparkline phase: its own exchange session only, never FX drift. */
export type SparkPhase = 'pre' | 'live' | 'post';

export interface TickerSpark {
  phase: SparkPhase;
  /** Session line: today's points (live/post) or yesterday's full session (pre). */
  points: IntradayPoint[];
  prevClose: number;
  /** Bounds (unix secs) of the session the points belong to. */
  sessionStart: number;
  sessionEnd: number;
  /** Pre phase only: today's pre-market points for the dotted ghost tail. */
  ghostPoints: IntradayPoint[];
  ghostStart: number | null;
  ghostEnd: number | null;
  /** Caption under the sparkline ("prev session · opens 15:30" / "closed 22:00"). */
  hint: string | null;
}

/**
 * Bounds of the session the drawn points actually belong to. Yahoo's
 * `tradingPeriods.regular` describes the *current* session — during pre-market
 * that is today's, while `points` still hold yesterday's session — so only
 * trust it when the points fall inside it; otherwise derive bounds from the
 * points' own date via the exchange defs.
 */
function drawnSessionBounds(yahoo: string, intra: IntradayData): { start: number; end: number } | null {
  const pts = intra.points ?? [];
  const regular = intra.tradingPeriods?.regular;
  if (regular && pts.length > 0) {
    const HOUR = 3600;
    if (pts[0]!.ts >= regular.start - HOUR && pts[pts.length - 1]!.ts <= regular.end + HOUR) {
      return { start: regular.start, end: regular.end };
    }
  }
  const b = sessionBounds(yahoo, intra.date || new Date().toISOString().slice(0, 10));
  return b ? { start: b.open, end: b.close } : null;
}

/**
 * State-driven sparkline inputs for a holdings row (design: a ticker's
 * sparkline reflects its own exchange session only, with explicit
 * pre-open / live / closed states). Null when there's nothing to draw.
 */
export function buildTickerSpark(yahoo: string): TickerSpark | null {
  const intra = intradayStore.data[yahoo];
  const prevClose = intra?.previousClose;
  const points = intra?.points ?? [];
  if (!intra || !prevClose || points.length < 2) return null;

  const session = drawnSessionBounds(yahoo, intra);
  if (!session || session.end <= session.start) return null;

  const today = new Date().toISOString().slice(0, 10);
  const rawState = intra.marketState ?? '';
  const state = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));

  let phase: SparkPhase;
  if (state === 'REGULAR') phase = 'live';
  else if (state === 'PRE') phase = 'pre';
  else if (state === 'POST') phase = 'post';
  // CLOSED: today's session already drawn → post; older session → pre-open.
  else phase = intra.date === today ? 'post' : 'pre';

  if (phase !== 'pre') {
    return {
      phase, points, prevClose,
      sessionStart: session.start, sessionEnd: session.end,
      ghostPoints: [], ghostStart: null, ghostEnd: null,
      hint: phase === 'post' ? `closed ${fmtSessionTime(session.end)}` : null,
    };
  }

  // Pre-open: dim yesterday's session; today's pre-market becomes a ghost tail.
  const periods = intra.tradingPeriods;
  let ghostPoints: IntradayPoint[] = [];
  let ghostStart: number | null = null;
  let ghostEnd: number | null = null;
  if (periods?.pre && periods.regular && periods.regular.start > periods.pre.start) {
    const pre = periods.pre;
    const tail = (intra.allPoints ?? []).filter((p) => p.ts >= pre.start && p.ts < periods.regular!.start);
    if (tail.length >= 2) {
      ghostPoints = tail;
      ghostStart = pre.start;
      ghostEnd = periods.regular.start;
    }
  }

  const nextOpenTs = periods?.regular?.start ?? sessionBounds(yahoo, today)?.open ?? null;
  return {
    phase, points, prevClose,
    sessionStart: session.start, sessionEnd: session.end,
    ghostPoints, ghostStart, ghostEnd,
    hint: nextOpenTs != null ? `prev session · opens ${fmtSessionTime(nextOpenTs)}` : 'prev session',
  };
}

/** Top winner / top loser by day % (only if actually positive / negative). */
export function getMovers(cards: SparkCard[]): Movers {
  const cs = cards.filter((c) => c.changePct != null);
  const sorted = [...cs].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const first = sorted[0] ?? null;
  const last  = sorted[sorted.length - 1] ?? null;
  return {
    top: first && (first.changePct ?? 0) > 0 ? first : null,
    bot: last  && (last.changePct  ?? 0) < 0 ? last  : null,
  };
}

/** Day P&L across the portfolio from intraday quotes (used for 1D period). */
export function getDay1Pl(): { pl: number; pct: number } | null {
  const tickers = portfolioStore.currentTickers;
  if (!tickers.length || !intradayStore.loaded) return null;
  const rates = intradayStore.liveRates;
  // Require a live rate for every held non-EUR currency before showing a total.
  const held = portfolioStore.positions.map((p) => p.currency);
  if (held.some((c) => liveRateFor(c, rates) == null)) return null;
  let prevCloseTotal = 0;
  let currentTotal   = 0;
  for (const ticker of tickers) {
    const yahoo  = portfolioStore.tickerMeta[ticker]?.yahoo ?? ticker;
    const intra  = intradayStore.data[yahoo];
    if (!intra) continue;
    const pos     = portfolioStore.positions.find((p) => p.ticker === ticker);
    const shares  = pos?.shares ?? 0;
    const prevClose = intra.previousClose ?? 0;
    const pts     = intra.points ?? [];
    const lastPrice = pts[pts.length - 1]?.close ?? prevClose;
    prevCloseTotal += toEurLive(pos?.currency, shares * prevClose, rates) ?? 0;
    currentTotal   += toEurLive(pos?.currency, shares * lastPrice, rates) ?? 0;
  }
  if (prevCloseTotal <= 0) return null;
  const diff = currentTotal - prevCloseTotal;
  return { pl: diff, pct: (diff / prevCloseTotal) * 100 };
}

/** Dashboard period pill → server rollingReturns key ('total' = inception TWR). */
const TWR_KEY: Partial<Record<LegacyPeriod, string>> = {
  '1m': '1m', '3m': '3m', 'ytd': 'ytd', '1y': '1y', '3y': '3y', 'total': 'inception',
};

/**
 * P&L over an already period-filtered chart-data slice. The EUR amount is
 * the change in unrealized P&L (value − cost basis), so deposits/withdrawals
 * don't count. The % is the server-computed time-weighted return for the
 * period (rollingReturns): dividing the EUR amount by the period-start value
 * explodes on long windows where the portfolio started near zero (Max),
 * because every later deposit dwarfs that base. pct is null when the server
 * has no TWR for the period.
 */
export function getPeriodPl(filtered: ChartPoint[], period: LegacyPeriod): { pl: number; pct: number | null } | null {
  if (filtered.length < 2) return null;
  const first = filtered[0]!;
  const last  = filtered[filtered.length - 1]!;
  const fv = first.value ?? 0;
  const lv = last.value ?? 0;
  const fi = first.invested ?? 0;
  const li = last.invested ?? 0;
  const pl  = (lv - li) - (fv - fi);
  const key = TWR_KEY[period];
  const pct = key ? portfolioStore.rollingReturns[key]?.portfolio ?? null : null;
  return { pl, pct };
}

/** Last-n weekly portfolio values for a ticker (mini trend sparkline). */
export function posSparkValues(ticker: string, n = 12): number[] {
  return portfolioStore.chartData
    .slice(-n)
    .map((pt) => pt.positions[ticker]?.value ?? 0)
    .filter((v) => v > 0);
}

/** Intraday spark inputs for a position card; null when unavailable. */
export function intradaySparkInputs(ticker: string): { points: { ts: number; close: number }[]; prevClose: number; tradingMins: number } | null {
  const yahoo = portfolioStore.tickerMeta[ticker]?.yahoo ?? ticker;
  const intra = intradayStore.data[yahoo];
  const pts = intra?.points ?? [];
  const prev = intra?.previousClose ?? null;
  if (pts.length < 2 || !prev) return null;
  return { points: pts, prevClose: prev, tradingMins: getTradingMins(yahoo) };
}
