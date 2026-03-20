import { state } from '../state.js';

export function renderAppHeader() {
  const tab = state.currentTab;
  const el = document.getElementById('app-header');
  document.querySelectorAll('.settings-btn').forEach(b => b.classList.toggle('on', tab === 'instellingen'));
  if (el) el.innerHTML = `<header class="app-header">
    <nav class="app-nav">
      <button class="nav-btn ${tab === 'portefeuille'  ? 'active' : ''}" onclick="globalThis._setTab('portefeuille')">Overzicht</button>
      <button class="nav-btn ${tab === 'analyse'       ? 'active' : ''}" onclick="globalThis._setTab('analyse')">Analyse</button>
      <button class="nav-btn ${tab === 'transacties'   ? 'active' : ''}" onclick="globalThis._setTab('transacties')">Transacties</button>
    </nav>
  </header>`;
  return '';
}
