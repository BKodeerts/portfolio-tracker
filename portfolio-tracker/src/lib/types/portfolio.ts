/** Per-ticker slice of one chart row (all EUR). */
export interface ChartPositionSlice {
  value: number;
  cost: number;
  shares: number;
}

export interface ChartPoint {
  date: string;
  /** Total portfolio value in EUR. */
  value: number;
  /** Total FIFO cost basis in EUR. */
  invested: number;
  positions: Record<string, ChartPositionSlice>;
}

export interface BenchmarkPoint {
  date: string;
  value: number;
}

export interface Position {
  ticker: string;
  label: string;
  yahoo: string;
  currency: string;
  shares: number;
  avgCost: number;      // average cost per share in EUR
  /** Avg cost per share in the trading currency (GBX in pence), FIFO over open lots. Server-computed. */
  avgCostNative?: number | null;
  /** FIFO realized P&L for this ticker in EUR. */
  realizedPl?: number;
  costEur: number;      // total cost in EUR
  value: number;        // current value in EUR
  pl: number;           // unrealised P&L in EUR
  plPct: number;        // unrealised P&L %
  dayPl?: number;
  dayPlPct?: number;
  isin?: string;
}

export interface RiskMetrics {
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  beta: number | null;
  calmar: number | null;
}

export interface RollingReturnEntry {
  portfolio: number | null;
  vwce: number | null;
  sp500: number | null;
}

export type RollingReturns = Record<string, RollingReturnEntry | null>;

export interface AnnualPl {
  year: string;
  realizedPl: number;
  dividends: number;
  total: number;
}

export interface WatchlistEntry {
  ticker: string;
  yahoo: string;
  label?: string;
}

/**
 * Ticker metadata as emitted by the server (buildMeta in
 * server/domain/positions.js merges transactions + ticker_meta.json).
 */
export interface TickerMeta {
  yahoo?: string;
  label?: string;
  currency?: string;
  quoteType?: string | null;
  sector?: string | null;
  industry?: string | null;
  geo?: string | null;
  isin?: string;
  manualPriceEur?: number | null;
  manualPriceAsOf?: string | null;
}

export interface PortfolioResponse {
  chartData: ChartPoint[];
  benchmarkData: BenchmarkPoint[];
  sp500Data: BenchmarkPoint[];
  meta: Record<string, TickerMeta>;
  currentTickers: string[];
  latestFxRate: number | null;
  positions: Position[];
  riskMetrics: RiskMetrics | null;
  rollingReturns: RollingReturns;
  realizedPl: number;
  realizedPlPerTicker: Record<string, number>;
  totalInvested: number;
  totalDividends: number;
  dividendsPerTicker: Record<string, number>;
  annualPl: AnnualPl[];
  watchlistData: WatchlistEntry[];
  usdExposurePct: number;
  currencyExposure: Record<string, number>;
  baseCurrency: string;
  twrPct: number | null;
  irrPct: number | null;
}
