import type { PortfolioResponse, Position, ChartPoint, BenchmarkPoint, RiskMetrics, RollingReturn, AnnualPl, WatchlistEntry, TickerMeta } from '$lib/types/portfolio';
import type { Transaction } from '$lib/types/transaction';
import type { BonusItem } from '$lib/types/bonus';
import { fetchPortfolio, fetchTransactions } from '$lib/api/portfolio';
import { fetchBonus } from '$lib/api/bonus';

type SortCol = 'value' | 'pl' | 'plPct' | 'dayPl' | 'cost' | 'ticker';
type SortDir = 'asc' | 'desc';

function createPortfolioStore() {
  // ── Raw data from /api/portfolio ──
  let chartData        = $state<ChartPoint[]>([]);
  let benchmarkData    = $state<BenchmarkPoint[]>([]);
  let sp500Data        = $state<BenchmarkPoint[]>([]);
  let positions        = $state<Position[]>([]);
  let rawTransactions  = $state<Transaction[]>([]);
  let tickerMeta       = $state<Record<string, TickerMeta>>({});
  let currentTickers   = $state<string[]>([]);
  let latestFxRate     = $state<number | null>(null);
  let riskMetrics      = $state<RiskMetrics | null>(null);
  let rollingReturns   = $state<RollingReturn[]>([]);
  let realizedPl       = $state(0);
  let realizedPlPerTicker = $state<Record<string, number>>({});
  let totalInvested    = $state(0);
  let totalDividends   = $state(0);
  let dividendsPerTicker = $state<Record<string, number>>({});
  let annualPl         = $state<AnnualPl[]>([]);
  let watchlistData    = $state<WatchlistEntry[]>([]);
  let usdExposurePct   = $state(0);
  let currencyExposure = $state<Record<string, number>>({});
  let baseCurrency     = $state('EUR');
  let twrPct           = $state<number | null>(null);
  let irrPct           = $state<number | null>(null);
  let activeBenchmark  = $state<'vwce' | 'sp500' | 'both'>('vwce');
  let bonusItems       = $state<BonusItem[]>([]);

  // Loading state
  let loaded  = $state(false);
  let loading = $state(false);
  let error   = $state<string | null>(null);

  // Sort state for positions table
  let posSort = $state<{ col: SortCol; dir: SortDir }>({ col: 'value', dir: 'desc' });

  async function load() {
    if (loading) return;
    loading = true;
    error = null;
    try {
      const [portfolio, txs, bonus] = await Promise.all([
        fetchPortfolio(),
        fetchTransactions(),
        fetchBonus().catch(() => [] as BonusItem[]),
      ]);
      if (portfolio) applyPortfolio(portfolio);
      rawTransactions = txs;
      bonusItems = bonus;
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function applyPortfolio(p: PortfolioResponse) {
    chartData        = p.chartData;
    benchmarkData    = p.benchmarkData;
    sp500Data        = p.sp500Data;
    positions        = p.positions;
    tickerMeta       = p.meta;
    currentTickers   = p.currentTickers;
    latestFxRate     = p.latestFxRate;
    riskMetrics      = p.riskMetrics;
    rollingReturns   = p.rollingReturns;
    realizedPl       = p.realizedPl;
    realizedPlPerTicker = p.realizedPlPerTicker;
    totalInvested    = p.totalInvested;
    totalDividends   = p.totalDividends;
    dividendsPerTicker = p.dividendsPerTicker;
    annualPl         = p.annualPl;
    watchlistData    = p.watchlistData;
    usdExposurePct   = p.usdExposurePct;
    currencyExposure = p.currencyExposure;
    baseCurrency     = p.baseCurrency;
    twrPct           = p.twrPct;
    irrPct           = p.irrPct;
  }

  function sortPositions(col: SortCol) {
    if (posSort.col === col) {
      posSort.dir = posSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      posSort = { col, dir: 'desc' };
    }
  }

  const sortedPositions = $derived(() => {
    const { col, dir } = posSort;
    return [...positions].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (col === 'ticker')  { av = a.ticker;  bv = b.ticker; }
      if (col === 'value')   { av = a.value;   bv = b.value; }
      if (col === 'pl')      { av = a.pl;      bv = b.pl; }
      if (col === 'plPct')   { av = a.plPct;   bv = b.plPct; }
      if (col === 'dayPl')   { av = a.dayPl ?? 0;  bv = b.dayPl ?? 0; }
      if (col === 'cost')    { av = a.costEur;  bv = b.costEur; }
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return dir === 'asc' ? av - (bv as number) : (bv as number) - av;
    });
  });

  return {
    get chartData()         { return chartData; },
    get benchmarkData()     { return benchmarkData; },
    get sp500Data()         { return sp500Data; },
    get positions()         { return positions; },
    get rawTransactions()   { return rawTransactions; },
    get tickerMeta()        { return tickerMeta; },
    get currentTickers()    { return currentTickers; },
    get latestFxRate()      { return latestFxRate; },
    get riskMetrics()       { return riskMetrics; },
    get rollingReturns()    { return rollingReturns; },
    get realizedPl()        { return realizedPl; },
    get realizedPlPerTicker() { return realizedPlPerTicker; },
    get totalInvested()     { return totalInvested; },
    get totalDividends()    { return totalDividends; },
    get dividendsPerTicker() { return dividendsPerTicker; },
    get annualPl()          { return annualPl; },
    get watchlistData()     { return watchlistData; },
    get usdExposurePct()    { return usdExposurePct; },
    get currencyExposure()  { return currencyExposure; },
    get baseCurrency()      { return baseCurrency; },
    get twrPct()            { return twrPct; },
    get irrPct()            { return irrPct; },
    get activeBenchmark()   { return activeBenchmark; },
    get bonusItems()        { return bonusItems; },
    get loaded()            { return loaded; },
    get loading()           { return loading; },
    get error()             { return error; },
    get posSort()           { return posSort; },
    get sortedPositions()   { return sortedPositions(); },
    set activeBenchmark(v: 'vwce' | 'sp500' | 'both') { activeBenchmark = v; },
    set rawTransactions(v: Transaction[]) { rawTransactions = v; },
    set bonusItems(v: BonusItem[]) { bonusItems = v; },
    set tickerMeta(v: Record<string, TickerMeta>) { tickerMeta = v; },
    load,
    sortPositions,
    applyPortfolio,
  };
}

export const portfolioStore = createPortfolioStore();
