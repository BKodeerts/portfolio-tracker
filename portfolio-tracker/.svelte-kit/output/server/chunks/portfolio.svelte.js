import { f as derived } from "./renderer.js";
import { P as PRESET_COLORS, C as COLOR_PALETTE } from "./constants.js";
const assigned = {};
let paletteIdx = 0;
function getColor(ticker) {
  if (!assigned[ticker]) {
    assigned[ticker] = PRESET_COLORS[ticker] ?? COLOR_PALETTE[paletteIdx++ % COLOR_PALETTE.length] ?? "#818cf8";
  }
  return assigned[ticker];
}
function seedColors(colors) {
  for (const [ticker, color] of Object.entries(colors)) {
    assigned[ticker] = color;
  }
}
async function apiFetch(path, init) {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}
async function fetchPortfolio() {
  return apiFetch("/api/portfolio");
}
async function fetchTransactions() {
  const body = await apiFetch("/api/transactions");
  return body.data;
}
async function fetchBonus() {
  const body = await apiFetch("/api/bonus");
  return body.data;
}
function createPortfolioStore() {
  let chartData = [];
  let benchmarkData = [];
  let sp500Data = [];
  let positions = [];
  let rawTransactions = [];
  let tickerMeta = {};
  let currentTickers = [];
  let latestFxRate = null;
  let riskMetrics = null;
  let rollingReturns = [];
  let realizedPl = 0;
  let realizedPlPerTicker = {};
  let totalInvested = 0;
  let totalDividends = 0;
  let dividendsPerTicker = {};
  let annualPl = [];
  let watchlistData = [];
  let usdExposurePct = 0;
  let currencyExposure = {};
  let baseCurrency = "EUR";
  let twrPct = null;
  let irrPct = null;
  let activeBenchmark = "vwce";
  let bonusItems = [];
  let loaded = false;
  let loading = false;
  let error = null;
  let posSort = { col: "value", dir: "desc" };
  async function load() {
    if (loading) return;
    loading = true;
    error = null;
    try {
      const [portfolio, txs, bonus] = await Promise.all([
        fetchPortfolio(),
        fetchTransactions(),
        fetchBonus().catch(() => [])
      ]);
      applyPortfolio(portfolio);
      rawTransactions = txs;
      bonusItems = bonus;
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }
  function applyPortfolio(p) {
    chartData = p.chartData;
    benchmarkData = p.benchmarkData;
    sp500Data = p.sp500Data;
    positions = p.positions;
    tickerMeta = p.meta;
    currentTickers = p.currentTickers;
    latestFxRate = p.latestFxRate;
    riskMetrics = p.riskMetrics;
    rollingReturns = p.rollingReturns;
    realizedPl = p.realizedPl;
    realizedPlPerTicker = p.realizedPlPerTicker;
    totalInvested = p.totalInvested;
    totalDividends = p.totalDividends;
    dividendsPerTicker = p.dividendsPerTicker;
    annualPl = p.annualPl;
    watchlistData = p.watchlistData;
    usdExposurePct = p.usdExposurePct;
    currencyExposure = p.currencyExposure;
    baseCurrency = p.baseCurrency;
    twrPct = p.twrPct;
    irrPct = p.irrPct;
    const colors = {};
    for (const pos of p.positions) {
    }
    seedColors(colors);
  }
  function sortPositions(col) {
    if (posSort.col === col) {
      posSort.dir = posSort.dir === "asc" ? "desc" : "asc";
    } else {
      posSort = { col, dir: "desc" };
    }
  }
  const sortedPositions = derived(() => () => {
    const { col, dir } = posSort;
    return [...positions].sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (col === "ticker") {
        av = a.ticker;
        bv = b.ticker;
      }
      if (col === "value") {
        av = a.value;
        bv = b.value;
      }
      if (col === "pl") {
        av = a.pl;
        bv = b.pl;
      }
      if (col === "plPct") {
        av = a.plPct;
        bv = b.plPct;
      }
      if (col === "dayPl") {
        av = a.dayPl ?? 0;
        bv = b.dayPl ?? 0;
      }
      if (col === "cost") {
        av = a.costEur;
        bv = b.costEur;
      }
      if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === "asc" ? av - bv : bv - av;
    });
  });
  return {
    get chartData() {
      return chartData;
    },
    get benchmarkData() {
      return benchmarkData;
    },
    get sp500Data() {
      return sp500Data;
    },
    get positions() {
      return positions;
    },
    get rawTransactions() {
      return rawTransactions;
    },
    get tickerMeta() {
      return tickerMeta;
    },
    get currentTickers() {
      return currentTickers;
    },
    get latestFxRate() {
      return latestFxRate;
    },
    get riskMetrics() {
      return riskMetrics;
    },
    get rollingReturns() {
      return rollingReturns;
    },
    get realizedPl() {
      return realizedPl;
    },
    get realizedPlPerTicker() {
      return realizedPlPerTicker;
    },
    get totalInvested() {
      return totalInvested;
    },
    get totalDividends() {
      return totalDividends;
    },
    get dividendsPerTicker() {
      return dividendsPerTicker;
    },
    get annualPl() {
      return annualPl;
    },
    get watchlistData() {
      return watchlistData;
    },
    get usdExposurePct() {
      return usdExposurePct;
    },
    get currencyExposure() {
      return currencyExposure;
    },
    get baseCurrency() {
      return baseCurrency;
    },
    get twrPct() {
      return twrPct;
    },
    get irrPct() {
      return irrPct;
    },
    get activeBenchmark() {
      return activeBenchmark;
    },
    get bonusItems() {
      return bonusItems;
    },
    get loaded() {
      return loaded;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get posSort() {
      return posSort;
    },
    get sortedPositions() {
      return sortedPositions()();
    },
    set activeBenchmark(v) {
      activeBenchmark = v;
    },
    set rawTransactions(v) {
      rawTransactions = v;
    },
    set bonusItems(v) {
      bonusItems = v;
    },
    set tickerMeta(v) {
      tickerMeta = v;
    },
    load,
    sortPositions,
    applyPortfolio
  };
}
const portfolioStore = createPortfolioStore();
export {
  apiFetch as a,
  getColor as g,
  portfolioStore as p
};
