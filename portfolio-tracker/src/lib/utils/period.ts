export type Period = '1d' | '1m' | '3m' | '6m' | 'ytd' | '1y' | '2y' | '3y' | 'total';

export interface ChartPoint {
  date: string;
  [key: string]: unknown;
}

/** Returns a cutoff date string (YYYY-MM-DD) for the given period, or null for 'total'. */
export function periodCutoff(period: Period): string | null {
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

export function filterByPeriod<T extends ChartPoint>(data: T[], period: Period): T[] {
  const cutoff = periodCutoff(period);
  if (!cutoff) return data;
  return data.filter((d) => d.date >= cutoff);
}
