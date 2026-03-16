/**
 * Background HA sensor push scheduler.
 * Runs on the server, no browser needed.
 * Interval controlled by HA_PUSH_INTERVAL env var (minutes, default 15).
 */

const fs   = require('node:fs');
const path = require('node:path');
const { fetchDailyQuote, fetchCandles, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, writeCache, QUOTES_CACHE_TTL, CACHE_TTL } = require('./cache.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const FX_SYMBOL         = 'EURUSD=X';
const FX_FALLBACK       = 1.09;
const SPLIT_CANDIDATES  = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100];

async function getPrice(yahooSymbol) {
  const cacheKey = `quote_${yahooSymbol}`;
  const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
  if (cached) return cached.close;
  const q = await fetchDailyQuote(yahooSymbol);
  if (q) writeCache(cacheKey, q);
  await sleep(FETCH_DELAY);
  return q ? q.close : null;
}

async function getCandles(yahooSymbol, fromDate) {
  // Reuse candle cache populated by main app (key = raw symbol, no prefix)
  const cached = readCache(yahooSymbol, CACHE_TTL);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  const candles = await fetchCandles(yahooSymbol, fromDate);
  if (candles) writeCache(yahooSymbol, candles);
  await sleep(FETCH_DELAY);
  return candles || [];
}

function findEarliestDate(transactions) {
  let earliest = transactions[0].date;
  for (const tx of transactions) {
    if (tx.date < earliest) earliest = tx.date;
  }
  return earliest;
}

async function buildPriceMaps(meta, transactions, yahooSymbols, earliestDate) {
  const priceMaps = {};
  for (const sym of yahooSymbols) {
    const candles = await getCandles(sym, earliestDate);
    const raw = {};
    for (const c of candles) raw[c.date] = c.close;

    // Forward-fill so every transaction date has a price
    const txDates   = transactions.filter(t => meta[t.ticker]?.yahoo === sym).map(t => t.date);
    const allDates  = [...new Set([...Object.keys(raw), ...txDates])].sort((a, b) => a.localeCompare(b));
    const filled = {};
    let last = null;
    for (const d of allDates) {
      if (raw[d] != null) last = raw[d];
      if (last != null) filled[d] = last;
    }
    priceMaps[sym] = filled;
  }
  return priceMaps;
}

function detectSplitFactors(meta, transactions, priceMaps, fxRate) {
  const splitFactors = {};
  for (const ticker of Object.keys(meta)) {
    const m = meta[ticker];
    const firstBuy = transactions
      .filter(t => t.ticker === ticker && t.shares > 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!firstBuy) { splitFactors[ticker] = 1; continue; }

    const yahooPrice = priceMaps[m.yahoo]?.[firstBuy.date];
    if (!yahooPrice) { splitFactors[ticker] = 1; continue; }

    const txPrice = m.currency === 'USD'
      ? (firstBuy.costEur / firstBuy.shares) * fxRate
      : firstBuy.costEur / firstBuy.shares;

    const ratio = yahooPrice / txPrice;
    splitFactors[ticker] = ratio > 2
      ? SPLIT_CANDIDATES.reduce((best, f) => (Math.abs(f - ratio) < Math.abs(best - ratio) ? f : best), 1)
      : 1;
  }
  return splitFactors;
}

function makeAdjShares(meta, priceMaps, splitFactors, fxRate) {
  return function adjShares(tx, ticker) {
    const factor = splitFactors[ticker] || 1;
    if (factor === 1) return tx.shares;
    const m = meta[ticker];
    const yahooPrice = priceMaps[m.yahoo]?.[tx.date];
    if (!yahooPrice) return tx.shares;
    const txPrice = m.currency === 'USD'
      ? (Math.abs(tx.costEur) / Math.abs(tx.shares)) * fxRate
      : Math.abs(tx.costEur) / Math.abs(tx.shares);
    return yahooPrice / txPrice > 2 ? tx.shares / factor : tx.shares;
  };
}

function computeNetShares(meta, transactions, adjShares) {
  const netShares = {}, buyInvested = {};
  for (const ticker of Object.keys(meta)) {
    let net = 0, invested = 0;
    for (const tx of transactions.filter(t => t.ticker === ticker)) {
      net += adjShares(tx, ticker);
      if (tx.shares > 0) invested += tx.costEur;
    }
    netShares[ticker]   = net;
    buyInvested[ticker] = invested;
  }
  return { netShares, buyInvested };
}

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

function buildResult(currentTickers, { meta, prices, priceMaps, yahooSymbols, netShares, buyInvested, fxRate }) {
  let totalValue = 0, totalCost = 0;
  const positions = [];
  for (const ticker of currentTickers) {
    const m     = meta[ticker];
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

  const prevDate = getPrevTradingDate(priceMaps, yahooSymbols);
  const prevValue = prevDate ? valueAtDate(currentTickers, meta, priceMaps, netShares, fxRate, prevDate) : totalValue;
  const dailyPl = totalValue - prevValue;

  return { totalValue, totalCost, dailyPl, positions };
}

async function computePortfolio() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return null;
  const transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
  if (!transactions.length) return null;

  const meta = {};
  for (const tx of transactions) {
    if (!meta[tx.ticker]) {
      meta[tx.ticker] = { yahoo: tx.yahoo, currency: tx.currency, label: tx.label || tx.ticker };
    }
  }

  const needsFx      = Object.values(meta).some(m => m.currency === 'USD');
  const fxRate       = needsFx ? (await getPrice(FX_SYMBOL) || FX_FALLBACK) : FX_FALLBACK;
  const yahooSymbols = [...new Set(Object.values(meta).map(m => m.yahoo))];
  const earliestDate = findEarliestDate(transactions);

  const priceMaps    = await buildPriceMaps(meta, transactions, yahooSymbols, earliestDate);
  const splitFactors = detectSplitFactors(meta, transactions, priceMaps, fxRate);
  const adjShares    = makeAdjShares(meta, priceMaps, splitFactors, fxRate);
  const { netShares, buyInvested } = computeNetShares(meta, transactions, adjShares);

  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  if (!currentTickers.length) return null;

  const prices = {};
  for (const sym of yahooSymbols) {
    try   { prices[sym] = await getPrice(sym); }
    catch (e) { console.warn(`[Scheduler] price failed ${sym}:`, e.message); }
  }

  return buildResult(currentTickers, { meta, prices, priceMaps, yahooSymbols, netShares, buyInvested, fxRate });
}

async function pushToHA(portfolio) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return;

  const { totalValue, totalCost, dailyPl, positions } = portfolio;
  const base    = 'http://supervisor/core/api/states';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function pushState(entity, value, attributes) {
    const r = await fetch(`${base}/${entity}`, {
      method: 'POST', headers,
      body: JSON.stringify({ state: String(value), attributes }),
    });
    if (!r.ok) throw new Error(`${entity}: HTTP ${r.status}`);
  }

  const totalPl    = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost * 100) : 0;

  await pushState('sensor.portfolio_total_value', totalValue.toFixed(2), {
    unit_of_measurement: '€', friendly_name: 'Portfolio Waarde', device_class: 'monetary',
  });
  await pushState('sensor.portfolio_total_invested', totalCost.toFixed(2), {
    unit_of_measurement: '€', friendly_name: 'Portfolio Geïnvesteerd',
  });
  await pushState('sensor.portfolio_pl', totalPl.toFixed(2), {
    unit_of_measurement: '€', friendly_name: 'Portfolio P&L', pl_pct: totalPlPct.toFixed(2),
  });
  await pushState('sensor.portfolio_daily_pl', dailyPl.toFixed(2), {
    unit_of_measurement: '€', friendly_name: 'Portfolio Dagresultaat',
  });

  for (const p of positions) {
    const slug = p.ticker.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
    await pushState(`sensor.portfolio_${slug}`, p.value.toFixed(2), {
      unit_of_measurement: '€', friendly_name: `Portfolio ${p.ticker}`,
      pl_eur: p.pl.toFixed(2), pl_pct: p.plPct.toFixed(2),
    });
  }

  console.log(`[Scheduler] HA push OK — ${positions.length} positions, total €${totalValue.toFixed(0)}, daily €${dailyPl.toFixed(0)}`);
}

async function runOnce() {
  try {
    const portfolio = await computePortfolio();
    if (!portfolio) return;
    await pushToHA(portfolio);
  } catch (e) {
    console.warn('[Scheduler] run failed:', e.message);
  }
}

function start() {
  if (!process.env.SUPERVISOR_TOKEN) {
    console.log('[Scheduler] No SUPERVISOR_TOKEN — HA push disabled');
    return;
  }

  const intervalMin = Number.parseInt(process.env.HA_PUSH_INTERVAL, 10) || 15;
  const intervalMs  = intervalMin * 60 * 1000;

  setTimeout(runOnce, 15_000);
  setInterval(runOnce, intervalMs);

  console.log(`[Scheduler] HA sensor push every ${intervalMin} min`);
}

module.exports = { start };
