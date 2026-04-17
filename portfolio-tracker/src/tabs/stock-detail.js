import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { state } from '../state.js';
import { fmt, getColor, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import { fetchCandles } from '../api.js';
import { latestSessionPoints, EU_EXCHANGE_RE, normalizeMarketState } from './intraday.js';

// Module-level state — reset on each fresh navigation
let _period        = '1d';
let _chartInst     = null;
let _currentTicker = null;

export function setStockDetailPeriod(p) {
  _period = p;
  document.querySelectorAll('[data-sdperiod]').forEach(b => {
    b.classList.toggle('on', b.dataset.sdperiod === _period);
  });
  renderStockDetailChart(_currentTicker, _period);
}

export function renderStockDetail() {
  const ticker = state.selectedTicker;
  if (!ticker) return;

  // Reset on fresh navigation
  _period        = '1d';
  _currentTicker = ticker;

  const meta       = state.TICKER_META[ticker] || {};
  const yahoo      = meta.yahoo || ticker;
  const color      = getColor(ticker);
  const nativeCcy  = meta.currency || 'EUR';
  const ccySym     = nativeCcy === 'EUR' ? '€' : nativeCcy === 'USD' ? '$' : nativeCcy === 'GBP' ? '£' : nativeCcy;

  // Current price + day change from intraday data
  const iData      = state.intradayData?.[yahoo];
  const sessionPts = latestSessionPoints(iData);
  const lastPt     = sessionPts.length
    ? sessionPts[sessionPts.length - 1]
    : (iData?.points?.length ? iData.points[iData.points.length - 1] : null);
  const prevClose     = iData?.previousClose ?? null;
  const currentPrice  = lastPt?.close ?? prevClose ?? null;
  const dayChangePct  = (currentPrice != null && prevClose) ? ((currentPrice - prevClose) / prevClose * 100) : null;
  const dayChangeCls  = dayChangePct == null ? '' : dayChangePct >= 0 ? 'c-pos' : 'c-neg';
  const dayChangeSign = dayChangePct != null && dayChangePct >= 0 ? '+' : '';

  // Market state badge
  const marketBadge = buildSingleMarketBadge(iData, yahoo);

  // Position stats
  const latest  = (ticker in (state.lastLatest || {})) ? state.lastLatest : (state.chartData?.at(-1) ?? {});
  const val     = latest[ticker] || 0;
  const cost    = latest[`${ticker}_cost`] || 0;
  const pl      = val - cost;
  const plPct   = cost > 0 ? (pl / cost * 100) : 0;
  const sh      = latest[`${ticker}_shares`] || 0;
  const realPl  = state.realizedPlPerTicker?.[ticker] || 0;
  const divInc  = state.dividendsPerTicker?.[ticker] || 0;
  const fxPl    = meta.fxPl ?? null;
  const plCls   = pl >= 0 ? 'c-pos' : 'c-neg';
  const plSign  = pl >= 0 ? '+' : '';
  const realCls = realPl >= 0 ? 'c-pos' : 'c-neg';
  const realSign = realPl >= 0 ? '+' : '';

  // Extra stats (52W, PE, dividends, FX)
  const high52  = meta.high52;
  const low52   = meta.low52;
  const peRatio = meta.pe;
  const extraStats = [
    high52    ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">52W Hoog</div><div class="pos-modal-stat-val">${ccySym}${high52.toFixed(2)}</div></div>` : '',
    low52     ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">52W Laag</div><div class="pos-modal-stat-val">${ccySym}${low52.toFixed(2)}</div></div>` : '',
    peRatio   ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">P/E</div><div class="pos-modal-stat-val">${peRatio.toFixed(1)}</div></div>` : '',
    divInc    ? `<div class="pos-modal-stat"><div class="pos-modal-stat-label">Dividenden</div><div class="pos-modal-stat-val c-pos privacy-val">+${fmt(divInc)}</div></div>` : '',
    fxPl != null ? (() => {
      const fxSign = fxPl >= 0 ? '+' : '';
      const fxCls  = fxPl >= 0 ? 'c-pos' : 'c-neg';
      const fxPct  = cost > 0 ? (fxPl / cost * 100).toFixed(1) : null;
      return `<div class="pos-modal-stat"><div class="pos-modal-stat-label">Valuta effect</div><div class="pos-modal-stat-val ${fxCls} privacy-val">${fxSign}${fmt(fxPl)}</div>${fxPct != null ? `<div class="pos-modal-stat-sub ${fxCls}">${fxSign}${fxPct}%</div>` : ''}</div>`;
    })() : '',
  ].join('');

  // Transaction table rows
  const txs = (state.RAW_TRANSACTIONS || [])
    .filter(t => t.ticker === ticker)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const txRows = txs.map(t => {
    const isDividend = t.type === 'dividend';
    const isSale     = !isDividend && t.shares < 0;
    const price      = isDividend ? null : Math.abs(t.costEur / t.shares);
    const note       = t.note ? `<div class="c-neutral" style="font-size:10px;margin-top:2px">${t.note}</div>` : '';
    let typeLabel, typeColor;
    if (isDividend)  { typeLabel = 'Dividend'; typeColor = '#f59e0b'; }
    else if (isSale) { typeLabel = 'Verkoop';  typeColor = '#ef4444'; }
    else             { typeLabel = 'Koop';     typeColor = '#16a34a'; }
    return `<tr>
      <td>${t.date}</td>
      <td style="color:${typeColor}">${typeLabel}</td>
      <td>${isDividend ? '—' : Math.abs(t.shares).toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</td>
      <td>${fmt(Math.abs(t.costEur))}</td>
      <td>${price != null ? `${ccySym}${price.toFixed(2)}` : '—'}${note}</td>
    </tr>`;
  }).join('');

  const pill = p => _period === p ? 'on' : '';

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="stock-detail-page">

      <div class="stock-detail-header">
        <div class="sd-header-id">
          <span class="sd-color-dot" style="background:${color}"></span>
          <span class="stock-detail-ticker">${ticker}</span>
        </div>
        ${meta.label ? `<span class="stock-detail-name">${meta.label}</span>` : ''}
        <div class="sd-header-price-row">
          ${currentPrice != null ? `<span class="stock-detail-price privacy-val">${ccySym}${currentPrice.toFixed(2)}</span>` : ''}
          ${dayChangePct != null ? `<span class="stock-detail-change ${dayChangeCls}">${dayChangeSign}${dayChangePct.toFixed(2)}%</span>` : ''}
        </div>
        ${marketBadge}
      </div>

      <div class="stock-detail-controls">
        <div class="period-pills">
          <button class="pill ${pill('1d')}"  data-sdperiod="1d"  onclick="globalThis._setStockDetailPeriod('1d')">1D</button>
          <button class="pill ${pill('1m')}"  data-sdperiod="1m"  onclick="globalThis._setStockDetailPeriod('1m')">1M</button>
          <button class="pill ${pill('3m')}"  data-sdperiod="3m"  onclick="globalThis._setStockDetailPeriod('3m')">3M</button>
          <button class="pill ${pill('6m')}"  data-sdperiod="6m"  onclick="globalThis._setStockDetailPeriod('6m')">6M</button>
          <button class="pill ${pill('ytd')}" data-sdperiod="ytd" onclick="globalThis._setStockDetailPeriod('ytd')">YTD</button>
          <button class="pill ${pill('1y')}"  data-sdperiod="1y"  onclick="globalThis._setStockDetailPeriod('1y')">1Y</button>
          <button class="pill ${pill('2y')}"  data-sdperiod="2y"  onclick="globalThis._setStockDetailPeriod('2y')">2Y</button>
          <button class="pill ${pill('3y')}"  data-sdperiod="3y"  onclick="globalThis._setStockDetailPeriod('3y')">3Y</button>
          <button class="pill ${pill('all')}" data-sdperiod="all" onclick="globalThis._setStockDetailPeriod('all')">Max</button>
        </div>
      </div>

      <div class="chart-card" style="margin-bottom:12px">
        <div id="stockDetailChartWrap" style="height:260px;position:relative">
          <canvas id="stockDetailChart"></canvas>
        </div>
      </div>

      ${sh !== 0 || cost !== 0 ? `
      <div class="chart-card" style="margin-bottom:12px">
        <div class="card-title">Positie</div>
        <div class="pos-modal-stats">
          <div class="pos-modal-stat"><div class="pos-modal-stat-label">Aandelen</div><div class="pos-modal-stat-val privacy-val">${sh.toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</div></div>
          <div class="pos-modal-stat"><div class="pos-modal-stat-label">Geïnvesteerd</div><div class="pos-modal-stat-val privacy-val">${fmt(cost)}</div></div>
          <div class="pos-modal-stat"><div class="pos-modal-stat-label">Huidig</div><div class="pos-modal-stat-val privacy-val">${fmt(val)}</div></div>
          <div class="pos-modal-stat"><div class="pos-modal-stat-label">Ongerealiseerd</div><div class="pos-modal-stat-val ${plCls} privacy-val">${plSign}${fmt(pl)}</div><div class="pos-modal-stat-sub ${plCls}">${plSign}${plPct.toFixed(1)}%</div></div>
          <div class="pos-modal-stat"><div class="pos-modal-stat-label">Gerealiseerd</div><div class="pos-modal-stat-val ${realCls} privacy-val">${realSign}${fmt(realPl)}</div></div>
          ${extraStats}
        </div>
      </div>` : ''}

      ${txRows ? `
      <div class="chart-card">
        <div class="card-title">Transacties</div>
        <div class="pos-modal-tx-table-wrap">
          <table class="pos-modal-tx-table">
            <thead><tr><th>Datum</th><th>Type</th><th>Aandelen</th><th>Kosten €</th><th>Prijs/stuk</th></tr></thead>
            <tbody>${txRows}</tbody>
          </table>
        </div>
      </div>` : ''}
    </div>`;

  renderStockDetailChart(ticker, _period);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSingleMarketBadge(iData, yahoo) {
  if (!iData?.marketState) return '';
  const ms    = normalizeMarketState(yahoo || '', iData.marketState);
  const dot   = ms === 'REGULAR' ? '#4ade80' : '#334155';
  const label = ms === 'REGULAR' ? 'Open' : ms === 'PRE' ? 'Pre-market' : ms === 'POST' ? 'Post-market' : 'Gesloten';
  return `<span class="market-badge"><span class="dot" style="background:${dot}"></span>${label}</span>`;
}

function periodToFrom(period) {
  const now = new Date();
  if (period === 'all') return '2000-01-01';
  if (period === 'ytd') return `${now.getFullYear()}-01-01`;
  const d = new Date(now);
  if (period === '1m')  { d.setMonth(d.getMonth() - 1);       return d.toISOString().slice(0, 10); }
  if (period === '3m')  { d.setMonth(d.getMonth() - 3);       return d.toISOString().slice(0, 10); }
  if (period === '6m')  { d.setMonth(d.getMonth() - 6);       return d.toISOString().slice(0, 10); }
  if (period === '1y')  { d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
  if (period === '2y')  { d.setFullYear(d.getFullYear() - 2); return d.toISOString().slice(0, 10); }
  if (period === '3y')  { d.setFullYear(d.getFullYear() - 3); return d.toISOString().slice(0, 10); }
  return '2000-01-01';
}

function periodToXUnit(period) {
  if (period === '1m') return 'day';
  if (period === '3m' || period === '6m') return 'week';
  return 'month';
}

async function renderStockDetailChart(ticker, period) {
  if (_chartInst) { _chartInst.destroy(); _chartInst = null; }

  const meta      = state.TICKER_META[ticker] || {};
  const yahoo     = meta.yahoo || ticker;
  const nativeCcy = meta.currency || 'EUR';
  const ccySym    = nativeCcy === 'EUR' ? '€' : nativeCcy === 'USD' ? '$' : nativeCcy === 'GBP' ? '£' : nativeCcy;
  const ct        = chartTheme();

  if (period === '1d') {
    const iData = state.intradayData?.[yahoo];
    if (!iData) { showChartMsg('Geen intraday data beschikbaar'); return; }

    // Use allPoints (pre + regular + post) when available, fall back to session points
    const allPts = iData.allPoints?.length ? iData.allPoints : latestSessionPoints(iData);
    if (!allPts || allPts.length === 0) { showChartMsg('Geen data voor vandaag'); return; }

    const prevClose  = iData.previousClose;
    const lastClose  = allPts[allPts.length - 1].close;
    const isUp       = prevClose ? lastClose >= prevClose : true;
    const lineColor    = isUp ? '#4ade80' : '#f87171';
    const fillColor    = isUp ? '#4ade8022' : '#f8717122';
    const dimColor     = isUp ? '#4ade8055' : '#f8717155';
    const dimFillColor = isUp ? '#4ade800f' : '#f871710f';

    const periods  = iData.tradingPeriods;

    // Full extended session bounds — anchor x-axis AND extend the ref line so Chart.js
    // doesn't auto-clip to the sparse data range (e.g. pre-market only).
    // Fallback: US extended day is ~16h from pre-market start; EU regular session ~9h.
    const isEU   = /\.(DE|AS|PA|L|MI|BR|SW|ST|HE|CO|OL|CL|TO|AX|T|MX)$/i.test(yahoo);
    const dayLen = isEU ? 9 * 3600 : 16 * 3600;
    let xMinTs = periods?.pre?.start ?? periods?.regular?.start ?? allPts[0].ts;
    let xMaxTs = periods?.post?.end  ?? periods?.regular?.end   ?? (xMinTs + dayLen);

    // Regular session bounds for open/close lines.
    // When tradingPeriods is absent, estimate from known exchange offsets:
    // US: pre-market starts at 4 AM ET, regular opens 5.5 h later at 9:30 AM, closes 12 h later at 4 PM.
    // EU: no extended hours — full day IS the regular session.
    let regStart = periods?.regular?.start ?? (isEU ? xMinTs : xMinTs + 5.5 * 3600);
    let regEnd   = periods?.regular?.end   ?? (isEU ? xMaxTs : xMinTs + 12  * 3600);

    // If all data falls before xMinTs, tradingPeriods points to a future session (e.g. pre-market
    // before open showing yesterday's data). Re-anchor bounds to the actual data range.
    if (allPts[allPts.length - 1].ts < xMinTs) {
      xMinTs   = allPts[0].ts;
      xMaxTs   = allPts[allPts.length - 1].ts + 3600;
      regStart = isEU ? xMinTs : xMinTs + 5.5 * 3600;
      regEnd   = isEU ? xMaxTs : xMinTs + 12  * 3600;
    }

    const datasets = buildIntradayDatasets(allPts, regStart, regEnd, { lineColor, fillColor, dimColor, dimFillColor }, prevClose, ct);
    // Extend the ref line to cover the full session so Chart.js doesn't clip the axis to sparse data
    const ref = datasets.find(d => d.label === '_ref');
    if (ref && xMinTs && xMaxTs) {
      ref.data = [{ x: xMinTs * 1000, y: ref.data[0].y }, { x: xMaxTs * 1000, y: ref.data[0].y }];
    }
    const breakLines = buildBreakLines(regStart, regEnd, xMinTs, xMaxTs);

    buildChart(datasets, {
      xUnit: 'hour',
      tooltipTitle: items => new Date(items[0].parsed.x).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
      yLabel: v => `${ccySym}${v.toFixed(2)}`,
      ct,
      breakLines,
      // Pass as ms numbers — more reliable with chartjs-adapter-date-fns than Date objects
      xMin: xMinTs ? xMinTs * 1000 : undefined,
      xMax: xMaxTs ? xMaxTs * 1000 : undefined,
    });
  } else {
    // Historical — fetch candles with loading indicator
    const wrap = document.getElementById('stockDetailChartWrap');
    if (wrap) wrap.innerHTML = '<div class="sd-chart-msg">Laden…</div><canvas id="stockDetailChart" style="display:none"></canvas>';

    const from = periodToFrom(period);
    let candles;
    try {
      const json = await fetchCandles(yahoo, from);
      if (json.status !== 'ok') throw new Error(json.message || 'Fout bij laden');
      candles = json.data.filter(d => d.date >= from);
    } catch (e) {
      showChartMsg(`Fout: ${e.message}`); return;
    }
    if (!candles || candles.length === 0) { showChartMsg('Geen historische data beschikbaar'); return; }

    // Restore canvas
    const wrap2 = document.getElementById('stockDetailChartWrap');
    if (wrap2) wrap2.innerHTML = '<canvas id="stockDetailChart"></canvas>';

    const firstClose = candles[0].close;
    const lastClose  = candles[candles.length - 1].close;
    const isUp       = lastClose >= firstClose;
    const lineColor  = isUp ? '#4ade80' : '#f87171';
    const fillColor  = lineColor + '22';
    const firstDate  = new Date(candles[0].date);
    const lastDate   = new Date(candles[candles.length - 1].date);

    buildChart([
      {
        data: candles.map(d => ({ x: new Date(d.date), y: d.close })),
        borderColor: lineColor, backgroundColor: fillColor,
        borderWidth: 2, fill: true, tension: 0, pointRadius: 0,
      },
      {
        label: '_ref',
        data: [{ x: firstDate, y: firstClose }, { x: lastDate, y: firstClose }],
        borderColor: ct.costLine, borderWidth: 1, borderDash: [4, 4],
        pointRadius: 0, fill: false, tension: 0,
      },
    ], {
      xUnit: periodToXUnit(period),
      tooltipTitle: items => new Date(items[0].parsed.x).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
      yLabel: v => `${ccySym}${v.toFixed(2)}`,
      ct,
    });
  }
}

function showChartMsg(msg) {
  const wrap = document.getElementById('stockDetailChartWrap');
  if (wrap) wrap.innerHTML = `<div class="sd-chart-msg">${msg}</div>`;
}

// Split intraday points into pre/regular/post datasets.
// Pre and post use a dimmed dashed line; regular gets the full color + fill.
function buildIntradayDatasets(allPts, regStart, regEnd, colors, prevClose, ct) {
  const { lineColor, fillColor, dimColor, dimFillColor } = colors;
  const toXY = p => ({ x: p.ts * 1000, y: p.close });
  const datasets = [];

  if (regStart && regEnd) {
    const prePts  = allPts.filter(p => p.ts < regStart);
    const regPts  = allPts.filter(p => p.ts >= regStart && p.ts < regEnd);
    const postPts = allPts.filter(p => p.ts >= regEnd);

    if (prePts.length > 0) {
      // Bridge: append first regular point so the line connects visually
      const bridge = regPts.length ? [regPts[0]] : [];
      datasets.push({
        label: '_pre',
        data: [...prePts, ...bridge].map(toXY),
        borderColor: dimColor, backgroundColor: dimFillColor,
        borderWidth: 1.5, fill: true, tension: 0, pointRadius: 0,
      });
    }

    if (regPts.length > 0) {
      datasets.push({
        label: '_reg',
        data: regPts.map(toXY),
        borderColor: lineColor, backgroundColor: fillColor,
        borderWidth: 2, fill: true, tension: 0, pointRadius: 0,
      });
    }

    if (postPts.length > 0) {
      // Bridge: prepend last regular point so the line connects visually
      const bridge = regPts.length ? [regPts[regPts.length - 1]] : [];
      datasets.push({
        label: '_post',
        data: [...bridge, ...postPts].map(toXY),
        borderColor: dimColor, backgroundColor: dimFillColor,
        borderWidth: 1.5, fill: true, tension: 0, pointRadius: 0,
      });
    }
  }

  // Fall back to single dataset if no period info or all segments were empty
  if (datasets.length === 0) {
    datasets.push({
      label: '_reg',
      data: allPts.map(toXY),
      borderColor: lineColor, backgroundColor: fillColor,
      borderWidth: 2, fill: true, tension: 0, pointRadius: 0,
    });
  }

  // Previous close reference line (always last, excluded from tooltip)
  if (prevClose) {
    const firstTs = allPts[0].ts;
    const lastTs  = allPts[allPts.length - 1].ts;
    datasets.push({
      label: '_ref',
      data: [{ x: firstTs * 1000, y: prevClose }, { x: lastTs * 1000, y: prevClose }],
      borderColor: ct.costLine, borderWidth: 1, borderDash: [4, 4],
      pointRadius: 0, fill: false, tension: 0,
    });
  }

  return datasets;
}

// Returns vertical break-line descriptors for regular market open/close,
// only when the displayed range actually includes pre or post points.
function buildBreakLines(regStart, regEnd, xMinTs, xMaxTs) {
  const lines = [];
  if (!regStart || !regEnd) return lines;
  // Show open/close lines whenever the chart spans beyond the regular session
  const showOpen  = xMinTs && xMinTs < regStart;
  const showClose = xMaxTs && xMaxTs > regEnd;
  if (showOpen)  lines.push({ ts: regStart, label: 'Open' });
  if (showClose) lines.push({ ts: regEnd,   label: 'Sluit' });
  return lines;
}

// Inline Chart.js plugin: draws vertical dashed lines at market open/close.
const sdBreakLinesPlugin = {
  id: 'sdBreakLines',
  afterDraw(chart, _args, opts) {
    const lines = opts?.lines;
    if (!lines?.length) return;
    const { ctx, chartArea, scales } = chart;
    lines.forEach(({ ts, label }) => {
      const x = scales.x.getPixelForValue(new Date(ts * 1000));
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.strokeStyle = 'rgba(148,163,184,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(x, chartArea.top);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#64748b';
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = 'left';
      ctx.fillText(label, 4, -3);
      ctx.restore();
      ctx.restore();
    });
  },
};

function buildChart(datasets, { xUnit, tooltipTitle, yLabel, ct, breakLines = [], xMin, xMax }) {
  const canvas = document.getElementById('stockDetailChart');
  if (!canvas) return;
  if (_chartInst) { _chartInst.destroy(); _chartInst = null; }
  canvas.style.display = '';

  _chartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    plugins: [sdBreakLinesPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        sdBreakLines: { lines: breakLines },
        tooltip: {
          backgroundColor: ct.tooltipBg,
          borderColor: ct.tooltipBorder,
          borderWidth: 1,
          titleColor: ct.titleColor,
          bodyColor: ct.bodyColor,
          titleFont: { family: "'DM Sans'", size: 11, weight: 700 },
          bodyFont: { family: "'JetBrains Mono'", size: 11 },
          padding: 10,
          cornerRadius: 8,
          filter: item => item.dataset.label !== '_ref',
          callbacks: {
            title: items => tooltipTitle(items),
            label: item => ` ${yLabel(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: xUnit },
          ...(xMin !== undefined && { min: xMin }),
          ...(xMax !== undefined && { max: xMax }),
          grid: { color: ct.gridColor },
          ticks: { color: ct.tickColor, font: { size: 9 }, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: ct.gridColor },
          ticks: { color: ct.tickColor, font: { size: 9 }, callback: yLabel },
          position: 'right',
        },
      },
    },
  });
}
