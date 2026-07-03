/**
 * Portfolio calculation engine — I/O orchestration layer.
 * Shared between the API route, HA route, and scheduler.
 * Pure money math lives in server/domain/ (fx, positions, performance, series).
 */

const fs   = require('node:fs');
const path = require('node:path');
const { fetchDailyQuote, fetchCandles, fetchIntraday, fetchQuoteSummary, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, readStaleCache, writeCache, QUOTES_CACHE_TTL, CACHE_TTL, INTRADAY_CACHE_TTL } = require('./cache.js');
const { getOptions } = require('./ha-helper.js');

const { FX_DEFS, FX_FALLBACK, toEurAtRate, nonEurCurrencies, fxSymbolsFor } = require('./domain/fx.js');
const {
  buildMeta: buildMetaPure,
  buildManualPricesMap,
  findEarliestDate,
  buildPriceMaps,
  buildFxRateMaps,
  detectSplitFactors,
  makeAdjShares,
  computeNetShares,
  isDividend,
  computeDividends,
  fifoCostNativeEur,
  fifoAvgCostNative,
  fifoCostBasis,
  computeRealizedPl,
} = require('./domain/positions.js');
const {
  computeRiskMetrics,
  computeRollingReturns,
  computeAnnualPl,
  computeXIRR,
  computeServerTWR,
} = require('./domain/performance.js');
const {
  BENCHMARK_SYM,
  SP500_SYM,
  buildChartData,
  buildBenchmarkData,
  getPrevTradingDate,
  valueAtDate,
  buildSnapshotPositions,
} = require('./domain/series.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const TICKER_META_FILE  = path.join(DATA_DIR, 'ticker_meta.json');
const STATE_FILE        = path.join(DATA_DIR, 'portfolio_state.json');

const FX_SYMBOL = 'EURUSD=X';  // backward compat (HA/MQTT)

// ── Data access ───────────────────────────────────────────────────────────────

function loadTransactions() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
  } catch (e) {
    console.error('[Portfolio] transactions.json is corrupt — cannot parse JSON:', e.message);
    return [];
  }
  if (!Array.isArray(raw)) {
    console.error('[Portfolio] transactions.json must be an array, got:', typeof raw);
    return [];
  }
  // Validate each entry has required fields; skip malformed rows with a warning
  const valid = [];
  for (const tx of raw) {
    if (!tx || typeof tx !== 'object') { console.warn('[Portfolio] Skipping non-object transaction:', tx); continue; }
    if (!tx.date || !tx.ticker || tx.shares === undefined || tx.costEur === undefined) {
      console.warn('[Portfolio] Skipping transaction with missing required fields:', JSON.stringify(tx));
      continue;
    }
    valid.push(tx);
  }
  if (valid.length !== raw.length) {
    console.warn(`[Portfolio] ${raw.length - valid.length} transaction(s) skipped due to missing required fields`);
  }
  return valid;
}

function loadTickerMeta() {
  try {
    const raw = JSON.parse(fs.readFileSync(TICKER_META_FILE, 'utf8'));
    if (typeof raw !== 'object' || Array.isArray(raw) || raw === null) {
      console.warn('[Portfolio] ticker_meta.json has unexpected format — using empty metadata');
      return {};
    }
    return raw;
  } catch {
    return {};
  }
}

/** Build ticker metadata from transactions + persisted ticker_meta.json. */
function buildMeta(transactions) {
  return buildMetaPure(transactions, loadTickerMeta());
}

async function getQuote(yahooSymbol) {
  const cacheKey = `quote_${yahooSymbol}`;
  const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
  if (cached) return cached;
  try {
    const q = await fetchDailyQuote(yahooSymbol);
    if (q) writeCache(cacheKey, q);
    await sleep(FETCH_DELAY);
    return q || null;
  } catch (e) {
    const stale = readStaleCache(cacheKey);
    console.warn(`[QUOTE] ${yahooSymbol}: fetch failed (${e.code || e.message})${stale ? ', using stale cache' : ', no cache'}`);
    return stale || null;
  }
}

async function getIntradayPrice(yahooSymbol) {
  const cacheKey = `intraday_snap_${yahooSymbol}`;
  const cached = readCache(cacheKey, INTRADAY_CACHE_TTL);
  if (cached != null) return cached;
  try {
    const data = await fetchIntraday(yahooSymbol);
    if (!data?.points.length) return null;
    const close = data.points[data.points.length - 1].close;
    writeCache(cacheKey, close);
    if (data.marketState === 'CLOSED') writeCache(`eod_intraday_${yahooSymbol}`, data);
    await sleep(FETCH_DELAY);
    return close;
  } catch {
    return null;
  }
}

async function getLivePrices(yahooSymbols, manualPrices = {}) {
  const prices = {};
  for (const sym of yahooSymbols) {
    if (manualPrices[sym]) {
      prices[sym] = manualPrices[sym].eur;
    } else {
      const live = await getIntradayPrice(sym);
      prices[sym] = live ?? (await getQuote(sym))?.close ?? null;
    }
  }
  return prices;
}

async function getRawCandles(yahooSymbol, fromDate) {
  const cached = readCache(yahooSymbol, CACHE_TTL);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  try {
    const candles = await fetchCandles(yahooSymbol, fromDate);
    if (candles) writeCache(yahooSymbol, candles);
    await sleep(FETCH_DELAY);
    return candles || [];
  } catch (e) {
    const stale = readStaleCache(yahooSymbol);
    console.warn(`[CANDLES] ${yahooSymbol}: fetch failed (${e.code || e.message})${stale ? ', using stale cache' : ', no cache'}`);
    return stale || [];
  }
}

/**
 * Append today's row using daily quotes if newer than last candle date.
 */
async function appendTodaySnapshot(chartData, meta, transactions, fxMaps, adjSharesFn) {
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];

  // Fetch all quotes in parallel
  const currencies = nonEurCurrencies(meta);
  const uniqueFxSymbols = [...new Set(currencies.map(c => FX_DEFS[c]?.symbol).filter(Boolean))];
  const allQuoteSymbols = [...new Set([...yahooSymbols, ...uniqueFxSymbols])];

  const quoteResults = Object.fromEntries(
    await Promise.all(allQuoteSymbols.map(async sym => [sym, await getQuote(sym)])),
  );

  const prices = {};
  let todayDate = null;
  for (const sym of yahooSymbols) {
    const m = Object.values(meta).find(x => x.yahoo === sym);
    if (m?.manualPriceEur) {
      prices[sym] = m.manualPriceEur;
      if (!todayDate) todayDate = new Date().toISOString().slice(0, 10);
    } else {
      const q = quoteResults[sym];
      if (q) {
        prices[sym] = q.close;
        if (!todayDate) todayDate = q.date;
      }
    }
  }

  // Build live FX rates from already-fetched quotes
  const liveRates = {};
  for (const ccy of currencies) {
    const def = FX_DEFS[ccy];
    if (!def) continue;
    const lastHistorical = Object.values(fxMaps[ccy] || {}).at(-1) || def.fallback;
    const rate = quoteResults[def.symbol]?.close || lastHistorical;
    liveRates[ccy] = rate;
  }

  if (!todayDate || todayDate <= (chartData.at(-1)?.date || '')) return chartData;

  const txByTicker = {};
  for (const tx of transactions) {
    (txByTicker[tx.ticker] = txByTicker[tx.ticker] || []).push(tx);
  }

  const rowPositions = {};
  let tv = 0, tc = 0;

  for (const [ticker, txs] of Object.entries(txByTicker)) {
    const m = meta[ticker];
    let sh = 0;
    for (const t of txs) {
      if (t.date <= todayDate && !isDividend(t)) sh += adjSharesFn(t, ticker);
    }
    const price = prices[m.yahoo];
    if (sh > 0 && price) {
      const val  = toEurAtRate(m.currency, sh * price, liveRates);
      const cost = fifoCostBasis(txs, ticker, todayDate, adjSharesFn);
      rowPositions[ticker] = { value: Math.round(val), cost: Math.round(cost), shares: sh };
      tv += val;
      tc += cost;
    }
  }

  if (tv > 0) {
    chartData.push({
      date:     todayDate,
      value:    Math.round(tv),
      invested: Math.round(tc),
      positions: rowPositions,
    });
  }
  return chartData;
}

/**
 * Fetch watchlist prices (close + 52w data).
 */
async function fetchWatchlistPrices(symbols) {
  const result = [];
  for (const sym of symbols) {
    const q = await getQuote(sym);
    if (!q) continue;
    result.push({
      symbol:      sym,
      ticker:      sym,
      yahoo:       sym,
      label:       sym,
      price:       q.close,
      high52:      q.fiftyTwoWeekHigh,
      low52:       q.fiftyTwoWeekLow,
      change1dPct: q.change1dPct,
    });
  }
  return result;
}

/**
 * Persist analytics fields to state file so the scheduler can surface them as HA sensors.
 */
function writeAnalyticsState(patch) {
  try {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* new file */ }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, ...patch }, null, 2));
  } catch (e) {
    console.warn('[Portfolio] Could not write analytics state:', e.message);
  }
}

// ── Main computation functions ────────────────────────────────────────────────

/**
 * Full portfolio computation for the API endpoint.
 */
async function computeFullPortfolio() {
  const transactions = loadTransactions();
  if (!transactions.length) return null;

  const meta         = buildMeta(transactions);
  const manualPrices = buildManualPricesMap(meta);
  const earliestDate = findEarliestDate(transactions);
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];
  // Skip Yahoo fetch for manually-priced symbols
  const fetchSymbols = yahooSymbols.filter(sym => !Object.values(manualPrices).length ||
    !Object.values(meta).find(m => m.yahoo === sym && m.manualPriceEur));
  const currencies   = nonEurCurrencies(meta);
  const neededFxSyms = fxSymbolsFor(currencies);
  const allSymbols   = [...new Set([...fetchSymbols, FX_SYMBOL, ...neededFxSyms, BENCHMARK_SYM, SP500_SYM])];

  // Fetch all candles in parallel (each symbol is independently cached)
  const rawCandles = Object.fromEntries(
    await Promise.all(allSymbols.map(async sym => [sym, await getRawCandles(sym, earliestDate)])),
  );
  for (const sym of yahooSymbols) {
    if (!rawCandles[sym]) rawCandles[sym] = [];
  }

  const allDates = new Set();
  for (const candles of Object.values(rawCandles)) {
    for (const c of candles) allDates.add(c.date);
  }
  for (const tx of transactions) allDates.add(tx.date);
  const sortedDates = [...allDates].sort();

  const priceMaps = buildPriceMaps(rawCandles, sortedDates, manualPrices);
  // Always include USD in fxMaps for backward compat (SP500 benchmark conversion)
  const fxMaps    = buildFxRateMaps(rawCandles, sortedDates, ['USD', ...currencies]);
  // Legacy scalar getter for buildBenchmarkData (SP500 is USD)
  const fxMap     = fxMaps.USD || {};

  const splitFactors = detectSplitFactors(meta, transactions, priceMaps, fxMaps);
  const adjSharesFn  = makeAdjShares(meta, priceMaps, splitFactors, fxMaps);

  let chartData = buildChartData(meta, transactions, priceMaps, fxMaps, sortedDates, adjSharesFn);
  chartData = await appendTodaySnapshot(chartData, meta, transactions, fxMaps, adjSharesFn);

  const benchmarkData  = buildBenchmarkData(priceMaps, chartData, BENCHMARK_SYM);
  const sp500Data      = buildBenchmarkData(priceMaps, chartData, SP500_SYM, fxMap);
  const { netShares }  = computeNetShares(meta, transactions, adjSharesFn);
  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  const latestFxRate   = fxMap[sortedDates.at(-1)] || FX_FALLBACK;

  // Build per-ticker transaction map for realized P&L
  const txByTicker = {};
  for (const tx of transactions) {
    (txByTicker[tx.ticker] = txByTicker[tx.ticker] || []).push(tx);
  }
  const { perTicker: realizedPlPerTicker, total: realizedPl } = computeRealizedPl(txByTicker, adjSharesFn);
  const { perTicker: dividendsPerTicker, total: totalDividends } = computeDividends(txByTicker);
  const annualPl = computeAnnualPl(txByTicker, adjSharesFn);

  // Summary positions from the latest chartData row
  const latest = chartData.at(-1);
  const positions = latest
    ? currentTickers.map(ticker => {
        const slice   = latest.positions[ticker];
        const value   = slice?.value  || 0;
        const costEur = slice?.cost   || 0;
        const shares  = slice?.shares || 0;
        return {
          ticker,
          label:      meta[ticker].label,
          yahoo:      meta[ticker].yahoo,
          currency:   meta[ticker].currency || 'EUR',
          value,
          costEur,
          avgCost:    shares > 0 ? costEur / shares : 0,
          // Average cost per share in the trading currency (GBX in pence), FIFO over open lots
          avgCostNative: fifoAvgCostNative(txByTicker[ticker] || [], ticker, adjSharesFn, fxMaps, meta[ticker].currency || 'EUR'),
          pl:         value - costEur,
          plPct:      costEur > 0 ? Number.parseFloat((((value - costEur) / costEur) * 100).toFixed(1)) : 0,
          shares,
          realizedPl: realizedPlPerTicker[ticker] || 0,
        };
      })
    : [];

  // Enrich positions with 52w data + auto-populate quoteType/sector in ticker_meta (parallel)
  const tickerMetaLive = loadTickerMeta();
  let tickerMetaChanged = false;

  await Promise.all(positions.map(async pos => {
    const yahooSym = meta[pos.ticker].yahoo;
    const q = await getQuote(yahooSym);
    pos.high52 = q?.fiftyTwoWeekHigh ?? null;
    pos.low52  = q?.fiftyTwoWeekLow  ?? null;
    pos.pe     = q?.trailingPE       ?? null;

    const ccy = meta[pos.ticker].currency;
    if (ccy && ccy !== 'EUR' && FX_DEFS[ccy] && fxMaps[ccy]) {
      const nativeEur = fifoCostNativeEur(txByTicker[pos.ticker] || [], pos.ticker, adjSharesFn, fxMaps, ccy, sortedDates.at(-1));
      pos.fxPl = nativeEur != null ? Math.round((nativeEur - pos.costEur) * 100) / 100 : null;
    } else {
      pos.fxPl = null;
    }

    const tm = tickerMetaLive[pos.ticker] || {};

    // Auto-populate quoteType + sector via search (cached 7 days)
    if (!tm.quoteType || !tm.sector) {
      const summaryKey = `summary_${yahooSym}`;
      let summary = readCache(summaryKey, 7 * 24 * 60 * 60 * 1000);
      if (!summary) {
        try {
          summary = await fetchQuoteSummary(yahooSym);
          if (summary) writeCache(summaryKey, summary);
        } catch (e) {
          console.warn(`[SUMMARY] ${yahooSym}: ${e.message}`);
        }
      }
      if (summary) {
        const patch = { ...(tickerMetaLive[pos.ticker] || tm) };
        if (!tm.quoteType && summary.quoteType) { patch.quoteType = summary.quoteType; meta[pos.ticker].quoteType = summary.quoteType; }
        if (!tm.sector    && summary.sector)    { patch.sector    = summary.sector;    meta[pos.ticker].sector    = summary.sector; }
        if (!tm.industry  && summary.industry)  { patch.industry  = summary.industry;  meta[pos.ticker].industry  = summary.industry; }
        tickerMetaLive[pos.ticker] = patch;
        tickerMetaChanged = true;
      }
    }
  }));

  if (tickerMetaChanged) {
    fs.writeFileSync(TICKER_META_FILE, JSON.stringify(tickerMetaLive, null, 2));
  }

  // Currency exposure per currency
  const totalValue = latest?.value || 0;
  const currencyExposure = {};
  for (const pos of positions) {
    const ccy = meta[pos.ticker].currency || 'EUR';
    currencyExposure[ccy] = (currencyExposure[ccy] || 0) + pos.value;
  }
  for (const ccy of Object.keys(currencyExposure)) {
    currencyExposure[ccy] = totalValue > 0
      ? Number.parseFloat((currencyExposure[ccy] / totalValue * 100).toFixed(1))
      : 0;
  }
  // Backward compat
  const usdExposurePct = currencyExposure.USD ?? 0;

  // Watchlist (symbols from HA options config)
  const { watchlist: watchlistSymbols } = getOptions();
  const watchlistData = watchlistSymbols?.length ? await fetchWatchlistPrices(watchlistSymbols) : [];

  // Analytics
  const riskMetrics    = computeRiskMetrics(chartData, benchmarkData);
  const twrPct         = computeServerTWR(chartData, transactions);
  const rollingReturns = computeRollingReturns(chartData, benchmarkData, sp500Data, twrPct);
  const irrPct         = computeXIRR(transactions, totalValue);

  // Persist analytics + inception data for HA scheduler
  // Net capital deployed = buys minus sale proceeds (excludes dividends)
  const totalInvested = transactions
    .filter(tx => tx.type !== 'dividend')
    .reduce((s, tx) => s + (tx.shares > 0 ? tx.costEur : -tx.costEur), 0);
  writeAnalyticsState({
    twrPct, irrPct, riskMetrics,
    inceptionDate:  findEarliestDate(transactions),
    totalInvested:  Math.round(totalInvested * 100) / 100,
  });

  return {
    chartData, benchmarkData, sp500Data, meta, currentTickers, latestFxRate, positions,
    realizedPl, realizedPlPerTicker, usdExposurePct, currencyExposure,
    totalDividends, dividendsPerTicker, annualPl,
    totalInvested: Math.round(totalInvested * 100) / 100,
    watchlistData,
    riskMetrics, rollingReturns, twrPct, irrPct,
  };
}

/**
 * Lightweight current-value snapshot for the scheduler / HA push.
 * options.watchlist: string[] — optional watchlist symbols to fetch.
 */
async function computeCurrentSnapshot(options = {}) {
  const transactions = loadTransactions();
  if (!transactions.length) return null;

  const meta         = buildMeta(transactions);
  const manualPrices = buildManualPricesMap(meta);
  const earliestDate = findEarliestDate(transactions);
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];
  const fetchSymbols = yahooSymbols.filter(sym =>
    !Object.values(meta).find(m => m.yahoo === sym && m.manualPriceEur));

  const currencies   = nonEurCurrencies(meta);
  const neededFxSyms = fxSymbolsFor(currencies);

  // Fetch live FX rates for all non-EUR currencies
  const liveRates = {};
  const seenFxSymbols = new Set();
  for (const ccy of ['USD', ...currencies]) {
    const def = FX_DEFS[ccy];
    if (!def || seenFxSymbols.has(def.symbol)) continue;
    seenFxSymbols.add(def.symbol);
    const rate = (await getIntradayPrice(def.symbol)) ?? (await getQuote(def.symbol))?.close ?? def.fallback;
    for (const c of ['USD', ...currencies]) {
      if (FX_DEFS[c]?.symbol === def.symbol) liveRates[c] = rate;
    }
  }
  const uniqueSnapshotSyms = [...new Set([...fetchSymbols, ...neededFxSyms])];
  const rawCandles = Object.fromEntries(
    await Promise.all(uniqueSnapshotSyms.map(async sym => [sym, await getRawCandles(sym, earliestDate)])),
  );

  const allDates    = new Set();
  for (const candles of Object.values(rawCandles)) for (const c of candles) allDates.add(c.date);
  const sortedDates = [...allDates].sort();
  const priceMaps   = buildPriceMaps(rawCandles, sortedDates, manualPrices);
  const fxMaps      = buildFxRateMaps(rawCandles, sortedDates, ['USD', ...currencies]);

  const splitFactors = detectSplitFactors(meta, transactions, priceMaps, fxMaps);
  const adjSharesFn  = makeAdjShares(meta, priceMaps, splitFactors, fxMaps);

  const { netShares, buyInvested } = computeNetShares(meta, transactions, adjSharesFn);
  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  if (!currentTickers.length) return null;

  const prices = await getLivePrices(yahooSymbols, manualPrices);

  const { totalValue, totalCost, positions } = buildSnapshotPositions(
    currentTickers, meta, prices, netShares, buyInvested, liveRates,
  );

  if (!positions.length) return null;

  const prevDate  = getPrevTradingDate(priceMaps, fetchSymbols.length ? fetchSymbols : yahooSymbols);
  const prevValue = prevDate
    ? valueAtDate(currentTickers, meta, priceMaps, netShares, liveRates, prevDate)
    : totalValue;
  const dailyPl = totalValue - prevValue;

  // Realized P&L (no prices needed, just transaction arithmetic)
  const txByTicker = {};
  for (const tx of transactions) {
    (txByTicker[tx.ticker] = txByTicker[tx.ticker] || []).push(tx);
  }
  const { total: realizedPl } = computeRealizedPl(txByTicker, adjSharesFn);

  // Currency exposure
  const usdValue       = positions.filter(p => meta[p.ticker].currency === 'USD').reduce((s, p) => s + p.value, 0);
  const usdExposurePct = totalValue > 0 ? Number.parseFloat((usdValue / totalValue * 100).toFixed(1)) : 0;
  const currencyExposure = {};
  for (const pos of positions) {
    const ccy = meta[pos.ticker].currency || 'EUR';
    currencyExposure[ccy] = (currencyExposure[ccy] || 0) + pos.value;
  }
  for (const ccy of Object.keys(currencyExposure)) {
    currencyExposure[ccy] = totalValue > 0
      ? Number.parseFloat((currencyExposure[ccy] / totalValue * 100).toFixed(1))
      : 0;
  }

  // Watchlist
  const watchlistData = options.watchlist?.length
    ? await fetchWatchlistPrices(options.watchlist)
    : [];

  return { totalValue, totalCost, dailyPl, positions, realizedPl, usdExposurePct, currencyExposure, watchlistData };
}

module.exports = { computeFullPortfolio, computeCurrentSnapshot, FX_DEFS };
