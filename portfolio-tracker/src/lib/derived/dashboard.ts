import { portfolioStore } from '$lib/stores/portfolio.svelte';
import { intradayStore } from '$lib/stores/intraday.svelte';
import { getTradingMins, isExchangeOpen, normalizeMarketState } from '$lib/market';
import { toEurLive, liveRateFor } from '$lib/fx';
import type { ChartPoint } from '$lib/types/portfolio';

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
    const yahoo  = (meta?.['yahoo'] as string | undefined) ?? ticker;
    const label  = (meta?.['label'] as string | undefined) ?? ticker;
    const pos    = portfolioStore.positions.find((p) => p.ticker === ticker);
    const shares = pos?.shares ?? 0;
    const intra  = intradayStore.data[yahoo];
    const prevClose   = intra?.previousClose ?? null;
    const pts         = intra?.points ?? [];
    const lastPt      = pts[pts.length - 1];
    const price       = lastPt?.close ?? null;
    const changePct   = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const currency  = pos?.currency ?? (meta?.['currency'] as string | undefined);
    const changeEur = price != null && prevClose && shares
      ? toEurLive(currency, (price - prevClose) * shares, intradayStore.liveRates)
      : null;
    const rawState    = intra?.marketState ?? '';
    const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
    return { ticker, yahoo, label, shares, prevClose, price, changePct, changeEur, marketState };
  });
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
    const yahoo  = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
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

/** P&L over an already period-filtered chart-data slice. */
export function getPeriodPl(filtered: ChartPoint[]): { pl: number; pct: number } | null {
  if (filtered.length < 2) return null;
  const first = filtered[0]!;
  const last  = filtered[filtered.length - 1]!;
  const fv = (first.value as number) ?? 0;
  const lv = (last.value  as number) ?? 0;
  const fi = (first.invested as number) ?? 0;
  const li = (last.invested  as number) ?? 0;
  const pl   = (lv - li) - (fv - fi);
  const base = li > 0 ? li : fi;
  return { pl, pct: base > 0 ? (pl / base) * 100 : 0 };
}

/** Last-n weekly portfolio values for a ticker (mini trend sparkline). */
export function posSparkValues(ticker: string, n = 12): number[] {
  return portfolioStore.chartData
    .slice(-n)
    .map((pt) => (pt[ticker] as number | undefined) ?? 0)
    .filter((v) => v > 0);
}

/** Intraday spark inputs for a position card; null when unavailable. */
export function intradaySparkInputs(ticker: string): { points: { ts: number; close: number }[]; prevClose: number; tradingMins: number } | null {
  const yahoo = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
  const intra = intradayStore.data[yahoo];
  const pts = intra?.points ?? [];
  const prev = intra?.previousClose ?? null;
  if (pts.length < 2 || !prev) return null;
  return { points: pts, prevClose: prev, tradingMins: getTradingMins(yahoo) };
}
