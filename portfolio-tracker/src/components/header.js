import { state } from '../state.js';

const BACK_LABELS = { portefeuille: 'Overzicht', analyse: 'Analyse', transacties: 'Transacties', instellingen: 'Instellingen' };

export function renderAppHeader() {
  const tab = state.currentTab;
  const el = document.getElementById('app-header');
  document.querySelectorAll('.settings-btn').forEach(b => b.classList.toggle('on', tab === 'instellingen'));

  let inner;
  if (tab === 'aandeel') {
    const label = BACK_LABELS[state.prevTab] || 'Overzicht';
    inner = `<button class="sd-nav-back" onclick="globalThis._stockDetailBack()">← ${label}</button>`;
  } else if (tab === 'bonus') {
    const label = BACK_LABELS[state.prevTab] || 'Overzicht';
    inner = `<button class="sd-nav-back" onclick="globalThis._bonusDetailBack()">← ${label}</button>`;
  } else {
    inner = `<nav class="app-nav">
      <button class="nav-btn ${tab === 'portefeuille'  ? 'active' : ''}" onclick="globalThis._setTab('portefeuille')">Overzicht</button>
      <button class="nav-btn ${tab === 'analyse'       ? 'active' : ''}" onclick="globalThis._setTab('analyse')">Analyse</button>
      <button class="nav-btn ${tab === 'transacties'   ? 'active' : ''}" onclick="globalThis._setTab('transacties')">Transacties</button>
    </nav>`;
  }

  if (el) el.innerHTML = `<header class="app-header">${inner}</header>`;
  return '';
}
