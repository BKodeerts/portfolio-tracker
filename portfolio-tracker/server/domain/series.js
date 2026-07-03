/**
 * Series domain — chart/benchmark time series and snapshot valuation helpers.
 * Pure module: no fs, no network. All data injected as arguments.
 */

const { FX_FALLBACK, toEur, toEurAtRate } = require('./fx.js');
const { isDividend, fifoCostBasis } = require('./positions.js');

const BENCHMARK_SYM = 'VWCE.DE';
const SP500_SYM     = '^GSPC';

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
        if (t.date <= date && !isDividend(t)) sharesHeld += adjSharesFn(t, ticker);
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

// ── Snapshot valuation helpers (scheduler / HA) ──────────────────────────────

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

module.exports = {
  BENCHMARK_SYM,
  SP500_SYM,
  buildChartData,
  buildBenchmarkData,
  getPrevTradingDate,
  valueAtDate,
  buildSnapshotPositions,
};
