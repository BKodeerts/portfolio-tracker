/**
 * Portfolio calculation engine.
 * Shared between the API route, HA route, and scheduler.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { fetchDailyQuote, fetchCandles, fetchIntraday, fetchQuoteSummary, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, writeCache, QUOTES_CACHE_TTL, CACHE_TTL, INTRADAY_CACHE_TTL } = require('./cache.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const TICKER_META_FILE  = path.join(DATA_DIR, 'ticker_meta.json');
const STATE_FILE        = path.join(DATA_DIR, 'portfolio_state.json');

const FX_SYMBOL        = 'EURUSD=X';  // backward compat (HA/MQTT)
const FX_FALLBACK      = 1.09;        // backward compat
const BENCHMARK_SYM    = 'VWCE.DE';
const SP500_SYM        = '^GSPC';
const SPLIT_CANDIDATES = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100];

// FX definitions: stock currency → { Yahoo FX symbol (EUR-base), fallback rate, optional /scale }
const FX_DEFS = {
  USD: { symbol: 'EURUSD=X', fallback: 1.09  },
  GBP: { symbol: 'EURGBP=X', fallback: 0.86  },
  GBX: { symbol: 'EURGBP=X', fallback: 0.86, scale: 100 }, // pence sterling
  CLP: { symbol: 'EURCLP=X', fallback: 1000  },
  CHF: { symbol: 'EURCHF=X', fallback: 0.95  },
  SEK: { symbol: 'EURSEK=X', fallback: 11.5  },
  DKK: { symbol: 'EURDKK=X', fallback: 7.46  },
  NOK: { symbol: 'EURNOK=X', fallback: 11.5  },
  CAD: { symbol: 'EURCAD=X', fallback: 1.5   },
  AUD: { symbol: 'EURAUD=X', fallback: 1.65  },
  JPY: { symbol: 'EURJPY=X', fallback: 160   },
  MXN: { symbol: 'EURMXN=X', fallback: 20    },
  BRL: { symbol: 'EURBRL=X', fallback: 5.5   },
};

/**
 * Convert a price in any currency to EUR using a date-keyed fxMaps object.
 * fxMaps: { [currency]: { [date]: rate } } where rate = EUR-per-unit (e.g. EURUSD=1.09 means 1 EUR = 1.09 USD).
 */
function toEur(currency, price, date, fxMaps) {
  if (!currency || currency === 'EUR') return price;
  const def = FX_DEFS[currency];
  if (!def) return price;
  const rate = fxMaps[currency]?.[date] || def.fallback;
  return price / rate / (def.scale || 1);
}

/**
 * Convert a price to EUR using a flat live-rates object { [currency]: rate }.
 */
function toEurAtRate(currency, price, liveRates) {
  if (!currency || currency === 'EUR') return price;
  const def = FX_DEFS[currency];
  if (!def) return price;
  const rate = liveRates[currency] || def.fallback;
  return price / rate / (def.scale || 1);
}

/** Collect all unique non-EUR currencies that need FX data. */
function nonEurCurrencies(meta) {
  return [...new Set(Object.values(meta).map(m => m.currency).filter(c => c && c !== 'EUR' && FX_DEFS[c]))];
}

/** Return deduped Yahoo FX symbols needed for a set of currencies. */
function fxSymbolsFor(currencies) {
  return [...new Set(currencies.map(c => FX_DEFS[c]?.symbol).filter(Boolean))];
}

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
        quoteType:       extra.quoteType       || null,
        sector:          extra.sector          || null,
        industry:        extra.industry        || null,
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
 * Build per-currency forward-filled FX rate maps over sortedDates.
 * Returns { [currency]: { [date]: rate } } where rate = EUR-per-unit.
 */
function buildFxRateMaps(rawCandles, sortedDates, currencies) {
  const maps = {};
  for (const ccy of currencies) {
    const def = FX_DEFS[ccy];
    if (!def) continue;
    const raw = {};
    for (const c of (rawCandles[def.symbol] || [])) raw[c.date] = c.close;
    const map = {};
    let last = def.fallback;
    for (const d of sortedDates) {
      if (raw[d] != null) last = raw[d];
      map[d] = last;
    }
    maps[ccy] = map;
  }
  return maps;
}

// ── Split detection & share adjustment ───────────────────────────────────────

function detectSplitFactors(meta, transactions, priceMaps, fxMaps) {
  const splitFactors = {};
  for (const ticker of Object.keys(meta)) {
    const m = meta[ticker];
    if (m.manualPriceEur) { splitFactors[ticker] = 1; continue; }
    const firstBuy = transactions
      .filter(t => t.ticker === ticker && t.shares > 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!firstBuy) { splitFactors[ticker] = 1; continue; }
    const yahooPrice = priceMaps[m.yahoo]?.[firstBuy.date];
    if (!yahooPrice) { splitFactors[ticker] = 1; continue; }
    // txPrice: convert EUR cost to the stock's native currency for ratio comparison
    const def = FX_DEFS[m.currency];
    const rate  = def ? (fxMaps[m.currency]?.[firstBuy.date] || def.fallback) : 1;
    const scale = def?.scale || 1;
    const txPrice = (m.currency && m.currency !== 'EUR' && def)
      ? (firstBuy.costEur / firstBuy.shares) * rate * scale
      : firstBuy.costEur / firstBuy.shares;
    const ratio = yahooPrice / txPrice;
    splitFactors[ticker] = ratio > 2
      ? SPLIT_CANDIDATES.reduce((best, f) => (Math.abs(f - ratio) < Math.abs(best - ratio) ? f : best), 1)
      : 1;
  }
  return splitFactors;
}

function makeAdjShares(meta, priceMaps, splitFactors, fxMaps) {
  return function adjShares(tx, ticker) {
    const factor = splitFactors[ticker] || 1;
    if (factor === 1) return tx.shares;
    const m = meta[ticker];
    const yahooPrice = priceMaps[m.yahoo]?.[tx.date];
    if (!yahooPrice) return tx.shares;
    const def = FX_DEFS[m.currency];
    const rate  = def ? (fxMaps[m.currency]?.[tx.date] || def.fallback) : 1;
    const scale = def?.scale || 1;
    const txPrice = (m.currency && m.currency !== 'EUR' && def)
      ? (Math.abs(tx.costEur) / Math.abs(tx.shares)) * rate * scale
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
function buildChartData(meta, transactions, priceMaps, fxMaps, sortedDates, adjSharesFn) {
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
        const value = toEur(m.currency, sharesHeld * price, date, fxMaps);
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
async function appendTodaySnapshot(chartData, meta, transactions, fxMaps, adjSharesFn) {
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

  // Fetch live FX rates for all non-EUR currencies
  const currencies = nonEurCurrencies(meta);
  const liveRates = {};
  const seenFxSymbols = new Set();
  for (const ccy of currencies) {
    const def = FX_DEFS[ccy];
    if (!def || seenFxSymbols.has(def.symbol)) { continue; }
    seenFxSymbols.add(def.symbol);
    const lastHistorical = Object.values(fxMaps[ccy] || {}).at(-1) || def.fallback;
    const fxQ = await getQuote(def.symbol);
    const rate = fxQ?.close || lastHistorical;
    for (const c of currencies) {
      if (FX_DEFS[c]?.symbol === def.symbol) liveRates[c] = rate;
    }
  }

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
      const val = toEurAtRate(m.currency, sh * price, liveRates);
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
function buildBenchmarkData(priceMaps, chartData, symbol, fxMap = null) {
  if (!priceMaps[symbol] || !chartData.length) return [];
  const toEurFx = (date, price) => fxMap ? price / (fxMap[date] || FX_FALLBACK) : price;
  const baseEur = toEurFx(chartData[0].date, priceMaps[symbol][chartData[0].date]);
  if (!baseEur) return [];
  return chartData
    .map(row => {
      const p = priceMaps[symbol][row.date];
      if (p == null) return null;
      return { date: row.date, value: Number.parseFloat((toEurFx(row.date, p) / baseEur * 100).toFixed(2)) };
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
function computeRollingReturns(chartData, benchmarkData, sp500Data, twrPct = null) {
  if (!chartData.length) return null;

  const latest   = chartData.at(-1);
  const today    = latest.date;
  const vwceMap  = Object.fromEntries(benchmarkData.map(b => [b.date, b.value]));
  const sp500Map = Object.fromEntries(sp500Data.map(b => [b.date, b.value]));

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

  const benchReturn = (map, startRow) => {
    const s = map[startRow.date], l = map[latest.date];
    return s && l ? Number.parseFloat(((l / s - 1) * 100).toFixed(2)) : null;
  };

  function calcReturn(startRow) {
    if (!startRow || startRow.date === latest.date) return null;
    const portfolio = startRow.total > 0
      ? Number.parseFloat(((latest.total / startRow.total - 1) * 100).toFixed(2))
      : null;
    return { portfolio, vwce: benchReturn(vwceMap, startRow), sp500: benchReturn(sp500Map, startRow) };
  }

  const inception0 = calcReturn(chartData[0]);
  return {
    '1w':        calcReturn(findStartRow(7)),
    '1m':        calcReturn(findStartRow(30)),
    '3m':        calcReturn(findStartRow(91)),
    'ytd':       calcReturn(ytdRow()),
    '1y':        calcReturn(findStartRow(365)),
    'inception': { portfolio: twrPct, vwce: inception0?.vwce ?? null, sp500: inception0?.sp500 ?? null },
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
  const currencies   = nonEurCurrencies(meta);
  const neededFxSyms = fxSymbolsFor(currencies);
  const allSymbols   = [...new Set([...fetchSymbols, FX_SYMBOL, ...neededFxSyms, BENCHMARK_SYM, SP500_SYM])];

  const rawCandles = {};
  for (const sym of allSymbols) {
    rawCandles[sym] = await getRawCandles(sym, earliestDate);
  }
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

  // Enrich positions with 52w data + auto-populate quoteType/sector in ticker_meta
  const tickerMetaLive = loadTickerMeta();
  let tickerMetaChanged = false;

  for (const pos of positions) {
    const yahooSym = meta[pos.ticker].yahoo;
    const q = await getQuote(yahooSym);
    pos.high52 = q?.fiftyTwoWeekHigh ?? null;
    pos.low52  = q?.fiftyTwoWeekLow  ?? null;
    pos.pe     = q?.trailingPE       ?? null;

    const tm = tickerMetaLive[pos.ticker] || {};

    // Auto-populate quoteType + sector via search (cached 7 days)
    if (!tm.quoteType || !tm.sector) {
      const summaryKey = `summary_${yahooSym}`;
      let summary = readCache(summaryKey, 7 * 24 * 60 * 60 * 1000);
      if (!summary) {
        try {
          summary = await fetchQuoteSummary(yahooSym);
          if (summary) writeCache(summaryKey, summary);
          await sleep(FETCH_DELAY);
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
  }

  if (tickerMetaChanged) {
    fs.writeFileSync(TICKER_META_FILE, JSON.stringify(tickerMetaLive, null, 2));
  }

  // Currency exposure per currency
  const totalValue = latest?.total || 0;
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

  // Analytics
  const riskMetrics    = computeRiskMetrics(chartData, benchmarkData);
  const twrPct         = computeServerTWR(chartData, transactions);
  const rollingReturns = computeRollingReturns(chartData, benchmarkData, sp500Data, twrPct);
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
    chartData, benchmarkData, sp500Data, meta, currentTickers, latestFxRate, positions,
    realizedPl, realizedPlPerTicker, usdExposurePct, currencyExposure,
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

function valueAtDate(currentTickers, meta, priceMaps, netShares, liveRates, date) {
  let total = 0;
  for (const ticker of currentTickers) {
    const m = meta[ticker];
    const price = priceMaps[m.yahoo]?.[date];
    if (!price) continue;
    total += toEurAtRate(m.currency, netShares[ticker] * price, liveRates);
  }
  return total;
}

function buildSnapshotPositions(currentTickers, meta, prices, netShares, buyInvested, liveRates) {
  let totalValue = 0, totalCost = 0;
  const positions = [];
  for (const ticker of currentTickers) {
    const m = meta[ticker];
    const price = prices[m.yahoo];
    if (!price) continue;
    const value = toEurAtRate(m.currency, netShares[ticker] * price, liveRates);
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
  const rawCandles = {};
  for (const sym of [...fetchSymbols, ...neededFxSyms]) {
    if (!rawCandles[sym]) rawCandles[sym] = await getRawCandles(sym, earliestDate);
  }

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

module.exports = { computeFullPortfolio, computeCurrentSnapshot };
