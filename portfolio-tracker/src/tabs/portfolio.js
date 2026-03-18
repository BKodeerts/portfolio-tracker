import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { FX_FALLBACK, FX_SYMBOL } from '../constants.js';
import { fmt, fmtPct, getColor, getFilteredData, destroyAllCharts, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { renderMarketStatus, renderIntradaySection, loadIntradayData, computeTodayPL, renderTodayMetric, EU_EXCHANGE_RE } from './intraday.js';

function buildIntradayChartData(visibleTickers) {
  const latest = state.chartData.at(-1);
  if (!latest) return null;

  const fallbackFx = state.liveEurUsd || FX_FALLBACK;
  const fxData = state.intradayData[FX_SYMBOL];
  const prevFx = fxData?.previousClose || state.latestFxRate || fallbackFx;

  // Build FX ts->close map for forward-filling
  const fxPtMap = {};
  if (fxData?.points) fxData.points.forEach(p => { fxPtMap[p.ts] = p.close; });

  // Collect today-only timestamps from equity tickers + FX (FX covers overnight)
  const todayLocal = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
  const isToday = p => new Date(p.ts * 1000).toLocaleDateString('sv-SE') === todayLocal;
  const tsSet = new Set();
  visibleTickers.forEach(ticker => {
    const data = state.intradayData[state.TICKER_META[ticker]?.yahoo];
    if (data?.points) data.points.filter(isToday).forEach(p => tsSet.add(p.ts));
  });
  if (fxData?.points) fxData.points.filter(isToday).forEach(p => tsSet.add(p.ts));

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

const seg  = v => state.currentView   === v ? 'on' : '';
const pill = p => state.currentPeriod === p ? 'on' : '';
const selV = v => state.currentView   === v ? 'selected' : '';
const selP = p => state.currentPeriod === p ? 'selected' : '';

function buildRenderContext(filtered) {
  const latest       = filtered.at(-1);
  const first        = filtered[0];
  const periodProfit = latest.profit - first.profit;
  const periodPct    = (Number.parseFloat(latest.pctReturn) - Number.parseFloat(first.pctReturn)).toFixed(1);
  const hasPeriod    = state.currentPeriod !== 'total';
  const plClass      = latest.profit >= 0 ? 'c-pos' : 'c-neg';
  const prdClass     = periodProfit  >= 0 ? 'c-pos' : 'c-neg';
  const profitSign   = latest.profit >= 0 ? '+' : '';
  const periodSign   = periodProfit  >= 0 ? '+' : '';
  const visibleTickers  = state.showClosed ? Object.keys(state.TICKER_META) : state.CURRENT_TICKERS;
  const closedTrack     = state.showClosed ? 'on' : '';
  const closedToggleHtml = state.currentView === 'total' ? '' : `
    <label class="closed-toggle desktop-only" onclick="window._toggleClosed()" title="Gesloten posities tonen">
      <div class="toggle-track ${closedTrack}"></div><span>Gesloten</span>
    </label>`;
  const periodDetail = state.currentPeriod === '1d'
    ? '<span class="c-neutral">—</span>'
    : `<span class="${prdClass} privacy-val">${periodSign}${fmt(periodProfit)}</span><span class="${prdClass}" style="opacity:0.7">${fmtPct(periodPct)}</span>`;
  const periodChangeHtml = hasPeriod
    ? `<div id="periodChange" style="font-family:'JetBrains Mono',monospace;font-size:12px;display:flex;gap:5px;align-items:center;white-space:nowrap">${periodDetail}</div>`
    : '';
  const refreshAction = state.currentPeriod === '1d' ? 'window._refreshIntraday()' : 'window._clearCache()';
  return { latest, plClass, profitSign, visibleTickers, closedToggleHtml, periodChangeHtml, refreshAction };
}

function yBoundsRange(view, datasets, tickerVals, visibleTickers) {
  if (view === 'pct') return { floorMin: -2, ceilMax: 2 };
  if (view === 'pl') {
    const prevTotal = visibleTickers.reduce((s, t) => s + (tickerVals[t]?.prevValueEur || 0), 0);
    return { floorMin: -prevTotal * 0.02, ceilMax: prevTotal * 0.02 };
  }
  const ref = datasets.find(d => d.label === 'Vorige slotkoers')?.data?.[0]?.y;
  return { floorMin: ref * 0.98, ceilMax: ref * 1.02 };
}

function buildYBounds(datasets, floorMin, ceilMax) {
  const allVals = datasets.flatMap(ds => ds.data).filter(v => v != null && Number.isFinite(v));
  if (allVals.length === 0) return {};
  const dMin = Math.min(...allVals);
  const dMax = Math.max(...allVals);
  const mid  = (Math.abs(dMin) + Math.abs(dMax)) / 2;
  const pad  = Math.max((dMax - dMin) * 0.2, mid * 0.003);
  return { min: Math.min(dMin - pad, floorMin), max: Math.max(dMax + pad, ceilMax) };
}

function makeSegment(color, hasEU, hasUS) {
  return {
    borderColor: ctx => {
      const mins = new Date(ctx.p0.parsed.x).getHours() * 60 + new Date(ctx.p0.parsed.x).getMinutes();
      const active = (hasEU && mins >= 540 && mins < 1050) || (hasUS && mins >= 930 && mins < 1320);
      return active ? color : color + '35';
    },
  };
}

function buildIntradayDatasets(visibleTickers, intra) {
  const { tickerVals, timestamps } = intra;
  const view = state.currentView;
  const hasEU = visibleTickers.some(t => EU_EXCHANGE_RE.test(state.TICKER_META[t]?.yahoo || ''));
  const hasUS = visibleTickers.some(t => !EU_EXCHANGE_RE.test(state.TICKER_META[t]?.yahoo || ''));
  if (view === 'total') {
    const totals = timestamps.map((_, i) =>
      visibleTickers.reduce((sum, t) => sum + (tickerVals[t]?.values[i] || 0), 0));
    const prevCloseTotal = visibleTickers.reduce((sum, t) => sum + (tickerVals[t]?.prevValueEur || 0), 0);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(); dayEnd.setHours(23, 59, 59, 999);
    return [
      { label: 'Portefeuille', data: totals,
        borderColor: '#818cf8', backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone',
        segment: makeSegment('#818cf8', hasEU, hasUS) },
      { label: 'Vorige slotkoers', data: [{ x: dayStart, y: prevCloseTotal }, { x: dayEnd, y: prevCloseTotal }],
        borderColor: chartTheme().costLine, backgroundColor: 'transparent',
        fill: false, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0 },
    ];
  }
  if (view === 'individual') {
    return [...visibleTickers].reverse().map(t => ({
      label: t, data: tickerVals[t]?.values || [],
      borderColor: getColor(t), backgroundColor: getColor(t) + '28',
      fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack',
      segment: makeSegment(getColor(t), hasEU, hasUS),
    }));
  }
  if (view === 'pct') {
    return visibleTickers.map(t => {
      const tv = tickerVals[t];
      return {
        label: t,
        data: tv ? tv.values.map(v => tv.prevValueEur > 0 ? Number.parseFloat(((v - tv.prevValueEur) / tv.prevValueEur * 100).toFixed(2)) : null) : [],
        borderColor: getColor(t), fill: false, borderWidth: 2, pointRadius: 0, tension: 0, spanGaps: true,
        segment: makeSegment(getColor(t), hasEU, hasUS),
      };
    });
  }
  return [...visibleTickers].reverse().map(t => {
    const tv = tickerVals[t];
    return {
      label: t,
      data: tv ? tv.values.map(v => v - tv.prevValueEur) : [],
      borderColor: getColor(t), backgroundColor: getColor(t) + '28',
      fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack', spanGaps: true,
      segment: makeSegment(getColor(t), hasEU, hasUS),
    };
  });
}

function buildHistoricalDatasets(visibleTickers) {
  const filtered = getFilteredData();
  const view = state.currentView;
  if (view === 'total') {
    return [
      { label: 'Portefeuille', data: filtered.map(d => d.total),
        borderColor: '#818cf8', backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone' },
      { label: 'Kostprijs', data: filtered.map(d => d.totalCost),
        borderColor: chartTheme().costLine, backgroundColor: chartTheme().costFill,
        fill: true, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone' },
    ];
  }
  if (view === 'individual') {
    return [...visibleTickers].reverse().map(ticker => ({
      label: ticker, data: filtered.map(d => d[ticker] || 0),
      borderColor: getColor(ticker), backgroundColor: getColor(ticker) + '28',
      fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack',
    }));
  }
  if (view === 'pct') {
    return visibleTickers.map(ticker => ({
      label: ticker,
      data: filtered.map(d => d[`${ticker}_pct`] == null ? null : Number.parseFloat(d[`${ticker}_pct`])),
      borderColor: getColor(ticker), fill: false, borderWidth: 2, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', spanGaps: true,
    }));
  }
  return [...visibleTickers].reverse().map(ticker => ({
    label: ticker,
    data: filtered.map(d => d[ticker] != null && d[`${ticker}_cost`] != null ? d[ticker] - d[`${ticker}_cost`] : null),
    borderColor: getColor(ticker), backgroundColor: getColor(ticker) + '28',
    fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, cubicInterpolationMode: 'monotone', stack: 'stack', spanGaps: true,
  }));
}

export function renderPortfolioChart(visibleTickers) {
  const ctx         = document.getElementById('mainChart').getContext('2d');
  const isIntraday  = state.currentPeriod === '1d' && state.intradayLoaded;
  const intra       = isIntraday ? buildIntradayChartData(visibleTickers) : null;
  const useIntraday = isIntraday && intra !== null;

  const labels   = useIntraday ? intra.labels : getFilteredData().map(d => d.date);
  const datasets = useIntraday ? buildIntradayDatasets(visibleTickers, intra) : buildHistoricalDatasets(visibleTickers);

  // Tight y-axis bounds for intraday — only for non-stacked views, since stacking makes
  // individual dataset max != visible chart max (fill: true also forces axis to include 0)
  const stackedView = state.currentView === 'individual';
  const yBounds = useIntraday && !stackedView
    ? buildYBounds(datasets, ...Object.values(yBoundsRange(state.currentView, datasets, intra?.tickerVals, visibleTickers)))
    : {};

  const xDayStart = new Date(); xDayStart.setHours(0, 0, 0, 0);
  const xDayEnd   = new Date(); xDayEnd.setHours(23, 59, 59, 999);

  const hasEU = visibleTickers.some(t => EU_EXCHANGE_RE.test(state.TICKER_META[t]?.yahoo || ''));
  const hasUS = visibleTickers.some(t => !EU_EXCHANGE_RE.test(state.TICKER_META[t]?.yahoo || ''));
  const sessionLines = [
    ...(hasEU ? [{ hour:  9, min:  0, label: 'EU opent'  },
                 { hour: 17, min: 30, label: 'EU sluit'  }] : []),
    ...(hasUS ? [{ hour: 15, min: 30, label: 'NYSE opent' },
                 { hour: 22, min:  0, label: 'NYSE sluit' }] : []),
  ];

  const marketCloseLines = useIntraday ? {
    id: 'marketCloseLines',
    afterDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      const lines = sessionLines;
      ctx.save();
      lines.forEach(({ hour, min, label }) => {
        const t = new Date(); t.setHours(hour, min, 0, 0);
        const xPos = x.getPixelForValue(t.getTime());
        if (xPos < x.left || xPos > x.right) return;
        ctx.strokeStyle = 'rgba(100,116,139,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xPos, y.top);
        ctx.lineTo(xPos, y.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#64748b';
        ctx.font = `9px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(label, xPos + 4, y.top + 12);
      });
      ctx.restore();
    },
  } : null;

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
              const val  = item.parsed.y;
              const sign = val >= 0 ? '+' : '';
              if (state.currentView === 'pct') return ` ${item.dataset.label}: ${sign}${val}%`;
              if (state.privacyMode) return ` ${item.dataset.label}: ●●●`;
              return ` ${item.dataset.label}: ${sign}€${Math.round(val).toLocaleString('nl-BE')}`;
            },
          },
        },
      },
      scales: {
        x: { type: 'time',
             time: { unit: useIntraday ? 'hour' : 'month', tooltipFormat: useIntraday ? 'HH:mm' : 'dd MMM yyyy' },
             ...(useIntraday ? { min: xDayStart, max: xDayEnd } : {}),
             grid: { color: chartTheme().gridColor }, ticks: { color: chartTheme().tickColor, font: { size: 10 } } },
        y: { beginAtZero: false, ...yBounds, grid: { color: chartTheme().gridColor },
             ticks: { color: chartTheme().tickColor, font: { size: 10 },
               callback: v => {
                 if (state.currentView === 'pct') return `${+v.toFixed(2)}%`;
                 if (state.privacyMode) return '●●';
                 return Math.abs(v) < 1000 ? `€${Math.round(v)}` : `€${+(v / 1000).toFixed(1)}k`;
               } } },
      },
    },
    plugins: marketCloseLines ? [marketCloseLines] : [],
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
        ${t}${state.CURRENT_TICKERS.includes(t) ? '' : '<span style="color:#374151"> gesloten</span>'}
      </div>`).join('');
  }
}


export function renderSummaryBar() {
  const el = document.getElementById('summary-bar');
  if (!el) return;
  const latest = state.chartData.at(-1);
  if (!latest) return;
  const plClass    = latest.profit >= 0 ? 'c-pos' : 'c-neg';
  const profitSign = latest.profit >= 0 ? '+' : '';
  el.innerHTML = `<div class="metrics-grid summary-bar-grid">
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
      <div class="metric-value ${plClass} privacy-val">${profitSign}${fmt(latest.profit)}</div>
      <div class="metric-sub ${plClass}">${fmtPct(latest.pctReturn)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Vandaag</div>
      <div id="metricToday"><div class="metric-value c-neutral">—</div><div class="metric-sub">laden…</div></div>
    </div>
  </div>`;
  if (state.intradayLoaded) renderTodayMetric();
}

export function renderApp() {
  destroyAllCharts();
  state.currentTab = 'portefeuille';
  renderAppHeader();
  renderSummaryBar();

  const { visibleTickers, closedToggleHtml, periodChangeHtml, refreshAction } =
    buildRenderContext(getFilteredData());

  document.getElementById('root').innerHTML = `
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
          <button class="seg-btn ${seg('total')}"      onclick="window._setView('total')">Totaal</button>
          <button class="seg-btn ${seg('individual')}" onclick="window._setView('individual')">Per positie</button>
          <button class="seg-btn ${seg('pct')}"        onclick="window._setView('pct')">Rendement %</button>
          <button class="seg-btn ${seg('pl')}"         onclick="window._setView('pl')">Winst €</button>
        </div>
        ${closedToggleHtml}
        <div class="period-pills desktop-only">
          <button class="pill ${pill('1d')}"    onclick="window._setPeriod('1d')">1D</button>
          <button class="pill ${pill('1m')}"    onclick="window._setPeriod('1m')">1M</button>
          <button class="pill ${pill('3m')}"    onclick="window._setPeriod('3m')">3M</button>
          <button class="pill ${pill('6m')}"    onclick="window._setPeriod('6m')">6M</button>
          <button class="pill ${pill('ytd')}"   onclick="window._setPeriod('ytd')">YTD</button>
          <button class="pill ${pill('1y')}"    onclick="window._setPeriod('1y')">1Y</button>
          <button class="pill ${pill('2y')}"    onclick="window._setPeriod('2y')">2Y</button>
          <button class="pill ${pill('3y')}"    onclick="window._setPeriod('3y')">3Y</button>
          <button class="pill ${pill('total')}" onclick="window._setPeriod('total')">Max</button>
        </div>
        <div class="chart-controls-mobile">
          <select class="mobile-select" onchange="window._setView(this.value)">
            <option value="total"      ${selV('total')}>Totaal</option>
            <option value="individual" ${selV('individual')}>Per positie</option>
            <option value="pct"        ${selV('pct')}>Rendement %</option>
            <option value="pl"         ${selV('pl')}>Winst €</option>
          </select>
          <select class="mobile-select" onchange="window._setPeriod(this.value)">
            <option value="1d"    ${selP('1d')}>1D</option>
            <option value="1m"    ${selP('1m')}>1M</option>
            <option value="3m"    ${selP('3m')}>3M</option>
            <option value="6m"    ${selP('6m')}>6M</option>
            <option value="ytd"   ${selP('ytd')}>YTD</option>
            <option value="1y"    ${selP('1y')}>1Y</option>
            <option value="2y"    ${selP('2y')}>2Y</option>
            <option value="3y"    ${selP('3y')}>3Y</option>
            <option value="total" ${selP('total')}>Max</option>
          </select>
        </div>
        ${periodChangeHtml}
        <button class="refresh-btn" onclick="${refreshAction}" title="Koersen verversen">↻</button>
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
      renderTodayMetric();
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
