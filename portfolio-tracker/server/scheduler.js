/**
 * Background HA sensor push scheduler.
 * Runs on the server, no browser needed.
 * Interval controlled by HA_PUSH_INTERVAL env var (minutes, default 15).
 */

const fs   = require('node:fs');
const path = require('node:path');
const { fetchDailyQuote, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, writeCache, QUOTES_CACHE_TTL } = require('./cache.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const FX_SYMBOL         = 'EURUSD=X';
const FX_FALLBACK       = 1.09;

async function getPrice(yahooSymbol) {
  const cacheKey = `quote_${yahooSymbol}`;
  const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
  if (cached) return cached.close;
  const q = await fetchDailyQuote(yahooSymbol);
  if (q) writeCache(cacheKey, q);
  await sleep(FETCH_DELAY);
  return q ? q.close : null;
}

async function computePortfolio() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return null;
  const transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
  if (!transactions.length) return null;

  // Build per-ticker metadata and net shares
  const meta       = {};  // ticker → { yahoo, currency, label }
  const netShares  = {};  // ticker → number
  const buyInvested = {}; // ticker → total EUR spent on buys

  for (const tx of transactions) {
    if (!meta[tx.ticker]) meta[tx.ticker] = { yahoo: tx.yahoo, currency: tx.currency, label: tx.label || tx.ticker };
    netShares[tx.ticker]   = (netShares[tx.ticker]  || 0) + tx.shares;
    if (tx.shares > 0) buyInvested[tx.ticker] = (buyInvested[tx.ticker] || 0) + tx.costEur;
  }

  const currentTickers = Object.keys(netShares).filter(t => netShares[t] > 0.0001);
  if (!currentTickers.length) return null;

  // Fetch FX rate if any USD positions
  const needsFx = currentTickers.some(t => meta[t].currency === 'USD');
  const fxRate  = needsFx ? (await getPrice(FX_SYMBOL) || FX_FALLBACK) : 1;

  // Fetch current prices
  const prices = {};
  const yahooSymbols = [...new Set(currentTickers.map(t => meta[t].yahoo))];
  for (const sym of yahooSymbols) {
    try { prices[sym] = await getPrice(sym); }
    catch (e) { console.warn(`[Scheduler] price failed ${sym}:`, e.message); }
  }

  // Compute positions
  let totalValue = 0, totalCost = 0;
  const positions = [];

  for (const ticker of currentTickers) {
    const m     = meta[ticker];
    const price = prices[m.yahoo];
    if (!price) continue;
    const value = m.currency === 'USD'
      ? netShares[ticker] * price / fxRate
      : netShares[ticker] * price;
    const cost  = buyInvested[ticker] || 0;
    totalValue += value;
    totalCost  += cost;
    positions.push({ ticker, label: m.label, value, pl: value - cost, plPct: cost > 0 ? ((value - cost) / cost * 100) : 0 });
  }

  return { totalValue, totalCost, positions };
}

async function pushToHA(portfolio) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return; // not running as HA addon

  const { totalValue, totalCost, positions } = portfolio;
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
    unit_of_measurement: '€', friendly_name: 'Portfolio P&L',
    pl_pct: totalPlPct.toFixed(2),
  });

  for (const p of positions) {
    const slug = p.ticker.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
    await pushState(`sensor.portfolio_${slug}`, p.value.toFixed(2), {
      unit_of_measurement: '€', friendly_name: `Portfolio ${p.label}`,
      pl_eur: p.pl.toFixed(2), pl_pct: p.plPct.toFixed(2),
    });
  }

  console.log(`[Scheduler] HA push OK — ${positions.length} positions, total €${totalValue.toFixed(0)}`);
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

  // First push after 15s (let server fully start)
  setTimeout(runOnce, 15_000);
  setInterval(runOnce, intervalMs);

  console.log(`[Scheduler] HA sensor push every ${intervalMin} min`);
}

module.exports = { start };
