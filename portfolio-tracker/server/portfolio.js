/**
 * Portfolio calculation engine.
 * Shared between the API route, HA route, and scheduler.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { fetchDailyQuote, fetchCandles, fetchIntraday, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, writeCache, QUOTES_CACHE_TTL, CACHE_TTL, INTRADAY_CACHE_TTL } = require('./cache.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const TICKER_META_FILE  = path.join(DATA_DIR, 'ticker_meta.json');
const STATE_FILE        = path.join(DATA_DIR, 'portfolio_state.json');

const FX_SYMBOL        = 'EURUSD=X';
const FX_FALLBACK      = 1.09;
const BENCHMARK_SYM    = 'VWCE.DE';
const SPLIT_CANDIDATES = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100];

// ── Data access ───────────────────────────────────────────────────────────────

function loadTransactions() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
}

function loadTickerMeta() {
  try {
    return JSON.parse(fs.readFileSync(TICKER_META_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function buildMeta(transactions) {
  const tickerMeta = loadTickerMeta();
  const meta = {};
  for (const tx of transactions) {
    if (!meta[tx.ticker]) {
      const extra = tickerMeta[tx.ticker] || {};
      meta[tx.ticker] = {
        yahoo:           tx.yahoo,
        currency:        extra.manualPriceEur ? 'EUR' : (tx.currency || 'EUR'),
        label:           tx.label || tx.ticker,
        sector:          extra.sector          || null,
        geo:             extra.geo             || null,
        manualPriceEur:  extra.manualPriceEur  || null,
        manualPriceAsOf: extra.manualPriceAsOf || null,
      };
    }
  }
  return meta;
}

function buildManualPricesMap(meta) {
  const map = {};
  for (const m of Object.values(meta)) {
    if (m.manualPriceEur && m.manualPriceAsOf) {
      map[m.yahoo] = { eur: m.manualPriceEur, asOf: m.manualPriceAsOf };
    }
  }
  return map;
}

function findEarliestDate(transactions) {
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
}

async function getQuote(yahooSymbol) {
  const cacheKey = `quote_${yahooSymbol}`;
  const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
  if (cached) return cached;
  const q = await fetchDailyQuote(yahooSymbol);
  if (q) writeCache(cacheKey, q);
  await sleep(FETCH_DELAY);
  return q || null;
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
  const candles = await fetchCandles(yahooSymbol, fromDate);
  if (candles) writeCache(yahooSymbol, candles);
  await sleep(FETCH_DELAY);
  return candles || [];
}

// ── Price map construction ────────────────────────────────────────────────────

/**
 * Forward-fill price maps for all symbols over sortedDates.
 * manualPrices: { [yahooSymbol]: { eur, asOf } } — overrides from asOf date onward.
 */
function buildPriceMaps(rawCandles, sortedDates, manualPrices = {}) {
  const priceMaps = {};
  for (const [sym, candles] of Object.entries(rawCandles)) {
    const m = {};
    for (const c of candles) m[c.date] = c.close;
    const filled = {};
    let last = null;
    const manual = manualPrices[sym];
    for (const d of sortedDates) {
      if (manual && d >= manual.asOf) {
        last = manual.eur;
      } else if (m[d] != null) {
        last = m[d];
      }
      if (last != null) filled[d] = last;
    }
    priceMaps[sym] = filled;
  }
  return priceMaps;
}

/**
 * Forward-fill FX rate map over sortedDates.
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
    // Skip tickers with manual prices — no Yahoo data to compare against
    if (m.manualPriceEur) { splitFactors[ticker] = 1; continue; }
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

// ── FIFO cost basis & realized P&L ───────────────────────────────────────────

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
 * Compute realized P&L per ticker using FIFO.
 * Sells: proceeds = tx.costEur (always absolute EUR value from DeGiro).
 */
function computeRealizedPl(txsByTicker, adjSharesFn) {
  const perTicker = {};
  let total = 0;
  for (const [ticker, txs] of Object.entries(txsByTicker)) {
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const lots = [];
    let realized = 0;
    for (const tx of sorted) {
      const adjSh = adjSharesFn(tx, ticker);
      if (tx.shares > 0) {
        lots.push({ shares: adjSh, costPerShare: tx.costEur / adjSh });
      } else {
        const salePricePerShare = tx.costEur / Math.abs(adjSh);
        let toSell = Math.abs(adjSh);
        for (const lot of lots) {
          const sold = Math.min(lot.shares, toSell);
          realized += sold * (salePricePerShare - lot.costPerShare);
          lot.shares -= sold;
          toSell -= sold;
          if (toSell <= 0) break;
        }
      }
    }
    perTicker[ticker] = Math.round(realized * 100) / 100;
    total += realized;
  }
  return { perTicker, total: Math.round(total * 100) / 100 };
}

// ── Chart data ────────────────────────────────────────────────────────────────

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

  const prices = {};
  let todayDate = null;
  for (const sym of yahooSymbols) {
    const m = Object.values(meta).find(x => x.yahoo === sym);
    if (m?.manualPriceEur) {
      prices[sym] = m.manualPriceEur;
      if (!todayDate) todayDate = new Date().toISOString().slice(0, 10);
    } else {
      const q = await getQuote(sym);
      if (q) {
        prices[sym] = q.close;
        if (!todayDate) todayDate = q.date;
      }
    }
  }

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
      return { date: row.date, value: Number.parseFloat(((p / basePrice) * 100).toFixed(2)) };
    })
    .filter(Boolean);
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * Compute annualized risk metrics from chart history.
 */
function computeRiskMetrics(chartData, benchmarkData) {
  if (chartData.length < 30) return null;

  // Daily portfolio returns
  const portfolioReturns = [];
  for (let i = 1; i < chartData.length; i++) {
    const prev = chartData[i - 1].total;
    const curr = chartData[i].total;
    if (prev > 0) portfolioReturns.push((curr - prev) / prev);
  }
  if (portfolioReturns.length < 20) return null;

  // Daily benchmark returns aligned to portfolio dates
  const benchMap = {};
  for (const b of benchmarkData) benchMap[b.date] = b.value;

  const benchReturns = [];
  for (let i = 1; i < chartData.length; i++) {
    const prevB = benchMap[chartData[i - 1].date];
    const currB = benchMap[chartData[i].date];
    benchReturns.push(prevB && currB && prevB > 0 ? (currB - prevB) / prevB : null);
  }

  // Volatility (annualized std dev of daily returns)
  const n    = portfolioReturns.length;
  const mean = portfolioReturns.reduce((s, r) => s + r, 0) / n;
  const variance = portfolioReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const volatility = Math.sqrt(variance * 252);

  // Annualized return (CAGR)
  const totalReturn  = chartData.at(-1).total / chartData[0].total;
  const annualReturn = Math.pow(totalReturn, 252 / n) - 1;

  // Sharpe ratio (3% annual risk-free rate)
  const sharpe = volatility > 0 ? (annualReturn - 0.03) / volatility : null;

  // Beta vs benchmark
  const aligned = portfolioReturns
    .map((r, i) => benchReturns[i] != null ? [r, benchReturns[i]] : null)
    .filter(Boolean);
  let beta = null;
  if (aligned.length >= 30) {
    const bMean = aligned.reduce((s, [, b]) => s + b, 0) / aligned.length;
    const pMean = aligned.reduce((s, [p]) => s + p, 0) / aligned.length;
    const cov   = aligned.reduce((s, [p, b]) => s + (p - pMean) * (b - bMean), 0) / (aligned.length - 1);
    const bVar  = aligned.reduce((s, [, b]) => s + (b - bMean) ** 2, 0) / (aligned.length - 1);
    if (bVar > 0) beta = cov / bVar;
  }

  // Max drawdown duration (consecutive days in drawdown)
  let maxDDDays = 0, ddStart = null;
  for (const row of chartData) {
    if (row.profit < 0) {
      if (ddStart === null) ddStart = row.date;
      const days = Math.round((new Date(row.date) - new Date(ddStart)) / 86400000);
      if (days > maxDDDays) maxDDDays = days;
    } else {
      ddStart = null;
    }
  }

  return {
    volatility:      Number.parseFloat((volatility * 100).toFixed(2)),
    annualReturn:    Number.parseFloat((annualReturn * 100).toFixed(2)),
    sharpe:          sharpe != null ? Number.parseFloat(sharpe.toFixed(2)) : null,
    beta:            beta   != null ? Number.parseFloat(beta.toFixed(2))   : null,
    maxDrawdownDays: maxDDDays,
  };
}

/**
 * Compute rolling period returns for portfolio and benchmark.
 */
function computeRollingReturns(chartData, benchmarkData) {
  if (!chartData.length) return null;

  const latest  = chartData.at(-1);
  const today   = latest.date;
  const benchMap = {};
  for (const b of benchmarkData) benchMap[b.date] = b.value;

  function findStartRow(daysAgo) {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - daysAgo);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (const row of chartData) {
      if (row.date >= cutoffStr) return row;
    }
    return chartData[0];
  }

  function ytdRow() {
    const year = today.slice(0, 4);
    for (const row of chartData) {
      if (row.date >= `${year}-01-01`) return row;
    }
    return chartData[0];
  }

  function calcReturn(startRow) {
    if (!startRow || startRow.date === latest.date) return null;
    const portfolio = startRow.total > 0
      ? Number.parseFloat(((latest.total / startRow.total - 1) * 100).toFixed(2))
      : null;
    const startBench  = benchMap[startRow.date];
    const latestBench = benchMap[latest.date];
    const benchmark   = startBench && latestBench
      ? Number.parseFloat(((latestBench / startBench - 1) * 100).toFixed(2))
      : null;
    return { portfolio, benchmark };
  }

  return {
    '1w':       calcReturn(findStartRow(7)),
    '1m':       calcReturn(findStartRow(30)),
    '3m':       calcReturn(findStartRow(91)),
    'ytd':      calcReturn(ytdRow()),
    '1y':       calcReturn(findStartRow(365)),
    'inception': calcReturn(chartData[0]),
  };
}

/**
 * XIRR (money-weighted return) using Newton-Raphson.
 * Cash flows: buys = -costEur, sells = +costEur, terminal = +currentValue at today.
 */
function computeXIRR(transactions, currentValue) {
  const flows = transactions.map(tx => ({
    amount: tx.shares > 0 ? -tx.costEur : tx.costEur,
    t:      new Date(tx.date).getTime(),
  }));
  flows.push({ amount: currentValue, t: Date.now() });
  if (flows.length < 2) return null;

  const t0 = flows[0].t;
  const cfs = flows.map(f => ({ amount: f.amount, years: (f.t - t0) / (365.25 * 86400000) }));

  const npv  = r => cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, cf.years), 0);
  const dnpv = r => cfs.reduce((s, cf) => s - cf.years * cf.amount / Math.pow(1 + r, cf.years + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f  = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-10) break;
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-7) { r = rNew; break; }
    r = rNew;
    if (r < -0.999 || r > 100) return null;
  }

  if (!Number.isFinite(r) || r <= -1) return null;
  return Number.parseFloat((r * 100).toFixed(2));
}

/**
 * Time-weighted return (mirrors the client-side analyse.js logic).
 * Returns final TWR as a percentage.
 */
function computeServerTWR(chartData, transactions) {
  if (chartData.length < 2) return null;

  const txByDate = {};
  for (const tx of transactions) {
    (txByDate[tx.date] = txByDate[tx.date] || []).push(tx);
  }

  let twrFactor = 1.0;
  let subStart  = chartData[0].total;

  for (let i = 1; i < chartData.length; i++) {
    const row       = chartData[i];
    const txsToday  = txByDate[row.date];
    if (txsToday?.length) {
      const netCF        = txsToday.reduce((s, tx) => s + (tx.shares > 0 ? tx.costEur : -tx.costEur), 0);
      const valueBeforeCF = row.total - netCF;
      if (subStart > 0) twrFactor *= valueBeforeCF / subStart;
      subStart = row.total;
    }
  }

  const lastRow = chartData.at(-1);
  const finalTwr = subStart > 0
    ? (twrFactor * lastRow.total / subStart - 1) * 100
    : (twrFactor - 1) * 100;

  return Number.parseFloat(finalTwr.toFixed(2));
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
      symbol:     sym,
      price:      q.close,
      high52:     q.fiftyTwoWeekHigh,
      low52:      q.fiftyTwoWeekLow,
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
  const allSymbols   = [...new Set([...fetchSymbols, FX_SYMBOL, BENCHMARK_SYM])];

  const rawCandles = {};
  for (const sym of allSymbols) {
    rawCandles[sym] = await getRawCandles(sym, earliestDate);
  }
  // Empty candle array for manual-price tickers (price injected via manualPrices map)
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

  // Build per-ticker transaction map for realized P&L
  const txByTicker = {};
  for (const tx of transactions) {
    (txByTicker[tx.ticker] = txByTicker[tx.ticker] || []).push(tx);
  }
  const { perTicker: realizedPlPerTicker, total: realizedPl } = computeRealizedPl(txByTicker, adjSharesFn);

  // Summary positions from the latest chartData row
  const latest = chartData.at(-1);
  const positions = latest
    ? currentTickers.map(ticker => ({
        ticker,
        label:      meta[ticker].label,
        value:      latest[ticker]              || 0,
        cost:       latest[`${ticker}_cost`]    || 0,
        pl:         (latest[ticker] || 0) - (latest[`${ticker}_cost`] || 0),
        plPct:      Number.parseFloat(latest[`${ticker}_pct`] || '0'),
        shares:     latest[`${ticker}_shares`]  || 0,
        realizedPl: realizedPlPerTicker[ticker] || 0,
      }))
    : [];

  // Enrich positions with 52w data from cached quotes
  for (const pos of positions) {
    const q = await getQuote(meta[pos.ticker].yahoo);
    pos.high52 = q?.fiftyTwoWeekHigh ?? null;
    pos.low52  = q?.fiftyTwoWeekLow  ?? null;
    pos.pe     = q?.trailingPE       ?? null;
  }

  // Currency exposure
  const totalValue    = latest?.total || 0;
  const usdValue      = positions.filter(p => meta[p.ticker].currency === 'USD').reduce((s, p) => s + p.value, 0);
  const usdExposurePct = totalValue > 0 ? Number.parseFloat((usdValue / totalValue * 100).toFixed(1)) : 0;

  // Analytics
  const riskMetrics    = computeRiskMetrics(chartData, benchmarkData);
  const rollingReturns = computeRollingReturns(chartData, benchmarkData);
  const twrPct         = computeServerTWR(chartData, transactions);
  const irrPct         = computeXIRR(transactions, totalValue);

  // Persist analytics + inception data for HA scheduler
  const totalInvested = transactions
    .filter(tx => tx.shares > 0)
    .reduce((s, tx) => s + tx.costEur, 0);
  writeAnalyticsState({
    twrPct, irrPct, riskMetrics,
    inceptionDate:  findEarliestDate(transactions),
    totalInvested:  Math.round(totalInvested * 100) / 100,
  });

  return {
    chartData, benchmarkData, meta, currentTickers, latestFxRate, positions,
    realizedPl, realizedPlPerTicker, usdExposurePct,
    riskMetrics, rollingReturns, twrPct, irrPct,
  };
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

function buildSnapshotPositions(currentTickers, meta, prices, netShares, buyInvested, fxRate) {
  let totalValue = 0, totalCost = 0;
  const positions = [];
  for (const ticker of currentTickers) {
    const m = meta[ticker];
    const price = prices[m.yahoo];
    if (!price) continue;
    const value = m.currency === 'USD' ? netShares[ticker] * price / fxRate : netShares[ticker] * price;
    const cost  = buyInvested[ticker] || 0;
    totalValue += value;
    totalCost  += cost;
    positions.push({
      ticker, label: m.label, value, cost,
      shares: netShares[ticker],
      pl:     value - cost,
      plPct:  cost > 0 ? ((value - cost) / cost * 100) : 0,
    });
  }
  return { totalValue, totalCost, positions };
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

  const needsFx = Object.values(meta).some(m => m.currency === 'USD');
  let fxRate = FX_FALLBACK;
  if (needsFx) {
    fxRate = (await getIntradayPrice(FX_SYMBOL)) ?? (await getQuote(FX_SYMBOL))?.close ?? FX_FALLBACK;
  }

  const rawCandles = {};
  for (const sym of fetchSymbols) {
    rawCandles[sym] = await getRawCandles(sym, earliestDate);
  }

  const allDates    = new Set();
  for (const candles of Object.values(rawCandles)) for (const c of candles) allDates.add(c.date);
  const sortedDates = [...allDates].sort();
  const priceMaps   = buildPriceMaps(rawCandles, sortedDates, manualPrices);

  const splitFactors = detectSplitFactors(meta, transactions, priceMaps, () => fxRate);
  const adjSharesFn  = makeAdjShares(meta, priceMaps, splitFactors, () => fxRate);

  const { netShares, buyInvested } = computeNetShares(meta, transactions, adjSharesFn);
  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  if (!currentTickers.length) return null;

  const prices = await getLivePrices(yahooSymbols, manualPrices);

  const { totalValue, totalCost, positions } = buildSnapshotPositions(
    currentTickers, meta, prices, netShares, buyInvested, fxRate,
  );

  if (!positions.length) return null;

  const prevDate  = getPrevTradingDate(priceMaps, fetchSymbols.length ? fetchSymbols : yahooSymbols);
  const prevValue = prevDate
    ? valueAtDate(currentTickers, meta, priceMaps, netShares, fxRate, prevDate)
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

  // Watchlist
  const watchlistData = options.watchlist?.length
    ? await fetchWatchlistPrices(options.watchlist)
    : [];

  return { totalValue, totalCost, dailyPl, positions, realizedPl, usdExposurePct, watchlistData };
}

module.exports = { computeFullPortfolio, computeCurrentSnapshot };
