export interface Candle {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface IntradayPoint {
  ts: number;   // unix timestamp (seconds)
  close: number;
}

export interface IntradayData {
  previousClose: number | null;
  /**
   * Baseline of the drawn session (the close before the day `points` belong
   * to) — what charts measure the session line against. Differs from
   * `previousClose` only during pre-market, where `previousClose` is the drawn
   * (previous) session's own close.
   */
  sessionPreviousClose?: number | null;
  points: IntradayPoint[];
  allPoints?: IntradayPoint[];
  date: string;
  /** Trading currency from Yahoo chart meta (pence tickers report "GBp"). */
  currency?: string | null;
  /** Company name from Yahoo chart meta (watchlist card labels). */
  shortName?: string | null;
  marketState?: string;
  tradingPeriods?: {
    pre?: { start: number; end: number };
    regular?: { start: number; end: number };
    post?: { start: number; end: number };
  };
}
