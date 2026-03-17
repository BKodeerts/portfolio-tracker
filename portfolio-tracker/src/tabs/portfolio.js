import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { FX_FALLBACK, FX_SYMBOL } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderMarketStatus, renderIntradaySection, loadIntradayData, computeTodayPL } from './intraday.js';

function buildIntradayChartData(visibleTickers) {
  const latest = state.chartData.at(-1);
  if (!latest) return null;

  const fallbackFx = state.liveEurUsd || FX_FALLBACK;
  const fxData = state.intradayData[FX_SYMBOL];
  const prevFx = fxData?.previousClose || state.latestFxRate || fallbackFx;

  // Build FX ts->close map for forward-filling
  const fxPtMap = {};
  if (fxData?.points) fxData.points.forEach(p => { fxPtMap[p.ts] = p.close; });

  // Collect all timestamps from visible tickers
  const tsSet = new Set();
  visibleTickers.forEach(ticker => {
    const data = state.intradayData[state.TICKER_META[ticker]?.yahoo];
    if (data?.points) data.points.forEach(p => tsSet.add(p.ts));
  });

  const timestamps = [...tsSet].sort((a, b) => a - b);
  if (timestamps.length === 0) return null;

  // Forward-fill FX rate at each timestamp
  let lastFx = prevFx;
  const fxAtTs = {};
  timestamps.forEach(ts => {
    if (fxPtMap[ts] !== undefined) lastFx = fxPtMap[ts];
    fxAtTs[ts] = lastFx;
  });

  const labels = timestamps.map(ts => new Date(ts * 1000));

  const tickerVals = {};
  visibleTickers.forEach(ticker => {
    const data = state.intradayData[state.TICKER_META[ticker]?.yahoo];
    const shares = latest[`${ticker}_shares`] || 0;
    const currency = state.TICKER_META[ticker]?.currency || 'USD';
    if (!shares) { tickerVals[ticker] = null; return; }

    const prevClose = data?.previousClose || 0;
    const prevValueEur = currency === 'USD' ? shares * prevClose / prevFx : shares * prevClose;

    const ptMap = {};
    if (data?.points) data.points.forEach(p => { ptMap[p.ts] = p.close; });

    let lastClose = prevClose;
    const values = timestamps.map(ts => {
      if (ptMap[ts] !== undefined) lastClose = ptMap[ts];
      return currency === 'USD' ? shares * lastClose / fxAtTs[ts] : shares * lastClose;
    });

    tickerVals[ticker] = { prevValueEur, values };
  });

  return { labels, timestamps, tickerVals };
}

export function renderPortfolioChart(visibleTickers) {
  const ctx        = document.getElementById('mainChart').getContext('2d');
  const isIntraday = state.currentPeriod === '1d' && state.intradayLoaded;
  const intra      = isIntraday ? buildIntradayChartData(visibleTickers) : null;
  const useIntraday = isIntraday && intra !== null;

  let labels, datasets;

  if (useIntraday) {
    labels = intra.labels;
    const { tickerVals, timestamps } = intra;

    if (state.currentView === 'total') {
      const totals = timestamps.map((_, i) =>
        visibleTickers.reduce((sum, t) => sum + (tickerVals[t]?.values[i] || 0), 0));
      const prevCloseTotal = visibleTickers.reduce((sum, t) => sum + (tickerVals[t]?.prevValueEur || 0), 0);
      datasets = [
        { label: 'Portefeuille', data: totals,
          borderColor: '#818cf8', backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone' },
        { label: 'Vorige slotkoers', data: timestamps.map(() => prevCloseTotal),
          borderColor: chartTheme().costLine, backgroundColor: 'transparent',
          fill: false, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0 },
      ];
    } else if (state.currentView === 'individual') {
      datasets = [...visibleTickers].reverse().map(t => ({
        label: t, data: tickerVals[t]?.values || [],
        borderColor: getColor(t), backgroundColor: getColor(t) + '28',
        fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack',
      }));
    } else if (state.currentView === 'pct') {
      datasets = visibleTickers.map(t => {
        const tv = tickerVals[t];
        return {
          label: t,
          data: tv ? tv.values.map(v => tv.prevValueEur > 0 ? parseFloat(((v - tv.prevValueEur) / tv.prevValueEur * 100).toFixed(2)) : null) : [],
          borderColor: getColor(t), fill: false, borderWidth: 2, pointRadius: 0, tension: 0, spanGaps: true,
        };
      });
    } else {
      datasets = [...visibleTickers].reverse().map(t => {
        const tv = tickerVals[t];
        return {
          label: t,
          data: tv ? tv.values.map(v => v - tv.prevValueEur) : [],
          borderColor: getColor(t), backgroundColor: getColor(t) + '28',
          fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack', spanGaps: true,
        };
      });
    }
  } else {
    const filtered = getFilteredData();
    labels = filtered.map(d => d.date);

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
  }

  // Tight y-axis bounds for intraday — only for non-stacked views, since stacking makes
  // individual dataset max != visible chart max (fill: true also forces axis to include 0)
  let yBounds = {};
  const stackedView = state.currentView === 'individual' || state.currentView === 'pl';
  if (useIntraday && !stackedView) {
    const allVals = datasets.flatMap(ds => ds.data).filter(v => v != null && Number.isFinite(v));
    if (allVals.length > 0) {
      const dMin = Math.min(...allVals);
      const dMax = Math.max(...allVals);
      const mid  = (Math.abs(dMin) + Math.abs(dMax)) / 2;
      const pad  = Math.max((dMax - dMin) * 0.2, mid * 0.003);
      yBounds = { min: dMin - pad, max: dMax + pad };
    }
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
            title: items => useIntraday
              ? new Date(items[0].parsed.x).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
              : new Date(items[0].label).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
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
        x: { type: 'time',
             time: { unit: useIntraday ? 'hour' : 'month', tooltipFormat: useIntraday ? 'HH:mm' : 'dd MMM yyyy' },
             grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 } } },
        y: { beginAtZero: false, ...yBounds, grid: { color: chartTheme().gridColor },
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
    const useIntraday = state.currentPeriod === '1d' && state.intradayLoaded;
    const refLabel    = useIntraday ? 'Vorige slotkoers' : 'Kostprijs';
    el.innerHTML = `
      <div class="legend-item"><div class="legend-line" style="background:#818cf8"></div>Portefeuille</div>
      <div class="legend-item"><div class="legend-line" style="background:#334155;border-top:2px dashed #334155;height:0;width:16px;margin-top:1px"></div>${refLabel}</div>`;
  } else {
    el.innerHTML = visibleTickers.map(t => `
      <div class="legend-item" style="cursor:pointer" onclick="window._showPosModal('${t}')">
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
        <div class="seg desktop-only">
          <button class="seg-btn ${state.currentView === 'total'      ? 'on' : ''}" onclick="window._setView('total')">Totaal</button>
          <button class="seg-btn ${state.currentView === 'individual' ? 'on' : ''}" onclick="window._setView('individual')">Per positie</button>
          <button class="seg-btn ${state.currentView === 'pct'        ? 'on' : ''}" onclick="window._setView('pct')">Rendement %</button>
          <button class="seg-btn ${state.currentView === 'pl'         ? 'on' : ''}" onclick="window._setView('pl')">Winst €</button>
        </div>
        ${state.currentView !== 'total' ? `
        <label class="closed-toggle desktop-only" onclick="window._toggleClosed()" title="Gesloten posities tonen">
          <div class="toggle-track ${state.showClosed ? 'on' : ''}"></div>
          <span>Gesloten</span>
        </label>` : ''}
        <div class="period-pills desktop-only">
          <button class="pill ${state.currentPeriod === '1d'    ? 'on' : ''}" onclick="window._setPeriod('1d')">1D</button>
          <button class="pill ${state.currentPeriod === '1m'    ? 'on' : ''}" onclick="window._setPeriod('1m')">1M</button>
          <button class="pill ${state.currentPeriod === '3m'    ? 'on' : ''}" onclick="window._setPeriod('3m')">3M</button>
          <button class="pill ${state.currentPeriod === '6m'    ? 'on' : ''}" onclick="window._setPeriod('6m')">6M</button>
          <button class="pill ${state.currentPeriod === 'ytd'   ? 'on' : ''}" onclick="window._setPeriod('ytd')">YTD</button>
          <button class="pill ${state.currentPeriod === '1y'    ? 'on' : ''}" onclick="window._setPeriod('1y')">1Y</button>
          <button class="pill ${state.currentPeriod === '2y'    ? 'on' : ''}" onclick="window._setPeriod('2y')">2Y</button>
          <button class="pill ${state.currentPeriod === '3y'    ? 'on' : ''}" onclick="window._setPeriod('3y')">3Y</button>
          <button class="pill ${state.currentPeriod === 'total' ? 'on' : ''}" onclick="window._setPeriod('total')">Max</button>
        </div>
        <div class="chart-controls-mobile">
          <select class="mobile-select" onchange="window._setView(this.value)">
            <option value="total"      ${state.currentView === 'total'      ? 'selected' : ''}>Totaal</option>
            <option value="individual" ${state.currentView === 'individual' ? 'selected' : ''}>Per positie</option>
            <option value="pct"        ${state.currentView === 'pct'        ? 'selected' : ''}>Rendement %</option>
            <option value="pl"         ${state.currentView === 'pl'         ? 'selected' : ''}>Winst €</option>
          </select>
          <select class="mobile-select" onchange="window._setPeriod(this.value)">
            <option value="1d"    ${state.currentPeriod === '1d'    ? 'selected' : ''}>1D</option>
            <option value="1m"    ${state.currentPeriod === '1m'    ? 'selected' : ''}>1M</option>
            <option value="3m"    ${state.currentPeriod === '3m'    ? 'selected' : ''}>3M</option>
            <option value="6m"    ${state.currentPeriod === '6m'    ? 'selected' : ''}>6M</option>
            <option value="ytd"   ${state.currentPeriod === 'ytd'   ? 'selected' : ''}>YTD</option>
            <option value="1y"    ${state.currentPeriod === '1y'    ? 'selected' : ''}>1Y</option>
            <option value="2y"    ${state.currentPeriod === '2y'    ? 'selected' : ''}>2Y</option>
            <option value="3y"    ${state.currentPeriod === '3y'    ? 'selected' : ''}>3Y</option>
            <option value="total" ${state.currentPeriod === 'total' ? 'selected' : ''}>Max</option>
          </select>
        </div>
        ${hasPeriod ? `<div id="periodChange" style="font-family:'JetBrains Mono',monospace;font-size:12px;display:flex;gap:5px;align-items:center;white-space:nowrap">
          ${state.currentPeriod === '1d'
            ? '<span class="c-neutral">—</span>'
            : `<span class="${prdClass} privacy-val">${periodProfit >= 0 ? '+' : ''}${fmt(periodProfit)}</span><span class="${prdClass}" style="opacity:0.7">${fmtPct(periodPct)}</span>`}
        </div>` : ''}
        <button class="refresh-btn" onclick="${state.currentPeriod === '1d' ? 'window._refreshIntraday()' : 'window._clearCache()'}" title="Koersen verversen">↻</button>
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
  if (!state.intradayLoaded) {
    loadIntradayData(false, () => {
      if (state.currentPeriod === '1d' && state.currentTab === 'portefeuille') {
        if (state.chartInstances.main) { state.chartInstances.main.destroy(); delete state.chartInstances.main; }
        renderPortfolioChart(visibleTickers);
        renderLegend(visibleTickers);
        updatePeriodChange();
      }
    });
  } else if (state.currentPeriod === '1d') {
    updatePeriodChange();
  }
}

function updatePeriodChange() {
  const r  = computeTodayPL();
  const el = document.getElementById('periodChange');
  if (!el || !r) return;
  const cls  = r.pl >= 0 ? 'c-pos' : 'c-neg';
  const sign = r.pl >= 0 ? '+' : '';
  el.innerHTML = `<span class="${cls} privacy-val">${sign}${fmt(r.pl)}</span><span class="${cls}" style="opacity:0.7">${sign}${r.pct.toFixed(2)}%</span>`;
}
