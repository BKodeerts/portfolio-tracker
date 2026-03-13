import { state } from './state.js';
import { FX_FALLBACK, COLOR_PALETTE, PRESET_COLORS } from './constants.js';

export const fmt    = v => `€${Math.round(v).toLocaleString('nl-BE')}`;
export const fmtPct = v => `${parseFloat(v) >= 0 ? '+' : ''}${parseFloat(v).toFixed(1)}%`;

export function toEur(v, currency, date) {
  if (currency !== 'USD') return v;
  return v / (state.fxRateMap[date] || FX_FALLBACK);
}

export function getColor(ticker) {
  if (!state.COLORS[ticker]) {
    state.COLORS[ticker] = PRESET_COLORS[ticker] ||
      COLOR_PALETTE[Object.keys(state.COLORS).length % COLOR_PALETTE.length];
  }
  return state.COLORS[ticker];
}

export function getFilteredData() {
  if (state.currentPeriod === 'total') return state.chartData;
  const now = new Date();
  let cutoff;
  if      (state.currentPeriod === 'ytd') cutoff = `${now.getFullYear()}-01-01`;
  else if (state.currentPeriod === '1m')  { const d = new Date(now); d.setMonth(d.getMonth()-1);       cutoff = d.toISOString().slice(0,10); }
  else if (state.currentPeriod === '3m')  { const d = new Date(now); d.setMonth(d.getMonth()-3);       cutoff = d.toISOString().slice(0,10); }
  else if (state.currentPeriod === '6m')  { const d = new Date(now); d.setMonth(d.getMonth()-6);       cutoff = d.toISOString().slice(0,10); }
  else if (state.currentPeriod === '1y')  { const d = new Date(now); d.setFullYear(d.getFullYear()-1); cutoff = d.toISOString().slice(0,10); }
  else if (state.currentPeriod === '2y')  { const d = new Date(now); d.setFullYear(d.getFullYear()-2); cutoff = d.toISOString().slice(0,10); }
  else if (state.currentPeriod === '3y')  { const d = new Date(now); d.setFullYear(d.getFullYear()-3); cutoff = d.toISOString().slice(0,10); }
  return state.chartData.filter(d => d.date >= cutoff);
}

export function destroyAllCharts() {
  Object.values(state.chartInstances).forEach(c => { try { c.destroy(); } catch {} });
  state.chartInstances = {};
}

export function chartTheme() {
  const dark = document.body.classList.contains('theme-dark');
  return {
    tooltipBg:     dark ? 'rgba(28,28,28,0.97)'    : 'rgba(8,8,24,0.96)',
    tooltipBorder: dark ? 'rgba(255,255,255,0.1)'  : 'rgba(255,255,255,0.08)',
    titleColor:    dark ? '#888'                   : '#94a3b8',
    bodyColor:     dark ? '#d4d4d4'                : '#e2e8f0',
    gridColor:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)',
    tickColor:     dark ? '#666'                   : '#475569',
    costLine:      dark ? '#444'                   : '#334155',
    costFill:      dark ? 'rgba(68,68,68,0.05)'    : 'rgba(51,65,85,0.05)',
    donutBorder:   dark ? 'rgba(26,26,26,0.9)'     : 'rgba(8,8,24,0.8)',
    benchmarkLine: dark ? '#666'                   : '#475569',
  };
}
