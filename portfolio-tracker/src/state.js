export const state = {
  RAW_TRANSACTIONS: [],
  TICKER_META: {},
  CURRENT_TICKERS: [],
  COLORS: {},

  latestFxRate: null,
  chartData: [],
  benchmarkData: [],

  intradayData: {},
  intradayLoaded: false,
  liveEurUsd: null,
  parsedCSVRows: [],

  currentTab: 'portefeuille',
  currentView: 'total',
  currentPeriod: '1d',
  showClosed: false,
  chartInstances: {},
  posSort: { col: 'value', dir: 'desc' },
  lastLatest: {},

  privacyMode: localStorage.getItem('privacy') === '1',
  currentTheme: localStorage.getItem('theme') || 'default',
};
