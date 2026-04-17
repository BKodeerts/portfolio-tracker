export interface ChartPoint {
  date: string;
  value: number;
  invested?: number;
  // per-ticker values keyed by ticker symbol
  [ticker: string]: number | string | undefined;
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

export interface RollingReturn {
  period: string;
  portfolio: number | null;
  benchmark: number | null;
  sp500: number | null;
}

export interface AnnualPl {
  year: number;
  pl: number;
  invested: number;
}

export interface WatchlistEntry {
  ticker: string;
  yahoo: string;
  label?: string;
}

export interface TickerMeta {
  sector?: string;
  industry?: string;
  assetType?: string;
  geo?: string;
  manualPrice?: number;
  [key: string]: unknown;
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
  rollingReturns: RollingReturn[];
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
