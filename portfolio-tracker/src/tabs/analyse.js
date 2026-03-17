import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { BENCHMARK_LBL } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderDonutChart } from '../components/donut.js';
import { saveTickerMeta } from '../api.js';

const SECTOR_COLORS = ['#818cf8','#34d399','#fbbf24','#f87171','#60a5fa','#a78bfa','#fb923c','#4ade80','#38bdf8','#f472b6'];

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
    const note   = t.note ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${t.note}</div>` : '';
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
  const ct  = chartTheme();
  state.chartInstances.currencyDonut = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['USD', 'EUR'],
      datasets: [{ data: [usd, eur], backgroundColor: ['#fbbf24', '#818cf8'], borderColor: ct.donutBorder, borderWidth: 2, hoverOffset: 5 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
          bodyColor: ct.bodyColor, bodyFont: { family: "'JetBrains Mono'", size: 11 }, padding: 12, cornerRadius: 10,
          callbacks: { label: item => ` ${item.label}: ${item.raw.toFixed(1)}%` },
        },
      },
    },
  });
}

export function renderSectorDonut(latest) {
  const el = document.getElementById('chartSectorDonut');
  if (!el) return;

  // Group position values by sector
  const sectorValues = {};
  for (const ticker of state.CURRENT_TICKERS) {
    const sector = state.tickerMeta?.[ticker]?.sector || 'Overig';
    sectorValues[sector] = (sectorValues[sector] || 0) + (latest[ticker] || 0);
  }
  const sectors = Object.keys(sectorValues);
  const values  = sectors.map(s => sectorValues[s]);
  const colors  = sectors.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length]);
  const ct      = chartTheme();

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

function buildBenchmarkSeries(filtered, benchMap) {
  const txByDate = {};
  for (const tx of state.RAW_TRANSACTIONS) {
    if (!txByDate[tx.date]) txByDate[tx.date] = [];
    txByDate[tx.date].push(tx);
  }

  let portfolioTwrFactor = 1.0;
  let vwceTwrFactor = 1.0;
  let portfolioSubStart = filtered[0].total;
  let vwceSubStart = benchMap[filtered[0].date];

  const portfolioSeries = [{ x: filtered[0].date, y: 0 }];
  const benchSeries     = [{ x: filtered[0].date, y: 0 }];

  for (let i = 1; i < filtered.length; i++) {
    const row = filtered[i];
    const vwcePrice = benchMap[row.date];
    const txsToday  = txByDate[row.date];

    if (txsToday && txsToday.length > 0) {
      const netCF = txsToday.reduce((s, tx) => s + (tx.shares > 0 ? tx.costEur : -tx.costEur), 0);
      const valueBeforeCF = row.total - netCF;
      if (portfolioSubStart > 0) portfolioTwrFactor *= valueBeforeCF / portfolioSubStart;
      if (vwcePrice != null && vwceSubStart > 0) vwceTwrFactor *= vwcePrice / vwceSubStart;
      portfolioSubStart = row.total;
      vwceSubStart = vwcePrice ?? vwceSubStart;
    }

    const portfolioY = portfolioSubStart > 0
      ? (portfolioTwrFactor * row.total / portfolioSubStart - 1) * 100
      : (portfolioTwrFactor - 1) * 100;
    const vwceY = vwcePrice != null && vwceSubStart > 0
      ? (vwceTwrFactor * vwcePrice / vwceSubStart - 1) * 100
      : null;

    portfolioSeries.push({ x: row.date, y: Number.parseFloat(portfolioY.toFixed(2)) });
    benchSeries.push({ x: row.date, y: vwceY == null ? null : Number.parseFloat(vwceY.toFixed(2)) });
  }

  return { portfolioSeries, benchSeries };
}

export function renderBenchmarkChart() {
  const filtered = getFilteredData(state.analysePeriod);
  if (filtered.length < 2) return;

  const benchMap = Object.fromEntries(state.benchmarkData.map(b => [b.date, b.value]));
  if (!benchMap[filtered[0].date]) return;

  const { portfolioSeries, benchSeries } = buildBenchmarkSeries(filtered, benchMap);

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

// ── Rolling returns table ─────────────────────────────────────────────────────

function renderRollingReturnsTable() {
  const el = document.getElementById('rollingReturnsTable');
  if (!el) return;
  const rr = state.rollingReturns;
  if (!rr) { el.innerHTML = '<div style="color:#64748b;font-size:12px;padding:12px">Onvoldoende data</div>'; return; }

  const periods   = ['1w', '1m', '3m', 'ytd', '1y', 'inception'];
  const labels    = { '1w': '1W', '1m': '1M', '3m': '3M', 'ytd': 'YTD', '1y': '1J', 'inception': 'Totaal' };
  const fmtR = v => {
    if (v == null) return '<span style="color:#475569">—</span>';
    const cls = v >= 0 ? 'c-pos' : 'c-neg';
    return `<span class="${cls}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
  };

  const header = periods.map(p => `<th>${labels[p]}</th>`).join('');
  const portRow = periods.map(p => `<td>${state.privacyMode ? '●●' : fmtR(rr[p]?.portfolio)}</td>`).join('');
  const benchRow = periods.map(p => `<td>${fmtR(rr[p]?.benchmark)}</td>`).join('');

  el.innerHTML = `<table class="perf-table">
    <thead><tr><th></th>${header}</tr></thead>
    <tbody>
      <tr><td style="font-weight:600;color:#818cf8">Portefeuille</td>${portRow}</tr>
      <tr><td style="color:#888">${BENCHMARK_LBL}</td>${benchRow}</tr>
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
    el.innerHTML = '<div style="color:#64748b;font-size:12px;padding:4px">Onvoldoende data (min. 30 dagen)</div>';
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
    const sector = document.getElementById(`meta_sector_${ticker}`)?.value?.trim() || '';
    const geo    = document.getElementById(`meta_geo_${ticker}`)?.value?.trim()    || '';
    const priceEl = document.getElementById(`meta_price_${ticker}`);
    const asOfEl  = document.getElementById(`meta_asof_${ticker}`);
    const manualPriceEur  = priceEl ? Number.parseFloat(priceEl.value) || null : null;
    const manualPriceAsOf = asOfEl  ? asOfEl.value || null : null;
    const existing = state.tickerMeta[ticker] || {};
    const merged   = { ...existing };
    if (sector) merged.sector = sector; else delete merged.sector;
    if (geo)    merged.geo    = geo;    else delete merged.geo;
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

function renderTickerMetaEditor() {
  const el = document.getElementById('tickerMetaEditor');
  if (!el) return;
  const tickers = Object.keys(state.TICKER_META);
  if (!tickers.length) { el.style.display = 'none'; return; }

  const rows = tickers.map(ticker => {
    const tm      = state.tickerMeta[ticker] || {};
    const meta    = state.TICKER_META[ticker] || {};
    const hasManual = tm.manualPriceEur && tm.manualPriceAsOf;
    return `<tr>
      <td style="font-weight:600">${ticker}<div style="font-size:10px;color:#64748b">${meta.label || ''}</div></td>
      <td><input id="meta_sector_${ticker}" value="${tm.sector || ''}" placeholder="bv. Tech, ETF" style="width:100px"></td>
      <td><input id="meta_geo_${ticker}" value="${tm.geo || ''}" placeholder="bv. US, EU" style="width:70px"></td>
      <td>
        <input id="meta_price_${ticker}" type="number" step="0.01" value="${hasManual ? tm.manualPriceEur : ''}" placeholder="prijs €" style="width:80px">
        <input id="meta_asof_${ticker}" type="date" value="${hasManual ? tm.manualPriceAsOf : ''}" style="width:120px;margin-left:6px">
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <details>
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:12px;list-style:none">
        ▸ Ticker instellingen (sector, geo, manuele prijs)
      </summary>
      <table class="pos-table" style="margin-top:8px">
        <thead><tr><th style="text-align:left">Ticker</th><th>Sector</th><th>Geo</th><th>Manuele prijs (€ + datum)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px">
        <button class="btn success" onclick="window._saveTickerMetaUI()">Opslaan</button>
      </div>
    </details>`;
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export function renderAnalyseCharts() {
  const latest = state.chartData[state.chartData.length - 1];

  // Determine if sector data is available (≥2 distinct sectors)
  const sectors = new Set(
    state.CURRENT_TICKERS.map(t => state.tickerMeta?.[t]?.sector).filter(Boolean),
  );
  const hasSectors = sectors.size >= 1;

  renderDonutChart(latest, 'chartDonut');
  renderBarChart(latest);
  renderCurrencyDonut();
  if (hasSectors) renderSectorDonut(latest);
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

  const sectors = new Set(
    state.CURRENT_TICKERS.map(t => state.tickerMeta?.[t]?.sector).filter(Boolean),
  );
  const hasSectors = sectors.size >= 1;

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
      <div class="chart-card">
        <div class="card-title">Munt blootstelling</div>
        <div style="height:140px"><canvas id="chartCurrencyDonut"></canvas></div>
        <div style="font-size:11px;color:#64748b;margin-top:8px;text-align:center">
          USD: ${latest ? state.usdExposurePct.toFixed(1) : '—'}% &nbsp;·&nbsp; EUR: ${latest ? (100 - state.usdExposurePct).toFixed(1) : '—'}%
        </div>
      </div>
      ${hasSectors ? `<div class="chart-card">
        <div class="card-title">Sector allocatie</div>
        <div style="height:240px"><canvas id="chartSectorDonut"></canvas></div>
      </div>` : ''}
      <div class="chart-card analyse-full">
        <div class="chart-header" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">Rendement vs ${BENCHMARK_LBL}</div>
          <div class="period-pills desktop-only">
            ${['1m','3m','6m','ytd','1y','2y','3y','total'].map(p =>
              `<button class="pill ${state.analysePeriod === p ? 'on' : ''}" onclick="window._setPeriodAnalyse('${p}')">${p.toUpperCase()}</button>`
            ).join('')}
          </div>
          <div class="chart-controls-mobile">
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
