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
