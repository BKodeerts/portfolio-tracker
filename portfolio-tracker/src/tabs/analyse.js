import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { BENCHMARK_SYM, BENCHMARK_LBL } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderDonutChart } from '../components/donut.js';

export function renderBarChart(latest) {
  const tickers = [...state.CURRENT_TICKERS].sort((a, b) => (latest[b] || 0) - (latest[a] || 0));
  state.chartInstances.bar = new Chart(document.getElementById('chartBar').getContext('2d'), {
    type: 'bar',
    data: {
      labels: tickers,
      datasets: [
        { label: 'Geïnvesteerd', data: tickers.map(t => latest[`${t}_cost`] || 0), backgroundColor: 'rgba(71,85,105,0.5)', borderRadius: 3, borderSkipped: false },
        { label: 'Huidig',       data: tickers.map(t => latest[t] || 0), backgroundColor: tickers.map(t => getColor(t) + 'CC'), borderRadius: 3, borderSkipped: false },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme().tooltipBg, borderColor: chartTheme().tooltipBorder, borderWidth: 1,
          titleColor: chartTheme().titleColor, bodyColor: chartTheme().bodyColor,
          titleFont: { family: "'DM Sans'", size: 11, weight: 700 }, bodyFont: { family: "'JetBrains Mono'", size: 11 },
          padding: 12, cornerRadius: 10,
          callbacks: { label: item => state.privacyMode ? ` ${item.dataset.label}: ●●●` : ` ${item.dataset.label}: ${fmt(item.raw)}` },
        },
      },
      scales: {
        x: { grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 }, callback: v => state.privacyMode ? '●●' : `€${(v / 1000).toFixed(0)}k` } },
        y: { grid: { display: false }, ticks: { color: chartTheme().tickColor, font: { size: 11 } } },
      },
    },
  });
}

export function renderDrawdownChart() {
  let peak = 0;
  const series = state.chartData.map(row => {
    if (row.total > peak) peak = row.total;
    return { x: row.date, y: peak > 0 ? parseFloat(((row.total - peak) / peak * 100).toFixed(2)) : 0 };
  });
  state.chartInstances.drawdown = new Chart(document.getElementById('chartDrawdown').getContext('2d'), {
    type: 'line',
    data: { datasets: [{ data: series, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)', fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme().tooltipBg, borderColor: chartTheme().tooltipBorder, borderWidth: 1,
          bodyColor: chartTheme().bodyColor, bodyFont: { family: "'JetBrains Mono'", size: 11 }, padding: 12, cornerRadius: 10,
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
            label: item => ` Drawdown: ${item.raw.y.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: { type: 'time', time: { unit: 'month' }, grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 } } },
        y: { suggestedMax: 0, grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 }, callback: v => `${v}%` } },
      },
    },
  });
}

export function renderBenchmarkChart() {
  const filtered = getFilteredData();
  if (filtered.length < 2) return;

  const startVwcePrice = state.priceMaps[BENCHMARK_SYM]?.[filtered[0].date];
  if (!startVwcePrice) return;

  // Group transactions by date to detect cash flows
  const txByDate = {};
  for (const tx of state.RAW_TRANSACTIONS) {
    if (!txByDate[tx.date]) txByDate[tx.date] = [];
    txByDate[tx.date].push(tx);
  }

  // Time-Weighted Return (TWR): sub-periods are broken at transaction dates.
  // At each cash flow: close sub-period using value BEFORE the flow, then open new sub-period.
  // This eliminates distortion from capital additions/withdrawals.
  let portfolioTwrFactor = 1.0;
  let vwceTwrFactor = 1.0;
  let portfolioSubStart = filtered[0].total;
  let vwceSubStart = startVwcePrice;

  const portfolioSeries = [{ x: filtered[0].date, y: 0 }];
  const benchSeries     = [{ x: filtered[0].date, y: 0 }];

  for (let i = 1; i < filtered.length; i++) {
    const row = filtered[i];
    const vwcePrice = state.priceMaps[BENCHMARK_SYM]?.[row.date];
    const txsToday  = txByDate[row.date];

    if (txsToday?.length) {
      // net_CF > 0 = money added (buys), net_CF < 0 = money removed (sells)
      const netCF = txsToday.reduce((s, tx) => s + (tx.shares > 0 ? tx.costEur : -tx.costEur), 0);
      const valueBeforeCF = row.total - netCF;
      // Close current sub-period
      if (portfolioSubStart > 0) portfolioTwrFactor *= valueBeforeCF / portfolioSubStart;
      if (vwcePrice != null && vwceSubStart > 0) vwceTwrFactor *= vwcePrice / vwceSubStart;
      // Open new sub-period after cash flow
      portfolioSubStart = row.total;
      vwceSubStart = vwcePrice ?? vwceSubStart;
    }

    const portfolioY = portfolioSubStart > 0
      ? (portfolioTwrFactor * row.total / portfolioSubStart - 1) * 100
      : (portfolioTwrFactor - 1) * 100;
    const vwceY = vwcePrice != null && vwceSubStart > 0
      ? (vwceTwrFactor * vwcePrice / vwceSubStart - 1) * 100
      : null;

    portfolioSeries.push({ x: row.date, y: parseFloat(portfolioY.toFixed(2)) });
    benchSeries.push({ x: row.date, y: vwceY != null ? parseFloat(vwceY.toFixed(2)) : null });
  }

  state.chartInstances.benchmark = new Chart(document.getElementById('chartBenchmark').getContext('2d'), {
    type: 'line',
    data: { datasets: [
      { label: 'Portefeuille', data: portfolioSeries, borderColor: '#818cf8', fill: false, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', spanGaps: true },
      { label: BENCHMARK_LBL,  data: benchSeries, borderColor: chartTheme().benchmarkLine, fill: false, borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', spanGaps: true },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme().tooltipBg, borderColor: chartTheme().tooltipBorder, borderWidth: 1,
          titleColor: chartTheme().titleColor, bodyColor: chartTheme().bodyColor,
          titleFont: { family: "'DM Sans'", size: 11, weight: 700 }, bodyFont: { family: "'JetBrains Mono'", size: 11 },
          padding: 12, cornerRadius: 10,
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
            label: item => ` ${item.dataset.label}: ${item.raw.y != null ? item.raw.y.toFixed(1) + '%' : '—'}`,
          },
        },
      },
      scales: {
        x: { type: 'time', time: { unit: 'month' }, grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 } } },
        y: { grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 }, callback: v => `${v}%` } },
      },
    },
  });
}

export function renderPositionsTable(latest) {
  const tickers = [...state.CURRENT_TICKERS].sort((a, b) => (latest[b] || 0) - (latest[a] || 0));
  let totalCost = 0, totalVal = 0;
  const rows = tickers.map(ticker => {
    const val  = latest[ticker] || 0;
    const cost = latest[`${ticker}_cost`] || 0;
    const pl   = val - cost;
    const pct  = cost > 0 ? (pl / cost * 100) : 0;
    const sh   = latest[`${ticker}_shares`] || 0;
    const avg  = sh > 0 && cost > 0 ? cost / sh : 0;
    totalCost += cost; totalVal += val;
    const cls = pl >= 0 ? 'c-pos' : 'c-neg';
    return `<tr>
      <td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${getColor(ticker)};margin-right:7px"></span>${ticker}</td>
      <td>${state.TICKER_META[ticker]?.label || ''}</td>
      <td>${sh.toLocaleString('nl-BE')}</td>
      <td>${avg > 0 ? '€' + avg.toFixed(2) : '—'}</td>
      <td>${fmt(cost)}</td>
      <td>${fmt(val)}</td>
      <td class="${cls}">${pl >= 0 ? '+' : ''}${fmt(pl)}</td>
      <td class="${cls}">${fmtPct(pct)}</td>
    </tr>`;
  }).join('');

  const totalPl  = totalVal - totalCost;
  const totalPct = totalCost > 0 ? (totalPl / totalCost * 100) : 0;
  const tc = totalPl >= 0 ? 'c-pos' : 'c-neg';

  document.getElementById('positionsTableWrap').innerHTML = `
    <table class="pos-table">
      <thead><tr>
        <th>Ticker</th><th>Naam</th><th>Aandelen</th><th>Gem. kostprijs</th>
        <th>Geïnvesteerd</th><th>Huidig</th><th>P&amp;L €</th><th>P&amp;L %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:left;font-family:inherit">Totaal</td>
        <td>${fmt(totalCost)}</td><td>${fmt(totalVal)}</td>
        <td class="${tc}">${totalPl >= 0 ? '+' : ''}${fmt(totalPl)}</td>
        <td class="${tc}">${fmtPct(totalPct)}</td>
      </tr></tfoot>
    </table>`;
}

export function renderAnalyseCharts() {
  const latest = state.chartData[state.chartData.length - 1];
  renderDonutChart(latest, 'chartDonut');
  renderBarChart(latest);
  renderDrawdownChart();
  renderBenchmarkChart();
  renderPositionsTable(latest);
}

export function renderAnalyse() {
  destroyAllCharts();
  state.currentTab = 'analyse';
  const latest = state.chartData[state.chartData.length - 1];

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="analyse-grid">
      <div class="chart-card">
        <div class="card-title">Allocatie</div>
        <div style="height:240px"><canvas id="chartDonut"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="card-title">Kostprijs vs Waarde</div>
        <div style="height:240px"><canvas id="chartBar"></canvas></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="card-title">Drawdown vanaf piek (volledige looptijd)</div>
        <div style="height:180px"><canvas id="chartDrawdown"></canvas></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="chart-header" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">Rendement vs ${BENCHMARK_LBL}</div>
          <div class="period-pills">
            <button class="pill ${state.currentPeriod === '1m'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('1m')">1M</button>
            <button class="pill ${state.currentPeriod === '3m'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('3m')">3M</button>
            <button class="pill ${state.currentPeriod === '6m'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('6m')">6M</button>
            <button class="pill ${state.currentPeriod === 'ytd'   ? 'on' : ''}" onclick="window._setPeriodAnalyse('ytd')">YTD</button>
            <button class="pill ${state.currentPeriod === '1y'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('1y')">1Y</button>
            <button class="pill ${state.currentPeriod === '2y'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('2y')">2Y</button>
            <button class="pill ${state.currentPeriod === '3y'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('3y')">3Y</button>
            <button class="pill ${state.currentPeriod === 'total' ? 'on' : ''}" onclick="window._setPeriodAnalyse('total')">Max</button>
          </div>
        </div>
        <div style="height:200px"><canvas id="chartBenchmark"></canvas></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="card-title">Posities detail</div>
        <div id="positionsTableWrap"></div>
      </div>
    </div>`;

  renderAnalyseCharts();
}
