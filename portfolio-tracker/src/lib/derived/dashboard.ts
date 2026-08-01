import { portfolioStore } from '$lib/stores/portfolio.svelte';
import { intradayStore } from '$lib/stores/intraday.svelte';
import { getDisplayDay } from '$lib/derived/intraday';
import { getTradingMins, isExchangeOpen, normalizeMarketState, sessionBounds, fmtSessionTime, fmtOpenAt, nextSessionOpen } from '$lib/market';
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
  const day = getDisplayDay();
  let liveValue = 0;
  let prevValue = 0;
  for (const pos of portfolioStore.positions) {
    const yahoo = pos.yahoo ?? pos.ticker;
    const intra = intradayStore.data[yahoo];
    // Day-change baseline: the drawn session's previous close only when the
    // ticker traded on the displayed day; a ticker whose exchange didn't trade
    // is carried flat at its last close, so a previous session's move never
    // counts as "today's" change (same rule as the 1D chart in
    // derived/intraday.ts). sessionPreviousClose (not previousClose) so that
    // pre-market — when the displayed day is the previous session and
    // previousClose is that session's own close — still shows its move.
    const lastPt = (intra?.points ?? []).at(-1);
    const lastClose = lastPt?.close ?? intra?.previousClose ?? 0;
    const traded = lastPt != null && day.dayIdxOf(lastPt.ts) === day.displayIdx;
    const baseline = intra?.sessionPreviousClose ?? intra?.previousClose ?? 0;
    // No intraday data or no live FX rate for this position's currency:
    // fall back to the server-computed static value.
    const liveEur = intra?.previousClose
      ? toEurLive(pos.currency, pos.shares * lastClose, rates)
      : null;
    const prevEur = intra?.previousClose
      ? toEurLive(pos.currency, pos.shares * (traded ? baseline : lastClose), rates)
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
  // The ghost must belong to the NEXT session (its window starts after the
  // drawn session ends) — on weekends tradingPeriods still describe the drawn
  // (Friday) session itself, and its own pre-market is not a tail.
  const periods = intra.tradingPeriods;
  let ghostPoints: IntradayPoint[] = [];
  let ghostStart: number | null = null;
  let ghostEnd: number | null = null;
  if (periods?.pre && periods.regular && periods.regular.start > periods.pre.start
      && periods.pre.start >= session.end) {
    const pre = periods.pre;
    const tail = (intra.allPoints ?? []).filter((p) => p.ts >= pre.start && p.ts < periods.regular!.start);
    if (tail.length >= 2) {
      ghostPoints = tail;
      ghostStart = pre.start;
      ghostEnd = periods.regular.start;
    }
  }

  // tradingPeriods may describe an already-finished session (weekends) — roll
  // forward to the real next open so the hint never implies "opens today".
  const periodOpen = periods?.regular?.start ?? sessionBounds(yahoo, today)?.open ?? null;
  const nextOpenTs = periodOpen != null && periodOpen > Date.now() / 1000
    ? periodOpen
    : nextSessionOpen(yahoo);
  return {
    // Pre-open the drawn points are the PREVIOUS session's, so the baseline is
    // the close before that session — prevClose here is that session's own
    // close, which would pin the drawn line's end onto the zero line.
    phase, points, prevClose: intra.sessionPreviousClose ?? prevClose,
    sessionStart: session.start, sessionEnd: session.end,
    ghostPoints, ghostStart, ghostEnd,
    hint: nextOpenTs != null ? `prev session · opens ${fmtOpenAt(nextOpenTs)}` : 'prev session',
  };
}

/** Live EUR value of a position (last intraday tick × live FX), static fallback. */
export function livePositionValueEur(pos: { ticker: string; yahoo?: string; currency: string; shares: number; value: number }): number {
  const yahoo = pos.yahoo ?? pos.ticker;
  const intra = intradayStore.data[yahoo];
  const price = (intra?.points ?? []).at(-1)?.close ?? intra?.previousClose;
  if (price == null) return pos.value;
  return toEurLive(pos.currency, pos.shares * price, intradayStore.liveRates) ?? pos.value;
}

/**
 * Previous session's move for a pre-open card (spark points are yesterday's
 * session): per-share native change and % of that session's close against the
 * close before it — the standard daily-change convention.
 *
 * The baseline is `spark.prevClose`, the very value IntradaySparkline draws its
 * zero line at, so the card's number and the line's position against that line
 * agree by construction. Measuring open-to-close here instead (as this did)
 * makes the card and its own sparkline report different moves.
 */
export function prevSessionMove(spark: TickerSpark): { pct: number; native: number } | null {
  const base = spark.prevClose;
  const last = spark.points[spark.points.length - 1]?.close;
  if (!base || last == null) return null;
  return { pct: ((last - base) / base) * 100, native: last - base };
}

/** Watchlist card data: tracked-but-not-held tickers from the intraday store. */
export interface WatchCard {
  ticker: string;
  yahoo: string;
  /** Company name (Yahoo shortName), fallback to configured label/symbol. */
  label: string;
  /** Trading currency ("GBp" normalised to GBX). */
  currency: string;
  prevClose: number | null;
  price: number | null;
  changePct: number | null;
  /** Day change per share in the trading currency (no position exists). */
  changeNative: number | null;
}

export function buildWatchCards(): WatchCard[] {
  return portfolioStore.watchlistData.map((w) => {
    const yahoo = w.yahoo ?? w.ticker;
    const intra = intradayStore.data[yahoo];
    const rawCcy = intra?.currency ?? 'EUR';
    const currency = rawCcy === 'GBp' ? 'GBX' : rawCcy;
    const prevClose = intra?.previousClose ?? null;
    const price = (intra?.points ?? []).at(-1)?.close ?? null;
    const changePct = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const changeNative = price != null && prevClose != null ? price - prevClose : null;
    return {
      ticker: w.ticker,
      yahoo,
      label: intra?.shortName ?? w.label ?? w.ticker,
      currency, prevClose, price, changePct, changeNative,
    };
  });
}

/**
 * S&P 500 overlay for a period-filtered chart slice: growth ratio vs the
 * window's first available index value, aligned per row (at-or-before date).
 * Null when the server series or the window is too thin.
 */
export function buildBenchmarkRatios(filtered: ChartPoint[]): (number | null)[] | null {
  const sp = portfolioStore.sp500Data;
  if (sp.length < 2 || filtered.length < 2) return null;
  let j = 0;
  let base: number | null = null;
  const out: (number | null)[] = [];
  for (const row of filtered) {
    while (j + 1 < sp.length && sp[j + 1]!.date <= row.date) j++;
    const v = sp[j]!.date <= row.date ? sp[j]!.value : null;
    if (v != null && base == null) base = v;
    out.push(v != null && base != null && base > 0 ? v / base : null);
  }
  return base != null ? out : null;
}

/** 1D session-shading bands (minutes-of-day CET): EU / EU+US overlap / US. */
export interface SessionBand {
  start: number;
  end: number;
  label: string;
  strong: boolean;
}

const US_OPEN_MIN = 15.5 * 60;
const EU_CLOSE_MIN = 17.5 * 60;

export function buildSessionBands(dayStart: number, dayEnd: number): SessionBand[] {
  if (dayEnd <= dayStart) return [];
  if (dayEnd <= US_OPEN_MIN) return [{ start: dayStart, end: dayEnd, label: 'EU', strong: false }];
  if (dayStart >= EU_CLOSE_MIN) return [{ start: dayStart, end: dayEnd, label: 'US', strong: false }];
  if (dayStart >= US_OPEN_MIN) {
    // US-only portfolio that still overlaps the EU close (e.g. 15:30 start).
    if (dayEnd <= EU_CLOSE_MIN) return [{ start: dayStart, end: dayEnd, label: 'EU + US', strong: true }];
    return [
      { start: dayStart, end: EU_CLOSE_MIN, label: 'EU + US', strong: true },
      { start: EU_CLOSE_MIN, end: dayEnd, label: 'US', strong: false },
    ];
  }
  const bands: SessionBand[] = [{ start: dayStart, end: US_OPEN_MIN, label: 'EU', strong: false }];
  bands.push({ start: US_OPEN_MIN, end: Math.min(EU_CLOSE_MIN, dayEnd), label: 'EU + US', strong: true });
  if (dayEnd > EU_CLOSE_MIN) bands.push({ start: EU_CLOSE_MIN, end: dayEnd, label: 'US', strong: false });
  return bands;
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
  const day = getDisplayDay();
  let prevCloseTotal = 0;
  let currentTotal   = 0;
  for (const ticker of tickers) {
    const yahoo  = portfolioStore.tickerMeta[ticker]?.yahoo ?? ticker;
    const intra  = intradayStore.data[yahoo];
    if (!intra) continue;
    const pos     = portfolioStore.positions.find((p) => p.ticker === ticker);
    const shares  = pos?.shares ?? 0;
    const prevClose = intra.sessionPreviousClose ?? intra.previousClose ?? 0;
    const pts     = intra.points ?? [];
    const lastPt  = pts[pts.length - 1];
    const lastPrice = lastPt?.close ?? prevClose;
    // Same baseline rule as getLiveData/the 1D chart: tickers that didn't
    // trade on the displayed day sit flat at their last close (zero change).
    const traded  = lastPt != null && day.dayIdxOf(lastPt.ts) === day.displayIdx;
    prevCloseTotal += toEurLive(pos?.currency, shares * (traded ? prevClose : lastPrice), rates) ?? 0;
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
