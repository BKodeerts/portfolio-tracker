import { state } from '../state.js';

const BACK_LABELS = { portefeuille: 'Overzicht', analyse: 'Analyse', transacties: 'Transacties', instellingen: 'Instellingen' };

const ICON_GRID  = `<svg class="nav-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="0" y="0" width="5" height="5" rx="1" fill="currentColor"/><rect x="7" y="0" width="5" height="5" rx="1" fill="currentColor"/><rect x="0" y="7" width="5" height="5" rx="1" fill="currentColor"/><rect x="7" y="7" width="5" height="5" rx="1" fill="currentColor"/></svg>`;
const ICON_CHART = `<svg class="nav-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><polyline points="1,10 4,5.5 7,7.5 11,2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_LIST  = `<svg class="nav-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><line x1="1" y1="2.5" x2="11" y2="2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="1" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function detailNav(backLabel, backFn) {
  return `
    <button class="sd-nav-back mobile-only" onclick="${backFn}">← ${backLabel}</button>
    <nav class="app-nav desktop-only">
      <button class="nav-btn sd-back-pill" onclick="${backFn}">← ${backLabel}</button>
      <button class="nav-btn" onclick="globalThis._setTab('portefeuille')">${ICON_GRID}Overzicht</button>
      <button class="nav-btn" onclick="globalThis._setTab('analyse')">${ICON_CHART}Analyse</button>
      <button class="nav-btn" onclick="globalThis._setTab('transacties')">${ICON_LIST}Transacties</button>
    </nav>`;
}

export function renderAppHeader() {
  const tab = state.currentTab;
  const el = document.getElementById('app-header');
  document.querySelectorAll('.settings-btn').forEach(b => b.classList.toggle('on', tab === 'instellingen'));

  let inner;
  if (tab === 'aandeel') {
    inner = detailNav(BACK_LABELS[state.prevTab] || 'Overzicht', 'globalThis._stockDetailBack()');
  } else if (tab === 'bonus') {
    inner = detailNav(BACK_LABELS[state.prevTab] || 'Overzicht', 'globalThis._bonusDetailBack()');
  } else {
    inner = `<nav class="app-nav">
      <button class="nav-btn ${tab === 'portefeuille'  ? 'active' : ''}" onclick="globalThis._setTab('portefeuille')">${ICON_GRID}Overzicht</button>
      <button class="nav-btn ${tab === 'analyse'       ? 'active' : ''}" onclick="globalThis._setTab('analyse')">${ICON_CHART}Analyse</button>
      <button class="nav-btn ${tab === 'transacties'   ? 'active' : ''}" onclick="globalThis._setTab('transacties')">${ICON_LIST}Transacties</button>
    </nav>`;
  }

  if (el) el.innerHTML = `<header class="app-header">${inner}</header>`;
  return '';
}
