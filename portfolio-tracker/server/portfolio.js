/**
 * Portfolio calculation engine.
 * Shared between the API route, HA route, and scheduler.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { fetchDailyQuote, fetchCandles, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, writeCache, QUOTES_CACHE_TTL, CACHE_TTL } = require('./cache.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

const FX_SYMBOL        = 'EURUSD=X';
const FX_FALLBACK      = 1.09;
const BENCHMARK_SYM    = 'VWCE.DE';
const SPLIT_CANDIDATES = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100];

// ── Data access ───────────────────────────────────────────────────────────────

function loadTransactions() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
}

function buildMeta(transactions) {
  const meta = {};
  for (const tx of transactions) {
    if (!meta[tx.ticker]) {
      meta[tx.ticker] = { yahoo: tx.yahoo, currency: tx.currency, label: tx.label || tx.ticker };
    }
  }
  return meta;
}

function findEarliestDate(transactions) {
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
}

async function getQuote(yahooSymbol) {
  const cacheKey = `quote_${yahooSymbol}`;
  const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
  if (cached) return cached;  // { date, close }
  const q = await fetchDailyQuote(yahooSymbol);
  if (q) writeCache(cacheKey, q);
  await sleep(FETCH_DELAY);
  return q || null;
}

async function getRawCandles(yahooSymbol, fromDate) {
  const cached = readCache(yahooSymbol, CACHE_TTL);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  const candles = await fetchCandles(yahooSymbol, fromDate);
  if (candles) writeCache(yahooSymbol, candles);
  await sleep(FETCH_DELAY);
  return candles || [];
}

// ── Price map construction ────────────────────────────────────────────────────

/**
 * Forward-fill price maps for all symbols over sortedDates.
 * rawCandles: { sym → [{ date, close }, ...] }
 */
function buildPriceMaps(rawCandles, sortedDates) {
  const priceMaps = {};
  for (const [sym, candles] of Object.entries(rawCandles)) {
    const m = {};
    for (const c of candles) m[c.date] = c.close;
    const filled = {};
    let last = null;
    for (const d of sortedDates) {
      if (m[d] != null) last = m[d];
      if (last != null) filled[d] = last;
    }
    priceMaps[sym] = filled;
  }
  return priceMaps;
}

/**
 * Forward-fill FX rate map over sortedDates.
 * fxCandles: [{ date, close }, ...]
 */
function buildFxRateMap(fxCandles, sortedDates) {
  const raw = {};
  for (const c of fxCandles) raw[c.date] = c.close;
  const fxMap = {};
  let last = FX_FALLBACK;
  for (const d of sortedDates) {
    if (raw[d] != null) last = raw[d];
    fxMap[d] = last;
  }
  return fxMap;
}

// ── Split detection & share adjustment ───────────────────────────────────────

function detectSplitFactors(meta, transactions, priceMaps, getFxRate) {
  const splitFactors = {};
  for (const ticker of Object.keys(meta)) {
    const m = meta[ticker];
    const firstBuy = transactions
      .filter(t => t.ticker === ticker && t.shares > 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!firstBuy) { splitFactors[ticker] = 1; continue; }
    const yahooPrice = priceMaps[m.yahoo]?.[firstBuy.date];
    if (!yahooPrice) { splitFactors[ticker] = 1; continue; }
    const fx = getFxRate(firstBuy.date);
    const txPrice = m.currency === 'USD'
      ? (firstBuy.costEur / firstBuy.shares) * fx
      : firstBuy.costEur / firstBuy.shares;
    const ratio = yahooPrice / txPrice;
    splitFactors[ticker] = ratio > 2
      ? SPLIT_CANDIDATES.reduce((best, f) => (Math.abs(f - ratio) < Math.abs(best - ratio) ? f : best), 1)
      : 1;
  }
  return splitFactors;
}

function makeAdjShares(meta, priceMaps, splitFactors, getFxRate) {
  return function adjShares(tx, ticker) {
    const factor = splitFactors[ticker] || 1;
    if (factor === 1) return tx.shares;
    const m = meta[ticker];
    const yahooPrice = priceMaps[m.yahoo]?.[tx.date];
    if (!yahooPrice) return tx.shares;
    const fx = getFxRate(tx.date);
    const txPrice = m.currency === 'USD'
      ? (Math.abs(tx.costEur) / Math.abs(tx.shares)) * fx
      : Math.abs(tx.costEur) / Math.abs(tx.shares);
    return yahooPrice / txPrice > 2 ? tx.shares / factor : tx.shares;
  };
}

function computeNetShares(meta, transactions, adjSharesFn) {
  const netShares = {}, buyInvested = {};
  for (const ticker of Object.keys(meta)) {
    let net = 0, invested = 0;
    for (const tx of transactions.filter(t => t.ticker === ticker)) {
      net += adjSharesFn(tx, ticker);
      if (tx.shares > 0) invested += tx.costEur;
    }
    netShares[ticker]   = net;
    buyInvested[ticker] = invested;
  }
  return { netShares, buyInvested };
}

// ── FIFO & chart data ─────────────────────────────────────────────────────────

/**
 * FIFO cost basis for a ticker up to a specific date.
 */
function fifoCostBasis(txs, ticker, upToDate, adjSharesFn) {
  const lots = [];
  for (const tx of txs.filter(t => t.date <= upToDate).sort((a, b) => a.date.localeCompare(b.date))) {
    const sh = adjSharesFn(tx, ticker);
    if (tx.shares > 0) {
      lots.push({ shares: sh, costPerShare: tx.costEur / sh });
    } else {
      let toSell = -sh;
      for (const lot of lots) {
        const sold = Math.min(lot.shares, toSell);
        lot.shares -= sold;
        toSell -= sold;
        if (toSell <= 0) break;
      }
    }
  }
  return lots.filter(l => l.shares > 0).reduce((s, l) => s + l.shares * l.costPerShare, 0);
}

/**
 * Build daily portfolio snapshot time series.
 */
function buildChartData(meta, transactions, priceMaps, fxMap, sortedDates, adjSharesFn) {
  const txByTicker = {};
  for (const tx of transactions) {
    (txByTicker[tx.ticker] = txByTicker[tx.ticker] || []).push(tx);
  }

  return sortedDates.map(date => {
    const row = { date };
    let totalValue = 0, totalCost = 0;

    for (const [ticker, txs] of Object.entries(txByTicker)) {
      const m = meta[ticker];
      let sharesHeld = 0;
      for (const t of txs) {
        if (t.date <= date) sharesHeld += adjSharesFn(t, ticker);
      }
      const price = priceMaps[m.yahoo]?.[date];
      if (sharesHeld > 0 && price != null) {
        const fxRate = fxMap[date] || FX_FALLBACK;
        const value = m.currency === 'USD' ? sharesHeld * price / fxRate : sharesHeld * price;
        row[ticker]              = Math.round(value);
        row[`${ticker}_shares`] = sharesHeld;
        totalValue += value;
        const cost = fifoCostBasis(txs, ticker, date, adjSharesFn);
        row[`${ticker}_cost`]  = Math.round(cost);
        totalCost += cost;
        if (cost > 0) row[`${ticker}_pct`] = (((value - cost) / cost) * 100).toFixed(1);
      }
    }

    if (totalValue === 0) return null;
    row.total     = Math.round(totalValue);
    row.totalCost = Math.round(totalCost);
    row.profit    = Math.round(totalValue - totalCost);
    row.pctReturn = totalCost > 0 ? (((totalValue - totalCost) / totalCost) * 100).toFixed(1) : '0.0';
    return row;
  }).filter(Boolean);
}

/**
 * Append today's row using daily quotes if newer than last candle date.
 */
async function appendTodaySnapshot(chartData, meta, transactions, fxMap, adjSharesFn) {
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];

  // Fetch current quotes
  const prices = {};
  let todayDate = null;
  for (const sym of yahooSymbols) {
    const q = await getQuote(sym);
    if (q) {
      prices[sym] = q.close;
      if (!todayDate) todayDate = q.date;
    }
  }

  // Today's FX rate
  const lastHistoricalFx = fxMap[Object.keys(fxMap).sort().at(-1)] || FX_FALLBACK;
  let todayFxRate = lastHistoricalFx;
  const fxQ = await getQuote(FX_SYMBOL);
  if (fxQ?.close) todayFxRate = fxQ.close;

  if (!todayDate || todayDate <= (chartData.at(-1)?.date || '')) return chartData;

  const txByTicker = {};
  for (const tx of transactions) {
    (txByTicker[tx.ticker] = txByTicker[tx.ticker] || []).push(tx);
  }

  const row = { date: todayDate };
  let tv = 0, tc = 0;

  for (const [ticker, txs] of Object.entries(txByTicker)) {
    const m = meta[ticker];
    let sh = 0;
    for (const t of txs) {
      if (t.date <= todayDate) sh += adjSharesFn(t, ticker);
    }
    const price = prices[m.yahoo];
    if (sh > 0 && price) {
      const val = m.currency === 'USD' ? sh * price / todayFxRate : sh * price;
      row[ticker]              = Math.round(val);
      row[`${ticker}_shares`] = sh;
      tv += val;
      const cost = fifoCostBasis(txs, ticker, todayDate, adjSharesFn);
      row[`${ticker}_cost`]  = Math.round(cost);
      tc += cost;
      if (cost > 0) row[`${ticker}_pct`] = (((val - cost) / cost) * 100).toFixed(1);
    }
  }

  if (tv > 0) {
    row.total     = Math.round(tv);
    row.totalCost = Math.round(tc);
    row.profit    = Math.round(tv - tc);
    row.pctReturn = tc > 0 ? (((tv - tc) / tc) * 100).toFixed(1) : '0.0';
    chartData.push(row);
  }
  return chartData;
}

/**
 * Build benchmark data indexed to 100 at the first chartData date.
 */
function buildBenchmarkData(priceMaps, chartData) {
  if (!priceMaps[BENCHMARK_SYM] || !chartData.length) return [];
  const basePrice = priceMaps[BENCHMARK_SYM][chartData[0].date];
  if (!basePrice) return [];
  return chartData
    .map(row => {
      const p = priceMaps[BENCHMARK_SYM][row.date];
      if (p == null) return null;
      return { date: row.date, value: parseFloat(((p / basePrice) * 100).toFixed(2)) };
    })
    .filter(Boolean);
}

// ── Main computation functions ────────────────────────────────────────────────

/**
 * Full portfolio computation for the API endpoint.
 * Returns chartData, benchmarkData, meta, currentTickers, latestFxRate.
 */
async function computeFullPortfolio() {
  const transactions = loadTransactions();
  if (!transactions.length) return null;

  const meta         = buildMeta(transactions);
  const earliestDate = findEarliestDate(transactions);
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];
  const allSymbols   = [...new Set([...yahooSymbols, FX_SYMBOL, BENCHMARK_SYM])];

  // Fetch all candles (served from cache when fresh)
  const rawCandles = {};
  for (const sym of allSymbols) {
    rawCandles[sym] = await getRawCandles(sym, earliestDate);
  }

  // Build sorted date universe from all candle data + transaction dates
  const allDates = new Set();
  for (const candles of Object.values(rawCandles)) {
    for (const c of candles) allDates.add(c.date);
  }
  for (const tx of transactions) allDates.add(tx.date);
  const sortedDates = [...allDates].sort();

  const priceMaps = buildPriceMaps(rawCandles, sortedDates);
  const fxMap     = buildFxRateMap(rawCandles[FX_SYMBOL] || [], sortedDates);
  const getFxRate = d => fxMap[d] || FX_FALLBACK;

  const splitFactors = detectSplitFactors(meta, transactions, priceMaps, getFxRate);
  const adjSharesFn  = makeAdjShares(meta, priceMaps, splitFactors, getFxRate);

  let chartData = buildChartData(meta, transactions, priceMaps, fxMap, sortedDates, adjSharesFn);
  chartData = await appendTodaySnapshot(chartData, meta, transactions, fxMap, adjSharesFn);

  const benchmarkData  = buildBenchmarkData(priceMaps, chartData);
  const { netShares }  = computeNetShares(meta, transactions, adjSharesFn);
  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  const latestFxRate   = fxMap[sortedDates.at(-1)] || FX_FALLBACK;

  // Summary positions from the latest chartData row
  const latest = chartData.at(-1);
  const positions = latest
    ? currentTickers.map(ticker => ({
        ticker,
        label:   meta[ticker].label,
        value:   latest[ticker]              || 0,
        cost:    latest[`${ticker}_cost`]    || 0,
        pl:      (latest[ticker] || 0) - (latest[`${ticker}_cost`] || 0),
        plPct:   parseFloat(latest[`${ticker}_pct`] || '0'),
        shares:  latest[`${ticker}_shares`]  || 0,
      }))
    : [];

  return { chartData, benchmarkData, meta, currentTickers, latestFxRate, positions };
}

// ── Scheduler / HA helpers ────────────────────────────────────────────────────

function getPrevTradingDate(priceMaps, yahooSymbols) {
  const today = new Date().toISOString().slice(0, 10);
  let latest = null;
  for (const sym of yahooSymbols) {
    for (const d of Object.keys(priceMaps[sym] || {})) {
      if (d < today && (!latest || d > latest)) latest = d;
    }
  }
  return latest;
}

function valueAtDate(currentTickers, meta, priceMaps, netShares, fxRate, date) {
  let total = 0;
  for (const ticker of currentTickers) {
    const m = meta[ticker];
    const price = priceMaps[m.yahoo]?.[date];
    if (!price) continue;
    total += m.currency === 'USD' ? netShares[ticker] * price / fxRate : netShares[ticker] * price;
  }
  return total;
}

/**
 * Lightweight current-value snapshot for the scheduler / HA push.
 * Uses a scalar FX rate (current) for simplicity — no full time-series needed.
 */
async function computeCurrentSnapshot() {
  const transactions = loadTransactions();
  if (!transactions.length) return null;

  const meta         = buildMeta(transactions);
  const earliestDate = findEarliestDate(transactions);
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];

  const needsFx = Object.values(meta).some(m => m.currency === 'USD');
  const fxQuote = needsFx ? await getQuote(FX_SYMBOL) : null;
  const fxRate  = fxQuote?.close || FX_FALLBACK;

  // Fetch candles for split detection + prev-day value
  const rawCandles = {};
  for (const sym of yahooSymbols) {
    rawCandles[sym] = await getRawCandles(sym, earliestDate);
  }

  const allDates = new Set();
  for (const candles of Object.values(rawCandles)) for (const c of candles) allDates.add(c.date);
  const sortedDates  = [...allDates].sort();
  const priceMaps    = buildPriceMaps(rawCandles, sortedDates);

  // Use scalar fxRate for split detection (current rate, sufficient for snapshot)
  const splitFactors = detectSplitFactors(meta, transactions, priceMaps, () => fxRate);
  const adjSharesFn  = makeAdjShares(meta, priceMaps, splitFactors, () => fxRate);

  const { netShares, buyInvested } = computeNetShares(meta, transactions, adjSharesFn);
  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  if (!currentTickers.length) return null;

  // Current prices
  const prices = {};
  for (const sym of yahooSymbols) {
    const q = await getQuote(sym);
    if (q) prices[sym] = q.close;
  }

  let totalValue = 0, totalCost = 0;
  const positions = [];
  for (const ticker of currentTickers) {
    const m = meta[ticker];
    const price = prices[m.yahoo];
    if (!price) continue;
    const value = m.currency === 'USD'
      ? netShares[ticker] * price / fxRate
      : netShares[ticker] * price;
    const cost = buyInvested[ticker] || 0;
    totalValue += value;
    totalCost  += cost;
    positions.push({
      ticker, label: m.label, value, pl: value - cost,
      plPct: cost > 0 ? ((value - cost) / cost * 100) : 0,
    });
  }

  if (!positions.length) return null;

  const prevDate  = getPrevTradingDate(priceMaps, yahooSymbols);
  const prevValue = prevDate
    ? valueAtDate(currentTickers, meta, priceMaps, netShares, fxRate, prevDate)
    : totalValue;
  const dailyPl = totalValue - prevValue;

  return { totalValue, totalCost, dailyPl, positions };
}

module.exports = { computeFullPortfolio, computeCurrentSnapshot };
