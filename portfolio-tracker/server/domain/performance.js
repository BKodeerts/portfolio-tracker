/**
 * Performance domain — risk metrics, rolling returns, annual P&L, XIRR, TWR.
 * Pure module: no fs, no network. All data injected as arguments.
 */

const { isDividend } = require('./positions.js');

const RISK_FREE_RATE = Number(process.env.RISK_FREE_RATE ?? 0.03);

/**
 * Net external cash flow per date (EUR), TWR sign convention:
 * buys are deposits (+), sells and dividends are withdrawals (−).
 * Dividend cash never appears in chart values, so counting it as a
 * withdrawal credits it to performance in the period it was paid.
 */
function netCashFlowByDate(transactions) {
  const byDate = {};
  for (const tx of transactions) {
    const cf = tx.shares > 0 ? tx.costEur : -tx.costEur;
    byDate[tx.date] = (byDate[tx.date] || 0) + cf;
  }
  return byDate;
}

/**
 * Compute annualized risk metrics from chart history.
 * Daily returns are flow-adjusted (deposits/withdrawals are not performance),
 * so a buy no longer registers as a price jump in volatility or drawdown.
 */
function computeRiskMetrics(chartData, benchmarkData, transactions = []) {
  if (chartData.length < 30) return null;

  const cfByDate = netCashFlowByDate(transactions);
  const benchMap = {};
  for (const b of benchmarkData) benchMap[b.date] = b.value;

  // Daily flow-adjusted portfolio returns, benchmark returns aligned index-for-index
  const portfolioReturns = [];
  const benchReturns = [];
  for (let i = 1; i < chartData.length; i++) {
    const prev = chartData[i - 1].value;
    const curr = chartData[i].value;
    if (prev <= 0) continue;
    const cf = cfByDate[chartData[i].date] || 0;
    portfolioReturns.push((curr - cf - prev) / prev);
    const prevB = benchMap[chartData[i - 1].date];
    const currB = benchMap[chartData[i].date];
    benchReturns.push(prevB && currB && prevB > 0 ? (currB - prevB) / prevB : null);
  }
  if (portfolioReturns.length < 20) return null;

  // Volatility (annualized std dev of daily returns)
  const n    = portfolioReturns.length;
  const mean = portfolioReturns.reduce((s, r) => s + r, 0) / n;
  const variance = portfolioReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const volatility = Math.sqrt(variance * 252);

  // Annualized return: CAGR of the compounded flow-adjusted returns (TWR-consistent)
  const totalReturn  = portfolioReturns.reduce((f, r) => f * (1 + r), 1);
  const annualReturn = totalReturn > 0 ? Math.pow(totalReturn, 252 / n) - 1 : -1;

  // Sharpe ratio (configurable risk-free rate, default 3%)
  const sharpe = volatility > 0 ? (annualReturn - RISK_FREE_RATE) / volatility : null;

  // Sortino ratio: like Sharpe, but only downside deviation counts as risk
  const dailyRf      = RISK_FREE_RATE / 252;
  const downsideVar  = portfolioReturns.reduce((s, r) => s + Math.min(0, r - dailyRf) ** 2, 0) / n;
  const downsideDev  = Math.sqrt(downsideVar * 252);
  const sortino      = downsideDev > 0 ? (annualReturn - RISK_FREE_RATE) / downsideDev : null;

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

  // Max drawdown: largest peak-to-trough % decline of the flow-adjusted return
  // index — deposits can't mask a crash and withdrawals can't fake one
  let maxDDPct = 0, index = 1, peak = 1;
  for (const r of portfolioReturns) {
    index *= 1 + r;
    if (index > peak) peak = index;
    const dd = (peak - index) / peak * 100;
    if (dd > maxDDPct) maxDDPct = dd;
  }

  return {
    volatility:      Number.parseFloat((volatility * 100).toFixed(2)),
    annualReturn:    Number.parseFloat((annualReturn * 100).toFixed(2)),
    sharpe:          sharpe  != null ? Number.parseFloat(sharpe.toFixed(2))  : null,
    sortino:         sortino != null ? Number.parseFloat(sortino.toFixed(2)) : null,
    beta:            beta    != null ? Number.parseFloat(beta.toFixed(2))    : null,
    maxDrawdownPct:  Number.parseFloat(maxDDPct.toFixed(2)),
  };
}

/**
 * Compute rolling period returns for portfolio and benchmark.
 * Portfolio returns are time-weighted (TWR over the period's chart slice),
 * so deposits/withdrawals inside the window don't show up as performance —
 * the same basis as the inception TWR and the benchmark price returns.
 */
function computeRollingReturns(chartData, benchmarkData, sp500Data, transactions = [], twrPct = null) {
  if (!chartData.length) return null;

  const latest   = chartData.at(-1);
  const today    = latest.date;
  const vwceMap  = Object.fromEntries(benchmarkData.map(b => [b.date, b.value]));
  const sp500Map = Object.fromEntries(sp500Data.map(b => [b.date, b.value]));

  // Benchmark candles may not include today's snapshot date — use the last available date
  const lastVwceDate  = benchmarkData.length ? benchmarkData.at(-1).date : null;
  const lastSp500Date = sp500Data.length     ? sp500Data.at(-1).date     : null;

  function findStartIdx(daysAgo) {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - daysAgo);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (let i = 0; i < chartData.length; i++) {
      if (chartData[i].date >= cutoffStr) return i;
    }
    return 0;
  }

  function ytdIdx() {
    const year = today.slice(0, 4);
    for (let i = 0; i < chartData.length; i++) {
      if (chartData[i].date >= `${year}-01-01`) return i;
    }
    return 0;
  }

  const benchReturn = (map, lastDate, startRow) => {
    const s = map[startRow.date], l = lastDate ? map[lastDate] : null;
    return s && l ? Number.parseFloat(((l / s - 1) * 100).toFixed(2)) : null;
  };

  function calcReturn(startIdx) {
    const startRow = chartData[startIdx];
    if (!startRow || startRow.date === latest.date) return null;
    return {
      portfolio: computeServerTWR(chartData.slice(startIdx), transactions),
      vwce:  benchReturn(vwceMap,  lastVwceDate,  startRow),
      sp500: benchReturn(sp500Map, lastSp500Date, startRow),
    };
  }

  const inception0 = calcReturn(0);
  return {
    '1w':        calcReturn(findStartIdx(7)),
    '1m':        calcReturn(findStartIdx(30)),
    '3m':        calcReturn(findStartIdx(91)),
    'ytd':       calcReturn(ytdIdx()),
    '1y':        calcReturn(findStartIdx(365)),
    '3y':        calcReturn(findStartIdx(365 * 3)),
    'inception': { portfolio: twrPct, vwce: inception0?.vwce ?? null, sp500: inception0?.sp500 ?? null },
  };
}

/**
 * Realized P&L and dividend income grouped by calendar year.
 * Returns array of { year, realizedPl, dividends, total } sorted newest first.
 */
function computeAnnualPl(txsByTicker, adjSharesFn) {
  const realizedByYear = {};
  const dividendsByYear = {};

  for (const [ticker, txs] of Object.entries(txsByTicker)) {
    // Dividends per year
    for (const tx of txs) {
      if (!isDividend(tx)) continue;
      const y = tx.date.slice(0, 4);
      // costEur must be positive for a dividend; guard against accidental
      // negative entries (same clamp as computeDividends)
      dividendsByYear[y] = (dividendsByYear[y] || 0) + Math.max(0, tx.costEur);
    }
    // Realized P&L per year via FIFO
    const sorted = [...txs].filter(tx => !isDividend(tx)).sort((a, b) => a.date.localeCompare(b.date));
    const lots = [];
    for (const tx of sorted) {
      const adjSh = adjSharesFn(tx, ticker);
      if (tx.shares > 0) {
        lots.push({ shares: adjSh, costPerShare: tx.costEur / adjSh });
      } else {
        const year = tx.date.slice(0, 4);
        const salePPS = tx.costEur / Math.abs(adjSh);
        let toSell = Math.abs(adjSh);
        for (const lot of lots) {
          const sold = Math.min(lot.shares, toSell);
          realizedByYear[year] = (realizedByYear[year] || 0) + sold * (salePPS - lot.costPerShare);
          lot.shares -= sold;
          toSell -= sold;
          if (toSell <= 0) break;
        }
      }
    }
  }

  const allYears = new Set([...Object.keys(realizedByYear), ...Object.keys(dividendsByYear)]);
  return [...allYears]
    .sort((a, b) => b.localeCompare(a))
    .map(year => ({
      year,
      realizedPl: Math.round((realizedByYear[year] || 0) * 100) / 100,
      dividends:  Math.round((dividendsByYear[year] || 0) * 100) / 100,
      total:      Math.round(((realizedByYear[year] || 0) + (dividendsByYear[year] || 0)) * 100) / 100,
    }));
}

/**
 * XIRR (money-weighted return) using Newton-Raphson.
 * Cash flows: buys = -costEur, sells = +costEur, terminal = +currentValue at today.
 */
function computeXIRR(transactions, currentValue) {
  const flows = transactions.map(tx => ({
    // dividends are positive cash inflows; buys negative, sells positive
    amount: isDividend(tx) ? tx.costEur : (tx.shares > 0 ? -tx.costEur : tx.costEur),
    t:      new Date(tx.date).getTime(),
  }));
  flows.push({ amount: currentValue, t: Date.now() });
  if (flows.length < 2) return null;

  // Anchor year fractions at the earliest flow — transactions.json is not guaranteed sorted
  const t0 = flows.reduce((min, f) => Math.min(min, f.t), Infinity);
  const cfs = flows.map(f => ({ amount: f.amount, years: (f.t - t0) / (365.25 * 86400000) }));

  const npv  = r => cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, cf.years), 0);
  const dnpv = r => cfs.reduce((s, cf) => s - cf.years * cf.amount / Math.pow(1 + r, cf.years + 1), 0);

  let r = 0.1;
  let converged = false;
  for (let i = 0; i < 100; i++) {
    const f  = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-10) {
      console.warn('[XIRR] Derivative near zero — cannot converge (flat/degenerate cash flows)');
      break;
    }
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-7) { r = rNew; converged = true; break; }
    r = rNew;
    if (r < -0.999 || r > 100) {
      console.warn(`[XIRR] Rate out of bounds (${r.toFixed(4)}) — diverged after ${i + 1} iterations`);
      return null;
    }
  }
  if (!converged) console.warn('[XIRR] Did not converge in 100 iterations — result may be inaccurate');

  if (!Number.isFinite(r) || r <= -1) return null;
  return Number.parseFloat((r * 100).toFixed(2));
}

/**
 * Time-weighted return over a chart-data slice: chains sub-period returns
 * split at external cash flows (buys = deposits, sells/dividends = withdrawals).
 * Returns final TWR as a percentage, or null for fewer than 2 points.
 */
function computeServerTWR(chartData, transactions) {
  if (chartData.length < 2) return null;

  const cfByDate = netCashFlowByDate(transactions);

  let twrFactor = 1.0;
  let subStart  = chartData[0].value;

  for (let i = 1; i < chartData.length; i++) {
    const row   = chartData[i];
    const netCF = cfByDate[row.date];
    if (netCF !== undefined) {
      const valueBeforeCF = row.value - netCF;
      if (subStart > 0) twrFactor *= valueBeforeCF / subStart;
      subStart = row.value;
    }
  }

  const lastRow = chartData.at(-1);
  const finalTwr = subStart > 0
    ? (twrFactor * lastRow.value / subStart - 1) * 100
    : (twrFactor - 1) * 100;

  return Number.parseFloat(finalTwr.toFixed(2));
}

module.exports = {
  RISK_FREE_RATE,
  computeRiskMetrics,
  computeRollingReturns,
  computeAnnualPl,
  computeXIRR,
  computeServerTWR,
};
