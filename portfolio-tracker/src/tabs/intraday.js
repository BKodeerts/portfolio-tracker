import { state } from '../state.js';
import { fetchIntraday } from '../api.js';
import { FX_DEFS, FX_FALLBACK, FX_SYMBOL } from '../constants.js';
import { fmt } from '../utils.js';

function staleDayLabel(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 1) return 'gisteren';
  return d.toLocaleDateString('nl-BE', { weekday: 'long' });
}

export const EU_EXCHANGE_RE = /\.(DE|AS|PA|L|MI|BR|SW|ST|HE|CO|OL)$/i;

// Maps Yahoo exchange codes to display labels for US exchanges
const US_EXCHANGE_LABELS = {
  NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ',
  NYQ: 'NYSE', NYSEArca: 'NYSE',
};

// Per-exchange config: yahoo suffix → { label, tz, open [h,m], close [h,m] }
// Empty string = US stocks (no Yahoo suffix) — label used as fallback only
const EXCHANGE_DEFS = {
  '':    { label: 'US',    tz: 'America/New_York',   open: [9,30],  close: [16,0]  },
  '.DE': { label: 'XETRA', tz: 'Europe/Berlin',      open: [9,0],   close: [17,30] },
  '.AS': { label: 'AEX',   tz: 'Europe/Amsterdam',   open: [9,0],   close: [17,30] },
  '.PA': { label: 'EPA',   tz: 'Europe/Paris',       open: [9,0],   close: [17,30] },
  '.L':  { label: 'LSE',   tz: 'Europe/London',      open: [8,0],   close: [16,30] },
  '.MI': { label: 'MIL',   tz: 'Europe/Rome',        open: [9,0],   close: [17,30] },
  '.BR': { label: 'XBRU',  tz: 'Europe/Brussels',    open: [9,0],   close: [17,30] },
  '.SW': { label: 'SWX',   tz: 'Europe/Zurich',      open: [9,0],   close: [17,30] },
  '.ST': { label: 'SSEX',  tz: 'Europe/Stockholm',   open: [9,0],   close: [17,30] },
  '.HE': { label: 'OMX',   tz: 'Europe/Helsinki',    open: [9,0],   close: [17,30] },
  '.CO': { label: 'KFX',   tz: 'Europe/Copenhagen',  open: [9,0],   close: [17,30] },
  '.OL': { label: 'OSE',   tz: 'Europe/Oslo',        open: [9,0],   close: [17,30] },
  '.CL': { label: 'SCL',   tz: 'America/Santiago',   open: [9,30],  close: [17,0]  },
  '.TO': { label: 'TSX',   tz: 'America/Toronto',    open: [9,30],  close: [16,0]  },
  '.AX': { label: 'ASX',   tz: 'Australia/Sydney',   open: [10,0],  close: [16,0]  },
  '.T':  { label: 'TSE',   tz: 'Asia/Tokyo',         open: [9,0],   close: [15,30] },
  '.MX': { label: 'BMV',   tz: 'America/Mexico_City',open: [8,30],  close: [15,0]  },
};

function yahooSuffix(symbol) {
  const m = (symbol || '').match(/\.([A-Z]{1,2})$/i);
  return m ? `.${m[1].toUpperCase()}` : '';
}

export function getTradingMins(yahooSymbol) {
  return EU_EXCHANGE_RE.test(yahooSymbol || '') ? 510 : 390;
}

function isOpen(tz, openH, openM, closeH, closeM) {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value;
  if (['Sat', 'Sun'].includes(get('weekday'))) return false;
  const cur = (Number.parseInt(get('hour')) % 24) * 60 + Number.parseInt(get('minute'));
  return cur >= openH * 60 + openM && cur < closeH * 60 + closeM;
}

export function isExchangeOpen(yahooSymbol) {
  const sfx = yahooSuffix(yahooSymbol);
  const def = EXCHANGE_DEFS[sfx] || EXCHANGE_DEFS[''];
  return isOpen(def.tz, ...def.open, ...def.close);
}

export function getMarketStatus() {
  const badge = (label, open) =>
    `<span class="market-badge"><span class="dot" style="background:${open ? '#4ade80' : '#334155'}"></span>${label}</span>`;

  // Collect unique exchange suffixes from currently tracked tickers
  const seen = new Map();
  for (const ticker of (state.CURRENT_TICKERS || [])) {
    const yahoo = state.TICKER_META?.[ticker]?.yahoo || '';
    const sfx = yahooSuffix(yahoo);
    if (EXCHANGE_DEFS[sfx] && !seen.has(sfx)) seen.set(sfx, EXCHANGE_DEFS[sfx]);
  }
  // Fallback when no tickers loaded yet
  if (seen.size === 0) {
    seen.set('', EXCHANGE_DEFS['']);
    seen.set('.DE', EXCHANGE_DEFS['.DE']);
  }

  const todayStr = new Date().toLocaleDateString('sv-SE');
  const exchanges = new Map(); // label → open (bool)
  const coveredSfx = new Set();

  if (state.intradayData) {
    for (const [sym, data] of Object.entries(state.intradayData)) {
      if (sym.endsWith('=X') || !data) continue;
      const sfx = yahooSuffix(sym);
      const def = EXCHANGE_DEFS[sfx];
      // Only show badges for exchanges actually in the portfolio
      if (!def || !seen.has(sfx)) continue;
      // For US stocks use the actual exchange code (NASDAQ/NYSE), fall back to 'US'
      const label = !sfx ? (US_EXCHANGE_LABELS[data.exchange] ?? def.label) : def.label;
      if (!exchanges.has(label)) {
        const open = data.date === todayStr && data.marketState
          ? data.marketState === 'REGULAR'
          : isOpen(def.tz, ...def.open, ...def.close);
        exchanges.set(label, open);
      }
      coveredSfx.add(sfx);
    }
  }
  // Fallback: portfolio suffixes not present in intradayData
  for (const [sfx, def] of seen.entries()) {
    if (!coveredSfx.has(sfx)) exchanges.set(def.label, isOpen(def.tz, ...def.open, ...def.close));
  }
  if (exchanges.size === 0) {
    exchanges.set('US', isOpen('America/New_York', 9, 30, 16, 0));
    exchanges.set('XETRA', isOpen('Europe/Berlin', 9, 0, 17, 30));
  }
  return [...exchanges.entries()].map(([label, open]) => badge(label, open)).join('');
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
  const totalSecs = tradingMins ? tradingMins * 60 : points[points.length - 1].ts - firstTs;
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
    <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="rgba(128,128,128,0.2)" stroke-width="1"/>
    <path d="${fillPath}" fill="url(#${uid})"/>
    <polyline points="${polyPts}" fill="none" stroke="${clr}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function computeTodayPL() {
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
  let plEur = 0, baseEur = 0;
  const latest = state.chartData.at(-1);
  if (!latest) return null;

  // Helper: get current + previous FX rate for a given currency from intraday data
  function getFxForCcy(currency) {
    const def = FX_DEFS[currency];
    if (!def) return { current: 1, prev: 1, scale: 1 };
    const fxData = state.intradayData[def.symbol];
    const current = fxData?.points?.length
      ? fxData.points[fxData.points.length - 1].close
      : (def.fallback);
    const prev = fxData?.previousClose || state.latestFxRate || current;
    return { current, prev, scale: def.scale || 1 };
  }

  state.CURRENT_TICKERS.forEach(ticker => {
    const meta = state.TICKER_META[ticker];
    const data = state.intradayData[meta?.yahoo];
    if (!data?.previousClose) return;
    const shares = latest?.[`${ticker}_shares`];
    if (!shares) return;

    if (meta.currency && meta.currency !== 'EUR') {
      // Non-EUR positions: apply both price and FX impact, even when market is closed.
      const { current: currentFx, prev: prevFx, scale } = getFxForCcy(meta.currency);
      const todayPrice = (data.date === today && data.points?.length)
        ? data.points[data.points.length - 1].close
        : data.previousClose;
      const prevEur  = data.previousClose / prevFx / scale;
      const todayEur = todayPrice / currentFx / scale;
      plEur   += shares * (todayEur - prevEur);
      baseEur += shares * prevEur;
    } else {
      // EUR positions: only price change, only when today's data is available
      if (data.date !== today || !data.points?.length) return;
      const lastPrice = data.points[data.points.length - 1].close;
      plEur   += shares * (lastPrice - data.previousClose);
      baseEur += shares * data.previousClose;
    }
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
    .map(t => ({ ticker: t, yahoo: state.TICKER_META[t]?.yahoo, data: state.intradayData[state.TICKER_META[t]?.yahoo] }));

  const withData = entries.filter(e => e.data?.points?.length > 0);

  if (!state.intradayLoaded) { gridEl.innerHTML = ''; return; }

  if (withData.length === 0 && entries.every(e => !e.data)) {
    if (statusEl) statusEl.textContent = 'geen data';
    gridEl.innerHTML = `<div style="color:#888;font-size:11px">Markt gesloten of geen intradaydata beschikbaar.</div>`;
    return;
  }

  if (withData.length > 0 && statusEl) {
    const lastTs   = Math.max(...withData.map(e => e.data.points[e.data.points.length - 1].ts));
    const lastDate = new Date(lastTs * 1000).toISOString().slice(0, 10);
    const lastTime = new Date(lastTs * 1000).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
    const todayStr = new Date().toISOString().slice(0, 10);
    statusEl.textContent = lastDate !== todayStr ? `${staleDayLabel(lastDate)} ${lastTime}` : `bijgewerkt ${lastTime}`;
  }

  const fxData = state.intradayData[FX_SYMBOL];
  const fxCard = fxData?.points?.length ? (() => {
    const prev      = fxData.previousClose;
    const last      = fxData.points[fxData.points.length - 1];
    // Invert to USD/EUR so a stronger USD shows as a gain (matches portfolio impact)
    const prevInv   = prev ? 1 / prev : null;
    const lastInv   = 1 / last.close;
    const invPoints = fxData.points.map(p => ({ ...p, close: 1 / p.close }));
    const pct       = prevInv ? ((lastInv - prevInv) / prevInv * 100) : 0;
    const cls       = pct >= 0 ? 'c-pos' : 'c-neg';
    const todayStr  = new Date().toISOString().slice(0, 10);
    const fxIsStale = fxData.date !== todayStr;
    return `<div class="intraday-card" style="${fxIsStale ? 'opacity:0.5' : ''}">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#888;margin-bottom:2px">
        <span class="pos-dot" style="background:#94a3b8"></span>USD/EUR
        ${fxIsStale ? `<span style="font-size:9px;color:#f59e0b;font-family:'JetBrains Mono',monospace;margin-left:auto">${staleDayLabel(fxData.date)}</span>` : ''}
      </div>
      <div class="metric-value ${cls}" style="font-size:16px;margin-top:5px">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</div>
      ${sparklineSVG(invPoints, prevInv, 1440)}
      <div class="metric-sub">${lastInv.toFixed(4)}</div>
    </div>`;
  })() : '';

  // Preserve bonus cards — they are appended separately and must survive a full grid re-render
  const bonusCards = [...gridEl.querySelectorAll('.bonus-card')];

  gridEl.innerHTML = fxCard + entries.map(({ ticker, yahoo, data }) => {
    const hasData = data?.points?.length > 0;
    if (!hasData) {
      return `<div class="intraday-card" style="opacity:0.45;cursor:pointer" onclick="window._showPosModal('${ticker}')">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#888;margin-bottom:2px">
          <span class="pos-dot" style="background:${window._getColor(ticker)}"></span>${ticker}
        </div>
        <div class="metric-value c-neutral" style="font-size:16px;margin-top:5px">—</div>
        <div class="metric-sub" style="margin-top:8px">geen data</div>
      </div>`;
    }
    const meta    = state.TICKER_META[ticker];
    const prev    = data.previousClose;
    const last    = data.points[data.points.length - 1];
    const pct     = prev ? ((last.close - prev) / prev * 100) : 0;
    const cls     = pct >= 0 ? 'c-pos' : 'c-neg';
    const todayStr  = new Date().toISOString().slice(0, 10);
    const isStale   = data.date !== todayStr;
    const isClosed  = !isStale && (data.marketState ? data.marketState !== 'REGULAR' : !isExchangeOpen(yahoo));
    let statusLabel = '';
    if (isStale)       statusLabel = `<span style="font-size:9px;color:#f59e0b;font-family:'JetBrains Mono',monospace;margin-left:auto">${staleDayLabel(data.date)}</span>`;
    else if (isClosed) statusLabel = `<span style="font-size:9px;color:#64748b;font-family:'JetBrains Mono',monospace;margin-left:auto">gesloten</span>`;
    // Show price in the stock's native currency (from TICKER_META), converting if Yahoo returns a different currency
    const nativeCcy    = meta?.currency || data.currency || '';
    const displayPrice = (nativeCcy === 'USD' && data.currency === 'EUR')
      ? last.close * (state.liveEurUsd || FX_FALLBACK)
      : last.close;
    return `<div class="intraday-card" style="${isStale ? 'opacity:0.5;' : ''}cursor:pointer" onclick="window._showPosModal('${ticker}')">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#888;margin-bottom:2px">
        <span class="pos-dot" style="background:${window._getColor(ticker)}"></span>${ticker}
        ${statusLabel}
      </div>
      <div class="metric-value ${cls}" style="font-size:16px;margin-top:5px">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</div>
      ${sparklineSVG(data.points, prev, getTradingMins(yahoo))}
      <div class="metric-sub">${nativeCcy} ${displayPrice.toFixed(2)}</div>
    </div>`;
  }).join('');

  bonusCards.forEach(c => gridEl.appendChild(c));

  renderMarketStatus();
  renderTodayMetric();
}

export async function loadIntradayData(force = false, onDone = null) {
  const yahooSymbols = [...new Set(state.CURRENT_TICKERS.map(t => state.TICKER_META[t]?.yahoo).filter(Boolean))];
  if (yahooSymbols.length === 0) return;
  const statusEl = document.getElementById('intradayStatus');
  if (statusEl) statusEl.textContent = 'laden…';
  try {
    // Collect FX symbols for all non-EUR currencies in the current portfolio
    const currencies = [...new Set(state.CURRENT_TICKERS.map(t => state.TICKER_META[t]?.currency).filter(c => c && c !== 'EUR'))];
    const fxSymbols  = [...new Set(currencies.map(c => FX_DEFS[c]?.symbol).filter(Boolean))];
    const allSymbols = [...new Set([...yahooSymbols, FX_SYMBOL, ...fxSymbols])];
    const json = await fetchIntraday(allSymbols, force);
    if (json.status !== 'ok') throw new Error(json.message);
    state.intradayData = json.data;
    const fxData = json.data[FX_SYMBOL];
    if (fxData?.points?.length) {
      state.liveEurUsd = fxData.points[fxData.points.length - 1].close;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'laden mislukt';
    console.warn('Intraday load failed:', e.message);
  }
  state.intradayLoaded = true;
  renderIntradaySection();
  onDone?.();
}
