import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { BENCHMARK_LBL } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderDonutChart } from '../components/donut.js';
import { saveTickerMeta } from '../api.js';

const SECTOR_COLORS = ['#818cf8','#34d399','#fbbf24','#f87171','#60a5fa','#a78bfa','#fb923c','#4ade80','#38bdf8','#f472b6'];
const TYPE_COLORS   = ['#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#fb923c','#38bdf8','#4ade80','#f472b6','#818cf8'];
const QUOTE_TYPE_LABELS = { EQUITY:'Aandeel', ETF:'ETF', MUTUALFUND:'Fonds', OPTION:'Optie', WARRANT:'Warrant', FUTURE:'Future', INDEX:'Index', CURRENCY:'Valuta', CRYPTOCURRENCY:'Crypto' };

// ── Sort state ────────────────────────────────────────────────────────────────

export function sortPos(col) {
  if (state.posSort.col === col) state.posSort.dir = state.posSort.dir === 'desc' ? 'asc' : 'desc';
  else { state.posSort.col = col; state.posSort.dir = 'desc'; }
  renderPositionsTable(state.lastLatest);
}

// ── Position modal ────────────────────────────────────────────────────────────

export function closePosModal() {
  const el = document.getElementById('posModal');
  if (el) el.style.display = 'none';
  if (state.chartInstances.__posModal) { state.chartInstances.__posModal.destroy(); delete state.chartInstances.__posModal; }
}

export function showPosModal(ticker) {
  const meta      = state.TICKER_META[ticker] || {};
  const color     = getColor(ticker);
  const txs       = state.RAW_TRANSACTIONS.filter(t => t.ticker === ticker).slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest    = (ticker in state.lastLatest ? state.lastLatest : state.chartData.at(-1)) ?? {};

  const val       = latest[ticker] || 0;
  const cost      = latest[`${ticker}_cost`] || 0;
  const pl        = val - cost;
  const pct       = cost > 0 ? (pl / cost * 100) : 0;
  const sh        = latest[`${ticker}_shares`] || 0;
  const realPl    = state.realizedPlPerTicker?.[ticker] || 0;
  const cls       = pl >= 0 ? 'c-pos' : 'c-neg';
  const realCls   = realPl >= 0 ? 'c-pos' : 'c-neg';
  const sign      = pl >= 0 ? '+' : '';
  const realSign  = realPl >= 0 ? '+' : '';

  const high52 = meta.high52;
  const low52  = meta.low52;
  const peRatio = meta.pe;

  const txRows = txs.map(t => {
    const isSale = t.shares < 0;
    const price  = Math.abs(t.costEur / t.shares);
    const note   = t.note ? `<div class="c-neutral" style="font-size:10px;margin-top:2px">${t.note}</div>` : '';
    return `<tr>
      <td>${t.date}</td>
      <td style="color:${isSale ? '#ef4444' : '#16a34a'}">${isSale ? 'Verkoop' : 'Koop'}</td>
      <td>${Math.abs(t.shares).toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</td>
      <td>${fmt(Math.abs(t.costEur))}</td>
      <td>€${price.toFixed(2)}${note}</td>
    </tr>`;
  }).join('');

  const extraAttrs = [
    high52  ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">52W Hoog</div><div class="pos-modal-stat-val">€${high52.toFixed(2)}</div></div>` : '',
    low52   ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">52W Laag</div><div class="pos-modal-stat-val">€${low52.toFixed(2)}</div></div>` : '',
    peRatio ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">P/E</div><div class="pos-modal-stat-val">${peRatio.toFixed(1)}</div></div>` : '',
  ].join('');

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
      <div class="pos-modal-stat"><div class="pos-modal-stat-label">Ongerealiseerd</div><div class="pos-modal-stat-val ${cls} privacy-val">${sign}${fmt(pl)}</div><div class="pos-modal-stat-sub ${cls}">${sign}${pct.toFixed(1)}%</div></div>
      <div class="pos-modal-stat"><div class="pos-modal-stat-label">Gerealiseerd</div><div class="pos-modal-stat-val ${realCls} privacy-val">${realSign}${fmt(realPl)}</div></div>
      ${extraAttrs}
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

// ── Charts ────────────────────────────────────────────────────────────────────

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
        x: { grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 }, callback: v => state.privacyMode ? '●●' : `€${Math.round(v / 1000)}k` } },
        y: { grid: { display: false }, ticks: { color: chartTheme().tickColor, font: { size: 11 } } },
      },
    },
  });
}

export function renderCurrencyDonut() {
  const el = document.getElementById('chartCurrencyDonut');
  if (!el) return;
  const usd = state.usdExposurePct ?? 0;
  const eur = 100 - usd;
  el.innerHTML = `
    <div class="currency-split">
      <div class="currency-labels">
        <div class="currency-label">
          <div class="currency-label-name">USD</div>
          <div class="currency-label-pct" style="color:#fbbf24">${usd.toFixed(1)}%</div>
        </div>
        <div class="currency-label" style="text-align:right">
          <div class="currency-label-name">EUR</div>
          <div class="currency-label-pct" style="color:#818cf8">${eur.toFixed(1)}%</div>
        </div>
      </div>
      <div class="currency-bar">
        <div style="width:${usd}%;background:#fbbf24"></div>
        <div style="flex:1;background:#818cf8"></div>
      </div>
    </div>`;
}

export function renderSectorDonut(latest) {
  const el = document.getElementById('chartSectorDonut');
  if (!el) return;

  // Group position values by sector
  const sectorValues = {};
  for (const ticker of state.CURRENT_TICKERS) {
    const sector = state.TICKER_META?.[ticker]?.sector || 'Overig';
    sectorValues[sector] = (sectorValues[sector] || 0) + (latest[ticker] || 0);
  }
  const sectors = Object.keys(sectorValues).sort((a, b) => sectorValues[b] - sectorValues[a]);
  const values  = sectors.map(s => sectorValues[s]);
  const total   = values.reduce((a, b) => a + b, 0);
  const colors  = sectors.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length]);
  const ct      = chartTheme();

  const legendEl = document.getElementById('chartSectorDonutLegend');
  if (legendEl) {
    legendEl.innerHTML = sectors.map((s, i) => {
      const pct = total > 0 ? (values[i] / total * 100) : 0;
      return `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i]}"></span>
        <span class="donut-legend-ticker">${s}</span>
        <span class="donut-legend-pct">${pct.toFixed(1)}%</span>
      </div>`;
    }).join('');
  }

  state.chartInstances.sectorDonut = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: sectors,
      datasets: [{ data: values, backgroundColor: colors, borderColor: ct.donutBorder, borderWidth: 2, hoverOffset: 5 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
          bodyColor: ct.bodyColor, bodyFont: { family: "'JetBrains Mono'", size: 11 }, padding: 12, cornerRadius: 10,
          callbacks: { label: item => ` ${item.label}: ${state.privacyMode ? '●●●' : fmt(item.raw)} (${((item.raw / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%)` },
        },
      },
    },
  });
}

export function renderIndustryDonut(latest) {
  const el = document.getElementById('chartIndustryDonut');
  if (!el) return;

  const industryValues = {};
  for (const ticker of state.CURRENT_TICKERS) {
    const industry = state.TICKER_META?.[ticker]?.industry || 'Overig';
    industryValues[industry] = (industryValues[industry] || 0) + (latest[ticker] || 0);
  }
  const industries = Object.keys(industryValues).sort((a, b) => industryValues[b] - industryValues[a]);
  const values     = industries.map(s => industryValues[s]);
  const total      = values.reduce((a, b) => a + b, 0);
  const colors     = industries.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length]);
  const ct         = chartTheme();

  const legendEl = document.getElementById('chartIndustryDonutLegend');
  if (legendEl) {
    legendEl.innerHTML = industries.map((s, i) => {
      const pct = total > 0 ? (values[i] / total * 100) : 0;
      return `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i]}"></span>
        <span class="donut-legend-ticker">${s}</span>
        <span class="donut-legend-pct">${pct.toFixed(1)}%</span>
      </div>`;
    }).join('');
  }

  state.chartInstances.industryDonut = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: industries,
      datasets: [{ data: values, backgroundColor: colors, borderColor: ct.donutBorder, borderWidth: 2, hoverOffset: 5 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
          bodyColor: ct.bodyColor, bodyFont: { family: "'JetBrains Mono'", size: 11 }, padding: 12, cornerRadius: 10,
          callbacks: { label: item => ` ${item.label}: ${state.privacyMode ? '●●●' : fmt(item.raw)} (${((item.raw / total) * 100).toFixed(1)}%)` },
        },
      },
    },
  });
}

export function renderAssetTypeDonut(latest) {
  const el = document.getElementById('chartTypeDonut');
  if (!el) return;

  const typeValues = {};
  for (const ticker of state.CURRENT_TICKERS) {
    const raw  = state.TICKER_META?.[ticker]?.quoteType || null;
    const label = (raw && QUOTE_TYPE_LABELS[raw]) ? QUOTE_TYPE_LABELS[raw] : (raw || 'Overig');
    typeValues[label] = (typeValues[label] || 0) + (latest[ticker] || 0);
  }
  const types  = Object.keys(typeValues).sort((a, b) => typeValues[b] - typeValues[a]);
  const values = types.map(t => typeValues[t]);
  const total  = values.reduce((a, b) => a + b, 0);
  const colors = types.map((_, i) => TYPE_COLORS[i % TYPE_COLORS.length]);
  const ct     = chartTheme();

  const legendEl = document.getElementById('chartTypeDonutLegend');
  if (legendEl) {
    legendEl.innerHTML = types.map((t, i) => {
      const pct = total > 0 ? (values[i] / total * 100) : 0;
      return `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i]}"></span>
        <span class="donut-legend-ticker">${t}</span>
        <span class="donut-legend-pct">${pct.toFixed(1)}%</span>
      </div>`;
    }).join('');
  }

  state.chartInstances.typeDonut = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: types,
      datasets: [{ data: values, backgroundColor: colors, borderColor: ct.donutBorder, borderWidth: 2, hoverOffset: 5 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
          bodyColor: ct.bodyColor, bodyFont: { family: "'JetBrains Mono'", size: 11 }, padding: 12, cornerRadius: 10,
          callbacks: { label: item => ` ${item.label}: ${state.privacyMode ? '●●●' : fmt(item.raw)} (${((item.raw / total) * 100).toFixed(1)}%)` },
        },
      },
    },
  });
}

function buildBenchmarkSeries(filtered, ...benchMaps) {
  const txByDate = {};
  for (const tx of state.RAW_TRANSACTIONS) {
    (txByDate[tx.date] = txByDate[tx.date] || []).push(tx);
  }

  const startDate = filtered[0].date;
  const startCost = filtered[0].totalCost || filtered[0].total;

  // Buy benchmark units equal to startCost at start-of-period price
  const benchUnits = benchMaps.map(m => {
    const p = m[startDate];
    return p && startCost > 0 ? startCost / p : 0;
  });

  const portfolioSeries = [{ x: startDate, y: 0 }];
  const benchSeriesArr  = benchMaps.map(() => [{ x: startDate, y: 0 }]);

  for (let i = 1; i < filtered.length; i++) {
    const row       = filtered[i];
    const totalCost = row.totalCost || 0;
    const txsToday  = txByDate[row.date] || [];

    // Mirror cash flows (buys/sells) into benchmark
    for (const tx of txsToday) {
      if (tx.date <= startDate) continue;
      const cash = tx.shares > 0 ? tx.costEur : -tx.costEur;
      benchMaps.forEach((m, j) => {
        const p = m[row.date];
        if (p) benchUnits[j] += cash / p;
      });
    }

    // Portfolio: unrealized return on FIFO cost basis (matches portfolio tab)
    const portfolioY = totalCost > 0 ? (row.total / totalCost - 1) * 100 : 0;
    portfolioSeries.push({ x: row.date, y: Number.parseFloat(portfolioY.toFixed(2)) });

    benchMaps.forEach((m, j) => {
      const p  = m[row.date];
      const bv = p != null ? benchUnits[j] * p : null;
      const y  = bv != null && totalCost > 0 ? (bv / totalCost - 1) * 100 : null;
      benchSeriesArr[j].push({ x: row.date, y: y == null ? null : Number.parseFloat(y.toFixed(2)) });
    });
  }

  return { portfolioSeries, benchSeriesArr };
}

export function renderBenchmarkChart() {
  const filtered = getFilteredData(state.analysePeriod);
  if (filtered.length < 2) return;

  const vwceMap  = Object.fromEntries(state.benchmarkData.map(b => [b.date, b.value]));
  const sp500Map = Object.fromEntries(state.sp500Data.map(b => [b.date, b.value]));
  const ab = state.activeBenchmark;

  const activeMaps   = ab === 'both' ? [vwceMap, sp500Map] : ab === 'sp500' ? [sp500Map] : [vwceMap];
  const activeLabels = ab === 'both' ? [BENCHMARK_LBL, 'S&P 500'] : ab === 'sp500' ? ['S&P 500'] : [BENCHMARK_LBL];
  const activeColors = ['#34d399', '#fbbf24'];

  if (!activeMaps[0][filtered[0].date]) return;

  const { portfolioSeries, benchSeriesArr } = buildBenchmarkSeries(filtered, ...activeMaps);
  const ct = chartTheme();

  const benchDatasets = benchSeriesArr.map((series, i) => ({
    label: activeLabels[i], data: series,
    borderColor: activeColors[i], fill: false, borderWidth: 1.5,
    borderDash: [4, 4], pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', spanGaps: true,
  }));

  state.chartInstances.benchmark = new Chart(document.getElementById('chartBenchmark').getContext('2d'), {
    type: 'line',
    data: { datasets: [
      { label: 'Portefeuille', data: portfolioSeries, borderColor: '#818cf8', fill: false, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', spanGaps: true },
      ...benchDatasets,
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

export function setBenchmark(key) {
  state.activeBenchmark = key;
  if (state.chartInstances.benchmark) { state.chartInstances.benchmark.destroy(); delete state.chartInstances.benchmark; }
  renderBenchmarkChart();
  document.querySelectorAll('#benchmarkPills .pill').forEach(b => b.classList.toggle('on', b.dataset.bench === key));
}

// ── Rolling returns table ─────────────────────────────────────────────────────

function renderRollingReturnsTable() {
  const el = document.getElementById('rollingReturnsTable');
  if (!el) return;
  const rr = state.rollingReturns;
  if (!rr) { el.innerHTML = '<div class="c-neutral" style="font-size:12px;padding:12px">Onvoldoende data</div>'; return; }

  const periods   = ['1w', '1m', '3m', 'ytd', '1y', 'inception'];
  const labels    = { '1w': '1W', '1m': '1M', '3m': '3M', 'ytd': 'YTD', '1y': '1J', 'inception': 'Totaal' };
  const fmtR = v => {
    if (v == null) return '<span class="c-neutral">—</span>';
    const cls = v >= 0 ? 'c-pos' : 'c-neg';
    return `<span class="${cls}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
  };

  // For inception (TOTAL), use cost-basis return to match the portfolio tab
  const lastRow = state.chartData.at(-1);
  const costBasisReturn = lastRow?.totalCost > 0
    ? Number.parseFloat(((lastRow.total / lastRow.totalCost - 1) * 100).toFixed(1))
    : null;

  const getPortfolioVal = p => p === 'inception' ? costBasisReturn : rr[p]?.portfolio;

  const header   = periods.map(p => `<th>${labels[p]}</th>`).join('');
  const portRow  = periods.map(p => `<td>${state.privacyMode ? '●●' : fmtR(getPortfolioVal(p))}</td>`).join('');
  const vwceRow  = periods.map(p => `<td>${fmtR(rr[p]?.vwce)}</td>`).join('');
  const sp500Row = periods.map(p => `<td>${fmtR(rr[p]?.sp500)}</td>`).join('');

  el.innerHTML = `<table class="perf-table">
    <thead><tr><th></th>${header}</tr></thead>
    <tbody>
      <tr><td style="font-weight:600;color:#818cf8">Portefeuille</td>${portRow}</tr>
      <tr><td style="color:#34d399">${BENCHMARK_LBL}</td>${vwceRow}</tr>
      <tr><td style="color:#fbbf24">S&amp;P 500</td>${sp500Row}</tr>
    </tbody>
  </table>`;
}

// ── Risk metrics card ─────────────────────────────────────────────────────────

function renderRiskMetricsCard() {
  const el = document.getElementById('riskMetricsGrid');
  if (!el) return;
  const rm  = state.riskMetrics;
  const twr = state.twrPct;
  const irr = state.irrPct;

  if (!rm && twr == null && irr == null) {
    el.innerHTML = '<div class="c-neutral" style="font-size:12px;padding:4px">Onvoldoende data (min. 30 dagen)</div>';
    return;
  }

  const stat = (label, value, tooltip = '') =>
    `<div class="risk-stat" title="${tooltip}">
      <div class="risk-stat-label">${label}</div>
      <div class="risk-stat-val">${value}</div>
    </div>`;

  const pct  = v => v != null ? `${v >= 0 ? '' : ''}${v.toFixed(1)}%` : '—';
  const num  = v => v != null ? v.toFixed(2) : '—';
  const days = v => v != null ? `${v}d` : '—';
  const ret  = v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

  el.innerHTML = [
    stat('Volatiliteit', state.privacyMode ? '●●' : pct(rm?.volatility), 'Geannualiseerde standaarddeviatie van dagrendement'),
    stat('Sharpe Ratio', num(rm?.sharpe), 'Risicogecorrigeerd rendement (3% risicovrije rente)'),
    stat('Beta', num(rm?.beta), 'Koersgevoeligheid t.o.v. VWCE'),
    stat('Max DD Duur', days(rm?.maxDrawdownDays), 'Langste aaneengesloten periode met verlies'),
    stat('Jaarrendement', state.privacyMode ? '●●' : ret(rm?.annualReturn), 'Samengesteld jaarlijks rendement (CAGR)'),
    twr != null ? stat('TWR', state.privacyMode ? '●●' : ret(twr), 'Tijdgewogen rendement — effect van cashflows geëlimineerd') : '',
    irr != null ? stat('IRR', state.privacyMode ? '●●' : ret(irr), 'Geldgewogen rendement — interne rentevoet') : '',
  ].join('');
}

// ── Positions table ───────────────────────────────────────────────────────────

function getPosColValue(row, col) {
  switch (col) {
    case 'ticker':  return row.ticker;
    case 'label':   return state.TICKER_META[row.ticker]?.label || '';
    case 'shares':  return row.sh;
    case 'avgcost': return row.avg;
    case 'cost':    return row.cost;
    case 'pl':      return row.pl;
    case 'pct':     return row.pct;
    case 'realpl':  return row.realPl;
    default:        return row.val;
  }
}

export function renderPositionsTable(latest) {
  state.lastLatest = latest;

  const rowData = [...state.CURRENT_TICKERS].map(ticker => {
    const val     = latest[ticker] || 0;
    const cost    = latest[`${ticker}_cost`] || 0;
    const pl      = val - cost;
    const pct     = cost > 0 ? (pl / cost * 100) : 0;
    const sh      = latest[`${ticker}_shares`] || 0;
    const avg     = sh > 0 && cost > 0 ? cost / sh : 0;
    const realPl  = state.realizedPlPerTicker?.[ticker] || 0;
    return { ticker, val, cost, pl, pct, sh, avg, realPl };
  });

  rowData.sort((a, b) => {
    const av = getPosColValue(a, state.posSort.col);
    const bv = getPosColValue(b, state.posSort.col);
    if (typeof av === 'string') return state.posSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return state.posSort.dir === 'asc' ? av - bv : bv - av;
  });

  let totalCost = 0, totalVal = 0, totalRealPl = 0;
  const rows = rowData.map(({ ticker, val, cost, pl, pct, sh, avg, realPl }) => {
    totalCost += cost; totalVal += val; totalRealPl += realPl;
    const cls     = pl >= 0 ? 'c-pos' : 'c-neg';
    const realCls = realPl >= 0 ? 'c-pos' : 'c-neg';
    return `<tr onclick="window._showPosModal('${ticker}')">
      <td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${getColor(ticker)};margin-right:7px"></span>${ticker}</td>
      <td>${state.TICKER_META[ticker]?.label || ''}</td>
      <td>${sh.toLocaleString('nl-BE')}</td>
      <td>${avg > 0 ? '€' + avg.toFixed(2) : '—'}</td>
      <td>${fmt(cost)}</td>
      <td>${fmt(val)}</td>
      <td class="${cls}">${pl >= 0 ? '+' : ''}${fmt(pl)}</td>
      <td class="${cls}">${fmtPct(pct)}</td>
      <td class="${realCls} privacy-val">${realPl !== 0 ? (realPl >= 0 ? '+' : '') + fmt(realPl) : '—'}</td>
    </tr>`;
  }).join('');

  const totalPl  = totalVal - totalCost;
  const totalPct = totalCost > 0 ? (totalPl / totalCost * 100) : 0;
  const tc       = totalPl >= 0 ? 'c-pos' : 'c-neg';
  const trc      = totalRealPl >= 0 ? 'c-pos' : 'c-neg';

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
        ${th('cost','Geïnvesteerd')}${th('value','Huidig')}${th('pl','P&amp;L €')}${th('pct','P&amp;L %')}${th('realpl','Gerealiseerd')}
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:left;font-family:inherit">Totaal</td>
        <td>${fmt(totalCost)}</td><td>${fmt(totalVal)}</td>
        <td class="${tc}">${totalPl >= 0 ? '+' : ''}${fmt(totalPl)}</td>
        <td class="${tc}">${fmtPct(totalPct)}</td>
        <td class="${trc} privacy-val">${totalRealPl >= 0 ? '+' : ''}${fmt(totalRealPl)}</td>
      </tr></tfoot>
    </table>`;
}

// ── Ticker metadata editor ────────────────────────────────────────────────────

export async function saveTickerMetaUI() {
  const allTickers = Object.keys(state.TICKER_META);
  const result = {};
  for (const ticker of allTickers) {
    const geo    = document.getElementById(`meta_geo_${ticker}`)?.value?.trim() || '';
    const priceEl = document.getElementById(`meta_price_${ticker}`);
    const asOfEl  = document.getElementById(`meta_asof_${ticker}`);
    const manualPriceEur  = priceEl ? Number.parseFloat(priceEl.value) || null : null;
    const manualPriceAsOf = asOfEl  ? asOfEl.value || null : null;
    const existing = state.tickerMeta[ticker] || {};
    const merged   = { ...existing };
    if (geo) merged.geo = geo; else delete merged.geo;
    if (manualPriceEur && manualPriceAsOf) { merged.manualPriceEur = manualPriceEur; merged.manualPriceAsOf = manualPriceAsOf; }
    else { delete merged.manualPriceEur; delete merged.manualPriceAsOf; }
    if (Object.keys(merged).length) result[ticker] = merged;
  }
  try {
    const json = await saveTickerMeta(result);
    if (json.status !== 'ok') throw new Error(json.message);
    alert('Opgeslagen. Herlaad de pagina om wijzigingen te zien.');
  } catch (e) {
    alert('Opslaan mislukt: ' + e.message);
  }
}

export async function resetSectorsUI() {
  if (!confirm('Sectoren en type-info wissen zodat Yahoo de data opnieuw ophaalt?')) return;
  const clean = {};
  for (const [ticker, tm] of Object.entries(state.tickerMeta)) {
    const { sector: _s, quoteType: _q, ...rest } = tm;
    if (Object.keys(rest).length) clean[ticker] = rest;
  }
  try {
    const json = await saveTickerMeta(clean);
    if (json.status !== 'ok') throw new Error(json.message);
    window.location.reload();
  } catch (e) {
    alert('Reset mislukt: ' + e.message);
  }
}

function renderTickerMetaEditor() {
  const el = document.getElementById('tickerMetaEditor');
  if (!el) return;
  const tickers = Object.keys(state.TICKER_META);
  if (!tickers.length) { el.style.display = 'none'; return; }

  const rows = tickers.map(ticker => {
    const tm      = state.tickerMeta[ticker] || {};
    const meta    = state.TICKER_META[ticker] || {};
    const hasManual = tm.manualPriceEur && tm.manualPriceAsOf;
    const rawType = meta.quoteType || null;
    const typeLabel = (rawType && QUOTE_TYPE_LABELS[rawType]) ? QUOTE_TYPE_LABELS[rawType] : (rawType || '—');
    const sectorLabel = meta.sector || '—';
    return `<tr>
      <td style="font-weight:600">${ticker}<div class="c-neutral" style="font-size:10px">${meta.label || ''}</div></td>
      <td class="c-neutral" style="font-size:12px">${typeLabel}</td>
      <td class="c-neutral" style="font-size:12px">${sectorLabel}</td>
      <td><input class="meta-input" id="meta_geo_${ticker}" value="${tm.geo || ''}" placeholder="bv. US, EU" style="width:70px"></td>
      <td>
        <input class="meta-input" id="meta_price_${ticker}" type="number" step="0.01" value="${hasManual ? tm.manualPriceEur : ''}" placeholder="prijs €" style="width:80px">
        <input class="meta-input" id="meta_asof_${ticker}" type="date" value="${hasManual ? tm.manualPriceAsOf : ''}" style="width:120px;margin-left:6px">
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <details>
      <summary class="c-neutral" style="cursor:pointer;font-size:13px;font-weight:600;margin-bottom:12px;list-style:none">
        ▸ Ticker instellingen (geo, manuele prijs)
      </summary>
      <table class="pos-table" style="margin-top:8px">
        <thead><tr><th style="text-align:left">Ticker</th><th>Type</th><th>Sector</th><th>Geo</th><th>Manuele prijs (€ + datum)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn success" onclick="window._saveTickerMetaUI()">Opslaan</button>
        <button class="btn" onclick="window._resetSectorsUI()">Sectoren resetten (Yahoo)</button>
      </div>
    </details>`;
}

// ── Breakdown tab ─────────────────────────────────────────────────────────────

function getAvailableTabs() {
  const hasSectors    = new Set(state.CURRENT_TICKERS.map(t => state.TICKER_META?.[t]?.sector).filter(Boolean)).size >= 1;
  const hasIndustries = new Set(state.CURRENT_TICKERS.map(t => state.TICKER_META?.[t]?.industry).filter(Boolean)).size >= 1;
  const hasTypes      = state.CURRENT_TICKERS.some(t => state.TICKER_META?.[t]?.quoteType);
  return [
    'allocatie',
    hasSectors    ? 'sector'    : null,
    hasIndustries ? 'industrie' : null,
    hasTypes      ? 'type'      : null,
    'munt',
  ].filter(Boolean);
}

function renderBreakdownContent(latest) {
  const el = document.getElementById('breakdownContent');
  if (!el) return;

  // Destroy any previous breakdown chart instances
  ['donut', 'sectorDonut', 'industryDonut', 'typeDonut'].forEach(key => {
    if (state.chartInstances[key]) { state.chartInstances[key].destroy(); delete state.chartInstances[key]; }
  });

  const tab = state.breakdownTab;
  if (tab === 'allocatie') {
    el.innerHTML = `<div class="donut-with-legend"><div class="donut-canvas-wrap"><canvas id="chartDonut"></canvas></div><div id="chartDonutLegend" class="donut-legend-list"></div></div>`;
    renderDonutChart(latest, 'chartDonut');
  } else if (tab === 'sector') {
    el.innerHTML = `<div class="donut-with-legend"><div class="donut-canvas-wrap"><canvas id="chartSectorDonut"></canvas></div><div id="chartSectorDonutLegend" class="donut-legend-list"></div></div>`;
    renderSectorDonut(latest);
  } else if (tab === 'industrie') {
    el.innerHTML = `<div class="donut-with-legend"><div class="donut-canvas-wrap"><canvas id="chartIndustryDonut"></canvas></div><div id="chartIndustryDonutLegend" class="donut-legend-list"></div></div>`;
    renderIndustryDonut(latest);
  } else if (tab === 'type') {
    el.innerHTML = `<div class="donut-with-legend"><div class="donut-canvas-wrap"><canvas id="chartTypeDonut"></canvas></div><div id="chartTypeDonutLegend" class="donut-legend-list"></div></div>`;
    renderAssetTypeDonut(latest);
  } else {
    el.innerHTML = `<div id="chartCurrencyDonut"></div>`;
    renderCurrencyDonut();
  }
}

export function setBreakdownTab(tab) {
  state.breakdownTab = tab;
  document.querySelectorAll('#breakdownTabs .seg-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.tab === tab);
  });
  renderBreakdownContent(state.lastLatest);
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export function renderAnalyseCharts() {
  const latest = state.chartData[state.chartData.length - 1];

  // Ensure breakdownTab is valid for available data
  const available = getAvailableTabs();
  if (!available.includes(state.breakdownTab)) state.breakdownTab = available[0];

  renderBarChart(latest);
  renderBreakdownContent(latest);
  renderBenchmarkChart();
  renderRollingReturnsTable();
  renderRiskMetricsCard();
  renderPositionsTable(latest);
  renderTickerMetaEditor();
}

export function renderAnalyse() {
  destroyAllCharts();
  state.currentTab = 'analyse';
  const latest = state.chartData[state.chartData.length - 1];

  const available = getAvailableTabs();
  if (!available.includes(state.breakdownTab)) state.breakdownTab = available[0];

  const TAB_LABELS = { allocatie: 'Allocatie', sector: 'Sector', industrie: 'Industrie', type: 'Type', munt: 'Munt' };

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="analyse-grid">
      <div class="chart-card">
        <div class="chart-header" style="margin-bottom:14px">
          <div class="card-title" style="margin-bottom:0">Verdeling</div>
          <div class="seg desktop-only" id="breakdownTabs">
            ${available.map(t => `<button class="seg-btn${state.breakdownTab === t ? ' on' : ''}" data-tab="${t}" onclick="window._setBreakdownTab('${t}')">${TAB_LABELS[t]}</button>`).join('')}
          </div>
          <div class="chart-controls-mobile">
            <select class="mobile-select" onchange="window._setBreakdownTab(this.value)">
              ${available.map(t => `<option value="${t}"${state.breakdownTab === t ? ' selected' : ''}>${TAB_LABELS[t]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="breakdownContent"></div>
      </div>
      <div class="chart-card">
        <div class="card-title">Kostprijs vs Waarde</div>
        <div style="height:240px"><canvas id="chartBar"></canvas></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="chart-header" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">Rendement vergelijking</div>
          <div class="period-pills desktop-only" id="benchmarkPills">
            ${[['vwce', BENCHMARK_LBL], ['sp500', 'S&P 500'], ['both', 'Beide']].map(([k, l]) =>
              `<button class="pill ${state.activeBenchmark === k ? 'on' : ''}" data-bench="${k}" onclick="window._setBenchmark('${k}')">${l}</button>`
            ).join('')}
            <span style="width:1px;background:var(--border);margin:0 4px;align-self:stretch"></span>
            ${['1m','3m','6m','ytd','1y','2y','3y','total'].map(p =>
              `<button class="pill ${state.analysePeriod === p ? 'on' : ''}" onclick="window._setPeriodAnalyse('${p}')">${p.toUpperCase()}</button>`
            ).join('')}
          </div>
          <div class="chart-controls-mobile">
            <select class="mobile-select" onchange="window._setBenchmark(this.value)">
              ${[['vwce', BENCHMARK_LBL], ['sp500', 'S&P 500'], ['both', 'Beide']].map(([k, l]) =>
                `<option value="${k}"${state.activeBenchmark === k ? ' selected' : ''}>${l}</option>`
              ).join('')}
            </select>
            <select class="mobile-select" onchange="window._setPeriodAnalyse(this.value)">
              ${['1m','3m','6m','ytd','1y','2y','3y','total'].map(p =>
                `<option value="${p}" ${state.analysePeriod === p ? 'selected' : ''}>${p.toUpperCase()}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div style="height:200px"><canvas id="chartBenchmark"></canvas></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="card-title">Prestaties per periode</div>
        <div id="rollingReturnsTable"></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="card-title">Risicostatistieken</div>
        <div id="riskMetricsGrid" class="risk-metrics-grid"></div>
      </div>
      <div class="chart-card analyse-full">
        <div class="card-title">Posities detail</div>
        <div id="positionsTableWrap"></div>
      </div>
      <div class="chart-card analyse-full" id="tickerMetaEditor"></div>
    </div>`;

  renderAnalyseCharts();
}
