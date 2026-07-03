/**
 * Market-session logic: exchange definitions, open/closed detection,
 * trading-session lengths and Yahoo market-state normalisation.
 */
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
  if (!symbol) return '';
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

/** Return Unix timestamps (seconds) for session open and close on a given date. */
export function sessionBounds(yahooSymbol: string, dateStr: string): { open: number; close: number } | null {
  if (!dateStr) return null;
  const sfx = yahooSuffix(yahooSymbol);
  const def = EXCHANGE_DEFS[sfx] ?? EXCHANGE_DEFS['']!;
  const unixAtLocal = (h: number, m: number): number => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const naiveUtc = Date.UTC(y!, mo! - 1, d!, h, m);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: def.tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(naiveUtc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.floor((naiveUtc - (tzAsUtc - naiveUtc)) / 1000);
  };
  return {
    open:  unixAtLocal(def.open[0],  def.open[1]),
    close: unixAtLocal(def.close[0], def.close[1]),
  };
}
