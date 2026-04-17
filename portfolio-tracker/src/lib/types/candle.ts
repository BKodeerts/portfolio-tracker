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
  marketState?: string;
  tradingPeriods?: {
    pre?: { start: number; end: number }[];
    regular?: { start: number; end: number }[];
    post?: { start: number; end: number }[];
  };
}
