/** Legacy EUR formatter (nl-BE grouping) — kept for pages not yet revamped. */
export const fmt = (v: number): string =>
  `€${Math.round(v).toLocaleString('nl-BE')}`;

export const fmtNum = (v: number, decimals = 2): string =>
  v.toLocaleString('nl-BE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/* ── Revamp formatters: en-US grouping, no space after symbol ── */

const CCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

function ccySymbol(currency: string): string {
  return CCY_SYMBOLS[currency] ?? `${currency} `;
}

/** GBX = London pence quotes (Yahoo reports the currency as "GBp"). */
export const isPence = (currency: string): boolean =>
  currency === 'GBX' || currency === 'GBp';

const abs2 = (v: number): string =>
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `€25,240` (rounded, en-US grouping; negative → `-€45`). */
export const fmtEur = (v: number): string =>
  `${v < 0 ? '-' : ''}€${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

/** `+€312` / `-€45`. */
export const fmtEurSigned = (v: number): string =>
  `${v >= 0 ? '+' : '-'}€${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

/** `$53.42` / `€590.10` / `11.86p` (GBX pence suffix, no fake £ conversion). */
export const fmtNative = (v: number, currency: string): string =>
  isPence(currency)
    ? `${v < 0 ? '-' : ''}${abs2(v)}p`
    : `${v < 0 ? '-' : ''}${ccySymbol(currency)}${abs2(v)}`;

/** `+$1.64` / `-€0.32` / `+0.44p`. */
export const fmtNativeSigned = (v: number, currency: string): string =>
  isPence(currency)
    ? `${v >= 0 ? '+' : '-'}${abs2(v)}p`
    : `${v >= 0 ? '+' : '-'}${ccySymbol(currency)}${abs2(v)}`;

/** `16.9B` / `4.2M` / `987K` — compact magnitude, 1 decimal, trailing .0 stripped. */
export const fmtCompact = (v: number): string => {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const unit = (div: number, sfx: string) => {
    const s = (a / div).toFixed(1).replace(/\.0$/, '');
    return `${sign}${s}${sfx}`;
  };
  if (a >= 1e12) return unit(1e12, 'T');
  if (a >= 1e9)  return unit(1e9, 'B');
  if (a >= 1e6)  return unit(1e6, 'M');
  if (a >= 1e3)  return unit(1e3, 'K');
  return `${sign}${Math.round(a).toLocaleString('en-US')}`;
};

/** `$16.9B` / `€2.1B` / `1.2Bp` (pence suffix, like fmtNative). */
export const fmtCompactNative = (v: number, currency: string): string =>
  isPence(currency) ? `${fmtCompact(v)}p` : `${ccySymbol(currency)}${fmtCompact(v)}`;

/** `+1.25%` / `-0.80%` (2 decimals, signed). */
export const fmtPct = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/** `+1.3%` / `-0.8%` (1 decimal, signed). */
export const fmtPct1 = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
