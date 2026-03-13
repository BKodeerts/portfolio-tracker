export const state = {
  RAW_TRANSACTIONS: [],
  TICKER_META: {},
  CURRENT_TICKERS: [],
  COLORS: {},

  fxRateMap: {},
  priceMaps: {},
  sortedDates: [],
  chartData: [],
  benchmarkData: [],

  intradayData: {},
  intradayLoaded: false,
  liveEurUsd: null,
  parsedCSVRows: [],

  currentTab: 'portefeuille',
  currentView: 'total',
  currentPeriod: '3m',
  showClosed: false,
  chartInstances: {},

  privacyMode: localStorage.getItem('privacy') === '1',
  currentTheme: localStorage.getItem('theme') || 'default',
};
