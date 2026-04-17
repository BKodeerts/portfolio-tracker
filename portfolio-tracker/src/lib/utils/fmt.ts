export const fmt = (v: number): string =>
  `€${Math.round(v).toLocaleString('nl-BE')}`;

export const fmtPct = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export const fmtNum = (v: number, decimals = 2): string =>
  v.toLocaleString('nl-BE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
