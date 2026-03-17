import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { BENCHMARK_LBL } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderDonutChart } from '../components/donut.js';

export function sortPos(col) {
  if (state.posSort.col === col) state.posSort.dir = state.posSort.dir === 'desc' ? 'asc' : 'desc';
  else { state.posSort.col = col; state.posSort.dir = 'desc'; }
  renderPositionsTable(state.lastLatest);
}

export function closePosModal() {
  const el = document.getElementById('posModal');
  if (el) el.style.display = 'none';
  if (state.chartInstances.__posModal) { state.chartInstances.__posModal.destroy(); delete state.chartInstances.__posModal; }
}

export function showPosModal(ticker) {
  const meta  = state.TICKER_META[ticker] || {};
  const color = getColor(ticker);
  const txs   = state.RAW_TRANSACTIONS.filter(t => t.ticker === ticker).slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest = state.lastLatest;

  const val  = latest[ticker] || 0;
  const cost = latest[`${ticker}_cost`] || 0;
  const pl   = val - cost;
  const pct  = cost > 0 ? (pl / cost * 100) : 0;
  const sh   = latest[`${ticker}_shares`] || 0;
  const cls  = pl >= 0 ? 'c-pos' : 'c-neg';
  const sign = pl >= 0 ? '+' : '';

  const txRows = txs.map(t => {
    const isSale = t.shares < 0;
    const price  = Math.abs(t.costEur / t.shares);
    return `<tr>
      <td>${t.date}</td>
      <td style="color:${isSale ? '#ef4444' : '#16a34a'}">${isSale ? 'Verkoop' : 'Koop'}</td>
      <td>${Math.abs(t.shares).toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</td>
      <td>${fmt(Math.abs(t.costEur))}</td>
      <td>€${price.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const modal = document.getElementById('posModal');
  modal.innerHTML = `<div class="pos-modal-inner">
    <div class="pos-modal-header">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span style="font-size:16px;font-weight:700;flex-shrink:0">${ticker}</span>
      <span class="pos-modal-header-label" style="font-size:13px;color:#888">${meta.label || ''}</span>
      <button class="pos-modal-close" onclick="window._closePosModal()">✕</button>
    </div>
    <div class="pos-modal-stats">
      <div class="pos-modal-stat"><div class="pos-modal-stat-label">Aandelen</div><div class="pos-modal-stat-val">${sh.toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</div></div>
      <div class="pos-modal-stat"><div class="pos-modal-stat-label">Geïnvesteerd</div><div class="pos-modal-stat-val privacy-val">${fmt(cost)}</div></div>
      <div class="pos-modal-stat"><div class="pos-modal-stat-label">Huidig</div><div class="pos-modal-stat-val privacy-val">${fmt(val)}</div></div>
      <div class="pos-modal-stat"><div class="pos-modal-stat-label">P&amp;L</div><div class="pos-modal-stat-val ${cls} privacy-val">${sign}${fmt(pl)}</div><div class="pos-modal-stat-sub ${cls}">${sign}${pct.toFixed(1)}%</div></div>
    </div>
    <div class="pos-modal-chart-wrap"><canvas id="posModalChart"></canvas></div>
    <table class="pos-modal-tx-table">
      <thead><tr><th>Datum</th><th>Type</th><th>Aandelen</th><th>Kosten €</th><th>Prijs/stuk</th></tr></thead>
      <tbody>${txRows}</tbody>
    </table>
  </div>`;

  modal.style.display = 'block';

  if (state.chartInstances.__posModal) { state.chartInstances.__posModal.destroy(); delete state.chartInstances.__posModal; }

  const points = state.chartData.filter(row => row[ticker] != null).map(row => ({ x: row.date, y: row[ticker] }));
  const ct = chartTheme();
  state.chartInstances.__posModal = new Chart(document.getElementById('posModalChart').getContext('2d'), {
    type: 'line',
    data: { datasets: [{ data: points, borderColor: color, borderWidth: 2, fill: true, backgroundColor: color + '22', tension: 0.3, pointRadius: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
          titleColor: ct.titleColor, bodyColor: ct.bodyColor,
          titleFont: { family: "'DM Sans'", size: 11, weight: 700 }, bodyFont: { family: "'JetBrains Mono'", size: 11 },
          padding: 10, cornerRadius: 8,
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
            label: item => ` ${fmt(item.raw.y)}`,
          },
        },
      },
      scales: {
        x: { type: 'time', time: { unit: 'month' }, grid: { color: ct.gridColor }, ticks: { color: ct.tickColor, font: { size: 9 } } },
        y: { grid: { color: ct.gridColor }, ticks: { color: ct.tickColor, font: { size: 9 }, callback: v => '€' + Math.round(v).toLocaleString('nl-BE') } },
      },
    },
  });
}

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


export function renderBenchmarkChart() {
  const filtered = getFilteredData(state.analysePeriod);
  if (filtered.length < 2) return;

  const benchMap = Object.fromEntries(state.benchmarkData.map(b => [b.date, b.value]));
  const startVwcePrice = benchMap[filtered[0].date];
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
    const vwcePrice = benchMap[row.date];
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
  state.lastLatest = latest;

  const rowData = [...state.CURRENT_TICKERS].map(ticker => {
    const val  = latest[ticker] || 0;
    const cost = latest[`${ticker}_cost`] || 0;
    const pl   = val - cost;
    const pct  = cost > 0 ? (pl / cost * 100) : 0;
    const sh   = latest[`${ticker}_shares`] || 0;
    const avg  = sh > 0 && cost > 0 ? cost / sh : 0;
    return { ticker, val, cost, pl, pct, sh, avg };
  });

  rowData.sort((a, b) => {
    let av, bv;
    switch (state.posSort.col) {
      case 'ticker':  av = a.ticker; bv = b.ticker; break;
      case 'label':   av = state.TICKER_META[a.ticker]?.label || ''; bv = state.TICKER_META[b.ticker]?.label || ''; break;
      case 'shares':  av = a.sh;   bv = b.sh;   break;
      case 'avgcost': av = a.avg;  bv = b.avg;  break;
      case 'cost':    av = a.cost; bv = b.cost; break;
      case 'pl':      av = a.pl;   bv = b.pl;   break;
      case 'pct':     av = a.pct;  bv = b.pct;  break;
      default:        av = a.val;  bv = b.val;
    }
    if (typeof av === 'string') return state.posSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return state.posSort.dir === 'asc' ? av - bv : bv - av;
  });

  let totalCost = 0, totalVal = 0;
  const rows = rowData.map(({ ticker, val, cost, pl, pct, sh, avg }) => {
    totalCost += cost; totalVal += val;
    const cls = pl >= 0 ? 'c-pos' : 'c-neg';
    return `<tr onclick="window._showPosModal('${ticker}')">
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

  const th = (col, label, align) => {
    const active = state.posSort.col === col;
    let arrow = '';
    if (active) arrow = state.posSort.dir === 'asc' ? ' ▲' : ' ▼';
    const styleAttr = align ? `style="text-align:${align}"` : '';
    return `<th onclick="window._sortPos('${col}')" class="${active ? 'sort-active' : ''}" ${styleAttr}>${label}${arrow}</th>`;
  };

  document.getElementById('positionsTableWrap').innerHTML = `
    <table class="pos-table">
      <thead><tr>
        ${th('ticker','Ticker','left')}${th('label','Naam','left')}${th('shares','Aandelen')}${th('avgcost','Gem. kostprijs')}
        ${th('cost','Geïnvesteerd')}${th('value','Huidig')}${th('pl','P&amp;L €')}${th('pct','P&amp;L %')}
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
        <div class="chart-header" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">Rendement vs ${BENCHMARK_LBL}</div>
          <div class="period-pills desktop-only">
            <button class="pill ${state.analysePeriod === '1m'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('1m')">1M</button>
            <button class="pill ${state.analysePeriod === '3m'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('3m')">3M</button>
            <button class="pill ${state.analysePeriod === '6m'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('6m')">6M</button>
            <button class="pill ${state.analysePeriod === 'ytd'   ? 'on' : ''}" onclick="window._setPeriodAnalyse('ytd')">YTD</button>
            <button class="pill ${state.analysePeriod === '1y'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('1y')">1Y</button>
            <button class="pill ${state.analysePeriod === '2y'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('2y')">2Y</button>
            <button class="pill ${state.analysePeriod === '3y'    ? 'on' : ''}" onclick="window._setPeriodAnalyse('3y')">3Y</button>
            <button class="pill ${state.analysePeriod === 'total' ? 'on' : ''}" onclick="window._setPeriodAnalyse('total')">Max</button>
          </div>
          <div class="chart-controls-mobile">
            <select class="mobile-select" onchange="window._setPeriodAnalyse(this.value)">
              <option value="1m"    ${state.analysePeriod === '1m'    ? 'selected' : ''}>1M</option>
              <option value="3m"    ${state.analysePeriod === '3m'    ? 'selected' : ''}>3M</option>
              <option value="6m"    ${state.analysePeriod === '6m'    ? 'selected' : ''}>6M</option>
              <option value="ytd"   ${state.analysePeriod === 'ytd'   ? 'selected' : ''}>YTD</option>
              <option value="1y"    ${state.analysePeriod === '1y'    ? 'selected' : ''}>1Y</option>
              <option value="2y"    ${state.analysePeriod === '2y'    ? 'selected' : ''}>2Y</option>
              <option value="3y"    ${state.analysePeriod === '3y'    ? 'selected' : ''}>3Y</option>
              <option value="total" ${state.analysePeriod === 'total' ? 'selected' : ''}>Max</option>
            </select>
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
