import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { BENCHMARK_SYM } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderMarketStatus, renderIntradaySection, loadIntradayData } from './intraday.js';

export function renderPortfolioChart(visibleTickers) {
  const ctx      = document.getElementById('mainChart').getContext('2d');
  const filtered = getFilteredData();
  const labels   = filtered.map(d => d.date);
  let datasets   = [];

  if (state.currentView === 'total') {
    datasets = [
      { label: 'Portefeuille', data: filtered.map(d => d.total),
        borderColor: '#818cf8', backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone' },
      { label: 'Kostprijs', data: filtered.map(d => d.totalCost),
        borderColor: chartTheme().costLine, backgroundColor: chartTheme().costFill,
        fill: true, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone' },
    ];
  } else if (state.currentView === 'individual') {
    datasets = [...visibleTickers].reverse().map(ticker => ({
      label: ticker, data: filtered.map(d => d[ticker] || 0),
      borderColor: getColor(ticker), backgroundColor: getColor(ticker) + '28',
      fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack',
    }));
  } else if (state.currentView === 'pct') {
    datasets = visibleTickers.map(ticker => ({
      label: ticker,
      data: filtered.map(d => d[`${ticker}_pct`] != null ? parseFloat(d[`${ticker}_pct`]) : null),
      borderColor: getColor(ticker), fill: false, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', spanGaps: true,
    }));
  } else {
    datasets = [...visibleTickers].reverse().map(ticker => ({
      label: ticker,
      data: filtered.map(d => d[ticker] != null && d[`${ticker}_cost`] != null ? d[ticker] - d[`${ticker}_cost`] : null),
      borderColor: getColor(ticker), backgroundColor: getColor(ticker) + '28',
      fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack', spanGaps: true,
    }));
  }

  state.chartInstances.main = new Chart(ctx, {
    type: 'line', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme().tooltipBg, borderColor: chartTheme().tooltipBorder, borderWidth: 1,
          titleColor: chartTheme().titleColor, bodyColor: chartTheme().bodyColor,
          titleFont: { family: "'DM Sans'", size: 11, weight: 700 },
          bodyFont: { family: "'JetBrains Mono'", size: 11 },
          padding: 14, cornerRadius: 10,
          callbacks: {
            title: items => new Date(items[0].label).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
            label: item => {
              const sign = item.raw >= 0 ? '+' : '';
              if (state.currentView === 'pct') return ` ${item.dataset.label}: ${sign}${item.raw}%`;
              if (state.privacyMode) return ` ${item.dataset.label}: ●●●`;
              return ` ${item.dataset.label}: ${sign}€${Math.round(item.raw).toLocaleString('nl-BE')}`;
            },
          },
        },
      },
      scales: {
        x: { type: 'time', time: { unit: 'month', tooltipFormat: 'dd MMM yyyy' },
             grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 } } },
        y: { grid: { color: chartTheme().gridColor },
             ticks: { color: chartTheme().tickColor, font: { size: 10 },
               callback: v => {
                 if (state.currentView === 'pct') return `${v}%`;
                 return state.privacyMode ? '●●' : `€${(v / 1000).toFixed(0)}k`;
               } } },
      },
    },
  });
}

export function renderLegend(visibleTickers) {
  const el = document.getElementById('legend');
  if (!el) return;
  if (state.currentView === 'total') {
    el.innerHTML = `
      <div class="legend-item"><div class="legend-line" style="background:#818cf8"></div>Portefeuille</div>
      <div class="legend-item"><div class="legend-line" style="background:#334155;border-top:2px dashed #334155;height:0;width:16px;margin-top:1px"></div>Kostprijs</div>`;
  } else {
    el.innerHTML = visibleTickers.map(t => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${getColor(t)}"></div>
        ${t}${!state.CURRENT_TICKERS.includes(t) ? '<span style="color:#374151"> gesloten</span>' : ''}
      </div>`).join('');
  }
}


export function renderApp() {
  destroyAllCharts();
  state.currentTab = 'portefeuille';

  const filtered = getFilteredData();
  const latest   = filtered[filtered.length - 1];
  const first    = filtered[0];

  const periodProfit = latest.profit - first.profit;
  const periodPct    = (Number.parseFloat(latest.pctReturn) - Number.parseFloat(first.pctReturn)).toFixed(1);
  const hasPeriod    = state.currentPeriod !== 'total';

  const plClass  = latest.profit >= 0 ? 'c-pos' : 'c-neg';
  const prdClass = periodProfit  >= 0 ? 'c-pos' : 'c-neg';

  const visibleTickers = state.showClosed ? Object.keys(state.TICKER_META) : state.CURRENT_TICKERS;

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Geïnvesteerd</div>
        <div class="metric-value c-neutral privacy-val">${fmt(latest.totalCost)}</div>
        <div class="metric-sub">kostprijs</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Portefeuille</div>
        <div class="metric-value c-brand privacy-val">${fmt(latest.total)}</div>
        <div class="metric-sub">huidige waarde</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">P&amp;L totaal</div>
        <div class="metric-value ${plClass} privacy-val" style="font-size:17px">${latest.profit >= 0 ? '+' : ''}${fmt(latest.profit)}</div>
        <div class="metric-sub ${plClass}">${fmtPct(latest.pctReturn)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Vandaag</div>
        <div id="metricToday"><div class="metric-value c-neutral" style="font-size:17px">—</div><div class="metric-sub">laden…</div></div>
      </div>
    </div>

    <div class="intraday-section">
      <div class="intraday-section-header">
        <div class="card-title" style="margin-bottom:0">Vandaag</div>
        <div id="marketStatus"></div>
        <div id="intradayStatus" style="font-size:10px;color:#334155;font-family:'JetBrains Mono',monospace;margin-left:auto"></div>
        <button class="refresh-btn" onclick="window._refreshIntraday()" title="Intraday verversen">↻</button>
      </div>
      <div id="intradayGrid" class="intraday-grid"></div>
    </div>

    <div class="chart-card">
      <div class="chart-header">
        <div class="seg">
          <button class="seg-btn ${state.currentView === 'total'      ? 'on' : ''}" onclick="window._setView('total')">Totaal</button>
          <button class="seg-btn ${state.currentView === 'individual' ? 'on' : ''}" onclick="window._setView('individual')">Per positie</button>
          <button class="seg-btn ${state.currentView === 'pct'        ? 'on' : ''}" onclick="window._setView('pct')">Rendement %</button>
          <button class="seg-btn ${state.currentView === 'pl'         ? 'on' : ''}" onclick="window._setView('pl')">Winst €</button>
        </div>
        ${state.currentView !== 'total' ? `
        <label class="closed-toggle" onclick="window._toggleClosed()" title="Gesloten posities tonen">
          <div class="toggle-track ${state.showClosed ? 'on' : ''}"></div>
          <span>Gesloten</span>
        </label>` : ''}
        <div class="period-pills">
          <button class="pill ${state.currentPeriod === '1m'    ? 'on' : ''}" onclick="window._setPeriod('1m')">1M</button>
          <button class="pill ${state.currentPeriod === '3m'    ? 'on' : ''}" onclick="window._setPeriod('3m')">3M</button>
          <button class="pill ${state.currentPeriod === '6m'    ? 'on' : ''}" onclick="window._setPeriod('6m')">6M</button>
          <button class="pill ${state.currentPeriod === 'ytd'   ? 'on' : ''}" onclick="window._setPeriod('ytd')">YTD</button>
          <button class="pill ${state.currentPeriod === '1y'    ? 'on' : ''}" onclick="window._setPeriod('1y')">1Y</button>
          <button class="pill ${state.currentPeriod === '2y'    ? 'on' : ''}" onclick="window._setPeriod('2y')">2Y</button>
          <button class="pill ${state.currentPeriod === '3y'    ? 'on' : ''}" onclick="window._setPeriod('3y')">3Y</button>
          <button class="pill ${state.currentPeriod === 'total' ? 'on' : ''}" onclick="window._setPeriod('total')">Max</button>
        </div>
        ${hasPeriod ? `<div style="font-family:'JetBrains Mono',monospace;font-size:12px;display:flex;gap:5px;align-items:center;white-space:nowrap">
          <span class="${prdClass} privacy-val">${periodProfit >= 0 ? '+' : ''}${fmt(periodProfit)}</span>
          <span class="${prdClass}" style="opacity:0.7">${fmtPct(periodPct)}</span>
        </div>` : ''}
        <button class="refresh-btn" onclick="window._clearCache()" title="Koersen verversen">↻</button>
      </div>
      <div style="height:400px"><canvas id="mainChart"></canvas></div>
      <div class="legend" id="legend"></div>
    </div>

    <div class="footer">
      Actief: ${state.CURRENT_TICKERS.join(', ')} · Geen financieel advies · Zelf gehosted
    </div>`;

  renderPortfolioChart(visibleTickers);
  renderLegend(visibleTickers);
  renderMarketStatus();
  renderIntradaySection();
  if (!state.intradayLoaded) loadIntradayData();
}
