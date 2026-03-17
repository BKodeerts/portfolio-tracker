export const state = {
  RAW_TRANSACTIONS: [],
  TICKER_META: {},
  CURRENT_TICKERS: [],
  COLORS: {},

  latestFxRate: null,
  chartData: [],
  benchmarkData: [],

  riskMetrics:         null,
  rollingReturns:      null,
  realizedPl:          0,
  realizedPlPerTicker: {},
  usdExposurePct:      0,
  twrPct:              null,
  irrPct:              null,

  // Ticker metadata (sector, geo, manual price) — loaded from /api/ticker-meta
  tickerMeta: {},

  intradayData: {},
  intradayLoaded: false,
  liveEurUsd: null,
  parsedCSVRows: [],

  currentTab: 'portefeuille',
  currentView: 'total',
  currentPeriod: '1d',
  analysePeriod: '1y',
  showClosed: false,
  chartInstances: {},
  posSort: { col: 'value', dir: 'desc' },
  lastLatest: {},

  privacyMode: localStorage.getItem('privacy') === '1',
  currentTheme: localStorage.getItem('theme') || 'default',
};
