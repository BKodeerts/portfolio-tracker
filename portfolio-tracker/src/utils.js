import { state } from './state.js';
import { COLOR_PALETTE, PRESET_COLORS } from './constants.js';

export const fmt    = v => `€${Math.round(v).toLocaleString('nl-BE')}`;
export const fmtPct = v => `${parseFloat(v) >= 0 ? '+' : ''}${parseFloat(v).toFixed(1)}%`;

export function getColor(ticker) {
  if (!state.COLORS[ticker]) {
    state.COLORS[ticker] = PRESET_COLORS[ticker] ||
      COLOR_PALETTE[Object.keys(state.COLORS).length % COLOR_PALETTE.length];
  }
  return state.COLORS[ticker];
}

export function getFilteredData(period = state.currentPeriod) {
  if (period === 'total') return state.chartData;
  const now = new Date();
  let cutoff;
  if      (period === '1d')  { const d = new Date(now); d.setDate(d.getDate()-1);         cutoff = d.toISOString().slice(0,10); }
  else if (period === 'ytd') cutoff = `${now.getFullYear()}-01-01`;
  else if (period === '1m')  { const d = new Date(now); d.setMonth(d.getMonth()-1);       cutoff = d.toISOString().slice(0,10); }
  else if (period === '3m')  { const d = new Date(now); d.setMonth(d.getMonth()-3);       cutoff = d.toISOString().slice(0,10); }
  else if (period === '6m')  { const d = new Date(now); d.setMonth(d.getMonth()-6);       cutoff = d.toISOString().slice(0,10); }
  else if (period === '1y')  { const d = new Date(now); d.setFullYear(d.getFullYear()-1); cutoff = d.toISOString().slice(0,10); }
  else if (period === '2y')  { const d = new Date(now); d.setFullYear(d.getFullYear()-2); cutoff = d.toISOString().slice(0,10); }
  else if (period === '3y')  { const d = new Date(now); d.setFullYear(d.getFullYear()-3); cutoff = d.toISOString().slice(0,10); }
  const result = state.chartData.filter(d => d.date >= cutoff);
  return result.length ? result : state.chartData.slice(-1);
}

export function destroyAllCharts() {
  Object.values(state.chartInstances).forEach(c => { try { c.destroy(); } catch {} });
  state.chartInstances = {};
}

export function chartTheme() {
  const dark = document.body.classList.contains('theme-dark');
  return {
    tooltipBg:     dark ? 'rgba(28,28,28,0.97)'    : 'rgba(255,255,255,0.97)',
    tooltipBorder: dark ? 'rgba(255,255,255,0.1)'  : 'rgba(0,0,0,0.08)',
    titleColor:    '#888',
    bodyColor:     dark ? '#d8d8d8'                : '#1c1c1c',
    gridColor:     dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    tickColor:     dark ? '#909090'                : '#999',
    costLine:      dark ? '#666'                   : '#ccc',
    costFill:      dark ? 'rgba(80,80,80,0.07)'    : 'rgba(0,0,0,0.03)',
    donutBorder:   dark ? 'rgba(24,24,27,0.9)'     : 'rgba(243,245,248,0.9)',
    benchmarkLine: dark ? '#888'                   : '#bbb',
  };
}
