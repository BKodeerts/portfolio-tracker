const fmt = (v) => `€${Math.round(v).toLocaleString("nl-BE")}`;
const fmtPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtNum = (v, decimals = 2) => v.toLocaleString("nl-BE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export {
  fmtPct as a,
  fmtNum as b,
  fmt as f
};
