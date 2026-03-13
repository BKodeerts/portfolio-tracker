import { state } from '../state.js';
import { fetchIntraday } from '../api.js';
import { FX_FALLBACK } from '../constants.js';
import { fmt } from '../utils.js';

export function getTradingMins(yahooSymbol) {
  return /\.(DE|AS|PA|L|MI|BR|SW|ST|HE|CO|OL)$/i.test(yahooSymbol || '') ? 510 : 390;
}

export function getMarketStatus() {
  const now = new Date();
  function isOpen(tz, openH, openM, closeH, closeM) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(now);
    const get = t => parts.find(p => p.type === t)?.value;
    if (['Sat', 'Sun'].includes(get('weekday'))) return false;
    const cur = (parseInt(get('hour')) % 24) * 60 + parseInt(get('minute'));
    return cur >= openH * 60 + openM && cur < closeH * 60 + closeM;
  }
  const badge = (label, open) =>
    `<span class="market-badge"><span class="dot" style="background:${open ? '#4ade80' : '#334155'}"></span>${label}</span>`;
  return badge('NYSE', isOpen('America/New_York', 9, 30, 16, 0)) +
         badge('XETRA', isOpen('Europe/Amsterdam', 9, 0, 17, 30));
}

export function renderMarketStatus() {
  const el = document.getElementById('marketStatus');
  if (el) el.innerHTML = getMarketStatus();
}

export function sparklineSVG(points, prevClose, tradingMins) {
  if (!points || points.length < 2 || !prevClose) return '';
  const pcts = points.map(p => (p.close - prevClose) / prevClose * 100);
  const min = Math.min(0, ...pcts);
  const max = Math.max(0, ...pcts);
  const range = max - min || 0.1;
  const W = 200, H = 38;
  const firstTs   = points[0].ts;
  const totalSecs = (tradingMins || 390) * 60;
  const xs = points.map(p => Math.min(W, Math.max(0, ((p.ts - firstTs) / totalSecs) * W)));
  const ys = pcts.map(v => (H - 3) - ((v - min) / range) * (H - 6));
  const polyPts  = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fillPath = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)} ` +
    xs.slice(1).map((x, i) => `L${x.toFixed(1)},${ys[i + 1].toFixed(1)}`).join(' ') +
    ` L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;
  const zeroY = ((H - 3) - ((-min) / range) * (H - 6)).toFixed(1);
  const clr = pcts[pcts.length - 1] >= 0 ? '#4ade80' : '#f87171';
  const uid = `sp${Math.random().toString(36).slice(2, 7)}`;
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;margin-top:8px">
    <defs><linearGradient id="${uid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${clr}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${clr}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <path d="${fillPath}" fill="url(#${uid})"/>
    <polyline points="${polyPts}" fill="none" stroke="${clr}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function computeTodayPL() {
  let plEur = 0, baseEur = 0;
  const latest = state.chartData[state.chartData.length - 1];
  state.CURRENT_TICKERS.forEach(ticker => {
    const meta = state.TICKER_META[ticker];
    const data = state.intradayData[meta?.yahoo];
    if (!data?.previousClose || !data.points?.length) return;
    const shares = latest?.[`${ticker}_shares`];
    if (!shares) return;
    const lastPrice = data.points[data.points.length - 1].close;
    const fx = state.fxRateMap[data.date] || FX_FALLBACK;
    const toEurFactor = meta.currency === 'USD' ? 1 / fx : 1;
    plEur   += shares * (lastPrice - data.previousClose) * toEurFactor;
    baseEur += shares * data.previousClose * toEurFactor;
  });
  return baseEur > 0 ? { pl: plEur, pct: (plEur / baseEur) * 100 } : null;
}

export function renderTodayMetric() {
  const el = document.getElementById('metricToday');
  if (!el) return;
  const r = computeTodayPL();
  if (!r) {
    el.innerHTML = `<div class="metric-value c-neutral" style="font-size:17px">—</div><div class="metric-sub">geen data</div>`;
    return;
  }
  const cls  = r.pl >= 0 ? 'c-pos' : 'c-neg';
  const sign = r.pl >= 0 ? '+' : '';
  el.innerHTML = `<div class="metric-value ${cls} privacy-val" style="font-size:17px">${sign}${fmt(r.pl)}</div><div class="metric-sub ${cls}">${sign}${r.pct.toFixed(2)}%</div>`;
}

export function renderIntradaySection() {
  const gridEl   = document.getElementById('intradayGrid');
  const statusEl = document.getElementById('intradayStatus');
  if (!gridEl) return;

  const entries = state.CURRENT_TICKERS
    .map(t => ({ ticker: t, yahoo: state.TICKER_META[t]?.yahoo, data: state.intradayData[state.TICKER_META[t]?.yahoo] }))
    .filter(e => e.data?.points?.length > 0);

  if (entries.length === 0) {
    if (statusEl) statusEl.textContent = state.intradayLoaded ? 'geen data' : 'laden…';
    if (!state.intradayLoaded) { gridEl.innerHTML = ''; return; }
    gridEl.innerHTML = `<div style="color:#334155;font-size:11px">Markt gesloten of geen intradaydata beschikbaar.</div>`;
    return;
  }

  if (statusEl) {
    const lastTs   = Math.max(...entries.map(e => e.data.points[e.data.points.length - 1].ts));
    const lastTime = new Date(lastTs * 1000).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
    statusEl.textContent = `bijgewerkt ${lastTime}`;
  }

  gridEl.innerHTML = entries.map(({ ticker, yahoo, data }) => {
    const prev = data.previousClose;
    const last = data.points[data.points.length - 1];
    const pct  = prev ? ((last.close - prev) / prev * 100) : 0;
    const cls  = pct >= 0 ? 'c-pos' : 'c-neg';
    return `<div class="intraday-card">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#94a3b8;margin-bottom:2px">
        <span class="pos-dot" style="background:${window._getColor(ticker)}"></span>${ticker}
      </div>
      <div class="metric-value ${cls}" style="font-size:16px;margin-top:5px">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</div>
      ${sparklineSVG(data.points, prev, getTradingMins(yahoo))}
      <div class="metric-sub">${data.currency || ''} ${last.close.toFixed(2)}</div>
    </div>`;
  }).join('');

  renderTodayMetric();
}

export async function loadIntradayData(force = false) {
  const yahooSymbols = [...new Set(state.CURRENT_TICKERS.map(t => state.TICKER_META[t]?.yahoo).filter(Boolean))];
  if (yahooSymbols.length === 0) return;
  const statusEl = document.getElementById('intradayStatus');
  if (statusEl) statusEl.textContent = 'laden…';
  try {
    const json = await fetchIntraday(yahooSymbols, force);
    if (json.status !== 'ok') throw new Error(json.message);
    state.intradayData = json.data;
  } catch (e) {
    if (statusEl) statusEl.textContent = 'laden mislukt';
    console.warn('Intraday load failed:', e.message);
  }
  state.intradayLoaded = true;
  renderIntradaySection();
}
