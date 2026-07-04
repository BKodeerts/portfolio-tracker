import type { ChartPoint } from '$lib/types/portfolio';

/** Revamp period set (design decision: `1D 1M 3M YTD 1Y 3Y Max`). */
export type Period = '1d' | '1m' | '3m' | 'ytd' | '1y' | '3y' | 'total';

/** Superset still used by pre-revamp pages ('6m'/'2y' pills). */
export type LegacyPeriod = Period | '6m' | '2y';

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '1d',    label: '1D' },
  { value: '1m',    label: '1M' },
  { value: '3m',    label: '3M' },
  { value: 'ytd',   label: 'YTD' },
  { value: '1y',    label: '1Y' },
  { value: '3y',    label: '3Y' },
  { value: 'total', label: 'Max' },
];

/** Muted label next to the hero delta ("+€312 (+1.25%) today"). */
export function periodDeltaLabel(p: Period): string {
  switch (p) {
    case '1d':    return 'today';
    case '1m':    return 'past month';
    case '3m':    return 'past 3 months';
    case 'ytd':   return 'year to date';
    case '1y':    return 'past year';
    case '3y':    return 'past 3 years';
    case 'total': return 'all time';
  }
}

/** Minimal shape needed for period filtering: anything with a date. */
export interface DatedPoint {
  date: string;
}

/** Returns a cutoff date string (YYYY-MM-DD) for the given period, or null for 'total'. */
export function periodCutoff(period: LegacyPeriod): string | null {
  if (period === 'total') return null;
  const now = new Date();
  if (period === 'ytd') return `${now.getFullYear()}-01-01`;
  const d = new Date(now);
  if (period === '1d')  d.setDate(d.getDate() - 1);
  if (period === '1m')  d.setMonth(d.getMonth() - 1);
  if (period === '3m')  d.setMonth(d.getMonth() - 3);
  if (period === '6m')  d.setMonth(d.getMonth() - 6);
  if (period === '1y')  d.setFullYear(d.getFullYear() - 1);
  if (period === '2y')  d.setFullYear(d.getFullYear() - 2);
  if (period === '3y')  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
}

export function filterByPeriod<T extends DatedPoint>(data: T[], period: LegacyPeriod): T[] {
  const cutoff = periodCutoff(period);
  if (!cutoff) return data;
  return data.filter((d) => d.date >= cutoff);
}

/**
 * Date-based chart-data slice for a period. 'total' returns everything;
 * '1d' also returns everything — callers render the intraday series instead.
 */
export function filterChartData(data: ChartPoint[], p: Period): ChartPoint[] {
  if (p === 'total' || p === '1d') return data;
  return filterByPeriod(data, p);
}
