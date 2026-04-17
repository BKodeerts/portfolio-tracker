export const EU_EXCHANGE_RE = /\.(DE|AS|PA|L|MI|BR|SW|ST|HE|CO|OL)$/i;

interface ExchangeDef {
  label: string;
  tz: string;
  open: [number, number];
  close: [number, number];
}

const EXCHANGE_DEFS: Record<string, ExchangeDef> = {
  '':    { label: 'US',    tz: 'America/New_York',    open: [9, 30],  close: [16, 0]  },
  '.DE': { label: 'XETRA', tz: 'Europe/Berlin',       open: [9, 0],   close: [17, 30] },
  '.AS': { label: 'AEX',   tz: 'Europe/Amsterdam',    open: [9, 0],   close: [17, 30] },
  '.PA': { label: 'EPA',   tz: 'Europe/Paris',        open: [9, 0],   close: [17, 30] },
  '.L':  { label: 'LSE',   tz: 'Europe/London',       open: [8, 0],   close: [16, 30] },
  '.MI': { label: 'MIL',   tz: 'Europe/Rome',         open: [9, 0],   close: [17, 30] },
  '.BR': { label: 'XBRU',  tz: 'Europe/Brussels',     open: [9, 0],   close: [17, 30] },
  '.SW': { label: 'SWX',   tz: 'Europe/Zurich',       open: [9, 0],   close: [17, 30] },
  '.ST': { label: 'SSEX',  tz: 'Europe/Stockholm',    open: [9, 0],   close: [17, 30] },
  '.HE': { label: 'OMX',   tz: 'Europe/Helsinki',     open: [9, 0],   close: [17, 30] },
  '.CO': { label: 'KFX',   tz: 'Europe/Copenhagen',   open: [9, 0],   close: [17, 30] },
  '.OL': { label: 'OSE',   tz: 'Europe/Oslo',         open: [9, 0],   close: [17, 30] },
  '.CL': { label: 'SCL',   tz: 'America/Santiago',    open: [9, 30],  close: [17, 0]  },
  '.TO': { label: 'TSX',   tz: 'America/Toronto',     open: [9, 30],  close: [16, 0]  },
  '.AX': { label: 'ASX',   tz: 'Australia/Sydney',    open: [10, 0],  close: [16, 0]  },
  '.T':  { label: 'TSE',   tz: 'Asia/Tokyo',          open: [9, 0],   close: [15, 30] },
  '.MX': { label: 'BMV',   tz: 'America/Mexico_City', open: [8, 30],  close: [15, 0]  },
};

function yahooSuffix(symbol: string): string {
  const m = symbol.match(/\.([A-Z]{1,2})$/i);
  return m?.[1] ? `.${m[1].toUpperCase()}` : '';
}

function isOpenNow(tz: string, openH: number, openM: number, closeH: number, closeM: number): boolean {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  if (['Sat', 'Sun'].includes(get('weekday'))) return false;
  const cur = (parseInt(get('hour')) % 24) * 60 + parseInt(get('minute'));
  return cur >= openH * 60 + openM && cur < closeH * 60 + closeM;
}

export function isExchangeOpen(yahooSymbol: string): boolean {
  const sfx = yahooSuffix(yahooSymbol);
  const def = EXCHANGE_DEFS[sfx] ?? EXCHANGE_DEFS['']!;
  return isOpenNow(def.tz, def.open[0], def.open[1], def.close[0], def.close[1]);
}

export function getTradingMins(yahooSymbol: string): number {
  return EU_EXCHANGE_RE.test(yahooSymbol) ? 510 : 390;
}

/** EU exchanges have no real post-market — normalise Yahoo POST → CLOSED for EU. */
export function normalizeMarketState(yahooSymbol: string, rawState: string): string {
  if (rawState === 'POST' && EU_EXCHANGE_RE.test(yahooSymbol)) return 'CLOSED';
  return rawState;
}

/** Build an inline SVG sparkline from intraday points. */
export function sparklineSVG(
  points: { ts: number; close: number }[],
  prevClose: number,
  tradingMins: number,
  muted = false,
): string {
  if (!points || points.length < 2 || !prevClose) return '';
  const pcts = points.map((p) => ((p.close - prevClose) / prevClose) * 100);
  const min = Math.min(0, ...pcts);
  const max = Math.max(0, ...pcts);
  const range = max - min || 0.1;
  const W = 200, H = 38;
  const firstTs   = points[0]!.ts;
  const totalSecs = tradingMins ? tradingMins * 60 : points[points.length - 1]!.ts - firstTs;
  const xs = points.map((p) => Math.min(W, Math.max(0, ((p.ts - firstTs) / totalSecs) * W)));
  const ys = pcts.map((v) => H - 3 - ((v - min) / range) * (H - 6));
  const polyPts  = xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  const fillPath = `M${xs[0]!.toFixed(1)},${ys[0]!.toFixed(1)} ` +
    xs.slice(1).map((x, i) => `L${x.toFixed(1)},${ys[i + 1]!.toFixed(1)}`).join(' ') +
    ` L${xs[xs.length - 1]!.toFixed(1)},${H} L${xs[0]!.toFixed(1)},${H} Z`;
  const zeroY = (H - 3 - ((-min) / range) * (H - 6)).toFixed(1);
  const last  = pcts[pcts.length - 1] ?? 0;
  const clr   = last >= 0 ? '#4ade80' : '#f87171';
  const uid   = `sp${Math.random().toString(36).slice(2, 7)}`;
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;margin-top:8px" opacity="${muted ? '0.45' : '1'}">
  <defs><linearGradient id="${uid}" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" stop-color="${clr}" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="${clr}" stop-opacity="0.02"/>
  </linearGradient></defs>
  <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="rgba(128,128,128,0.2)" stroke-width="1"/>
  <path d="${fillPath}" fill="url(#${uid})"/>
  <polyline points="${polyPts}" fill="none" stroke="${clr}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
