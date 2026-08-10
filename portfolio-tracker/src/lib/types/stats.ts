/**
 * Next scheduled earnings report, normalized server-side by
 * `server/domain/earnings.js`. Every field is null/false when Yahoo has no
 * date for the listing — ETFs and many non-US listings never carry one.
 */
export interface EarningsInfo {
  /** `YYYY-MM-DD` in the exchange's timezone; the window start when unconfirmed. */
  date: string | null;
  /** Window end — set only when the window spans more than one day. */
  endDate: string | null;
  /** Yahoo flagged the date as an estimate, or it spans a multi-day window. */
  estimated: boolean;
  /** False once the date has passed — Yahoo also returns the most recent report. */
  upcoming: boolean;
  /** Raw epoch seconds. The clock component is a placeholder; only the date is meaningful. */
  timestamp: number | null;
}

/** Per-ticker reference stats from `/api/stats/:symbol` (Stock Detail v3). */
export interface TickerStats {
  low52w: number | null;
  high52w: number | null;
  mktCap: number | null;
  volume: number | null;
  avgVolume: number | null;
  /** Trailing P/E — null when the company has no earnings (rendered as `—`). */
  pe: number | null;
  /** Next earnings report. Absent on entries served from a cache written before 0.13.9. */
  earnings: EarningsInfo;
  /** Price returns of the stock itself, percent; null when the listing history doesn't span the period. */
  returns: {
    '1m': number | null;
    '6m': number | null;
    '1y': number | null;
    '3y': number | null;
    all: number | null;
  };
}
