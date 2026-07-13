/** Per-ticker reference stats from `/api/stats/:symbol` (Stock Detail v3). */
export interface TickerStats {
  low52w: number | null;
  high52w: number | null;
  mktCap: number | null;
  volume: number | null;
  avgVolume: number | null;
  /** Trailing P/E — null when the company has no earnings (rendered as `—`). */
  pe: number | null;
  /** Price returns of the stock itself, percent; null when the listing history doesn't span the period. */
  returns: {
    '1m': number | null;
    '6m': number | null;
    '1y': number | null;
    '3y': number | null;
    all: number | null;
  };
}
