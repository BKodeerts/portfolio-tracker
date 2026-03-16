import { state } from '../state.js';

export function renderAppHeader() {
  const tab = state.currentTab;
  return `<header class="app-header">
    <nav class="app-nav">
      <button class="nav-btn ${tab === 'portefeuille'  ? 'active' : ''}" onclick="window._setTab('portefeuille')">Overzicht</button>
      <button class="nav-btn ${tab === 'analyse'       ? 'active' : ''}" onclick="window._setTab('analyse')">Analyse</button>
      <button class="nav-btn ${tab === 'transacties'   ? 'active' : ''}" onclick="window._setTab('transacties')">Transacties</button>
      <button class="nav-btn ${tab === 'import'        ? 'active' : ''}" onclick="window._setTab('import')">Import</button>
    </nav>
    <button class="privacy-btn ${state.currentTheme === 'dark' ? 'on' : ''}" onclick="window._toggleTheme()" title="Thema wisselen" style="margin-left:auto">◑</button>
    <button class="privacy-btn" id="haPushBtn" onclick="window._pushToHA()" title="Stuur naar Home Assistant" style="font-size:11px;letter-spacing:0">HA</button>
    <button class="privacy-btn ${state.privacyMode ? 'on' : ''}" onclick="window._togglePrivacy()" title="Privacy mode">👁</button>
  </header>`;
}
