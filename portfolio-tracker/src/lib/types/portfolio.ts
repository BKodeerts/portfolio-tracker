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
  /**
   * Flow-adjusted return index (base 100 at inception), server-computed
   * (computeReturnIndex): deposits/withdrawals never move it, so re-basing
   * two rows gives the TWR between them.
   */
  returnIndex: number;
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
  /** Not emitted by the current server — live day P&L comes from the intraday store. */
  dayPl?: number;
  /** Not emitted by the current server — live day % comes from the intraday store. */
  dayPlPct?: number;
  isin?: string;
}

/** Mirrors computeRiskMetrics in server/domain/performance.js. */
export interface RiskMetrics {
  /** Annualized std dev of daily flow-adjusted returns, %. */
  volatility: number | null;
  /** Annualized (TWR-consistent) return, %. */
  annualReturn: number | null;
  sharpe: number | null;
  sortino: number | null;
  beta: number | null;
  /** Largest peak-to-trough decline of the return index, positive %. */
  maxDrawdownPct: number | null;
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

/* ── Belgian capital gains tax (meerwaardebelasting) — mirrors server/domain/tax.js ── */

export interface TaxSale {
  date: string;
  year: number;
  ticker: string;
  shares: number;
  proceeds: number;
  basis: number;
  /** Which basis dominated the sold shares: 31/12/2025 "foto" value or purchase price. */
  basisType: 'foto' | 'aankoop';
  /** True when a pre-2026 lot used the actual purchase price because it was higher than the foto. */
  costAboveFoto: boolean;
  gain: number;
  withheld: number;
}

export interface TaxYear {
  year: number;
  exemption: number;
  sales: TaxSale[];
  gains: number;
  losses: number;
  net: number;
  used: number;
  taxable: number;
  tax: number;
  withheld: number;
  /** withheld − tax: >0 reclaim via aangifte, <0 still due. */
  balance: number;
  headroom: number;
}

export interface TaxSimPosition {
  ticker: string;
  basis: number;
  /** Latent taxable gain if sold today (current value − taxable basis). */
  gain: number;
  /** Which basis dominates the open shares: foto value or purchase price (post-2025 lots). */
  basisType: 'foto' | 'aankoop';
  /** True when the open lots use the purchase price because it is higher than the foto. */
  usesCost: boolean;
}

export interface TaxReport {
  rate: number;
  currentYear: number;
  household: 'individual' | 'couple';
  brokerWithholds: boolean;
  years: TaxYear[];
  simPositions: TaxSimPosition[];
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
  tax: TaxReport | null;
}
