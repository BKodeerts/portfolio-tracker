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
    tooltipBg:     dark ? 'rgba(28,28,28,0.97)' : 'rgba(20,20,20,0.97)',
    tooltipBorder: 'rgba(255,255,255,0.1)',
    titleColor:    '#888',
    bodyColor:     dark ? '#d4d4d4' : '#d8d8d8',
    gridColor:     'rgba(255,255,255,0.04)',
    tickColor:     '#666',
    costLine:      dark ? '#444' : '#484848',
    costFill:      dark ? 'rgba(68,68,68,0.05)' : 'rgba(72,72,72,0.06)',
    donutBorder:   'rgba(26,26,26,0.9)',
    benchmarkLine: '#666',
  };
}
