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

/** `€25,240` (rounded, en-US grouping; negative → `-€45`). */
export const fmtEur = (v: number): string =>
  `${v < 0 ? '-' : ''}€${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

/** `+€312` / `-€45`. */
export const fmtEurSigned = (v: number): string =>
  `${v >= 0 ? '+' : '-'}€${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

/** `$53.42` / `€590.10` / `£12.30` / `SEK 12.30` (2 decimals). */
export const fmtNative = (v: number, currency: string): string =>
  `${v < 0 ? '-' : ''}${ccySymbol(currency)}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** `+$1.64` / `-€0.32`. */
export const fmtNativeSigned = (v: number, currency: string): string =>
  `${v >= 0 ? '+' : '-'}${ccySymbol(currency)}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** `+1.25%` / `-0.80%` (2 decimals, signed). */
export const fmtPct = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/** `+1.3%` / `-0.8%` (1 decimal, signed). */
export const fmtPct1 = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
