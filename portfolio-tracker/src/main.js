import 'chartjs-adapter-date-fns';
import './styles/base.css';
import './styles/components.css';
import './styles/themes.css';
import './styles/responsive.css';

import { state } from './state.js';
import { getColor, destroyAllCharts } from './utils.js';
import { fetchTransactions, clearCacheApi, pushToHaApi } from './api.js';
import { loadData } from './data.js';
import { renderApp, renderPortfolioChart } from './tabs/portfolio.js';
import { renderAnalyse, renderAnalyseCharts, sortPos, showPosModal, closePosModal } from './tabs/analyse.js';
import { renderImport, handleCSVFile, updateYahooGuess, saveImport } from './tabs/import.js';
import { renderTransacties, filterTx, deleteTx, saveTxAll } from './tabs/transacties.js';
import { loadIntradayData } from './tabs/intraday.js';
import { renderDonutChart } from './components/donut.js';
import { renderAppHeader } from './components/header.js';

function applyTheme() {
  document.body.classList.toggle('theme-dark', state.currentTheme === 'dark');
}

async function init() {
  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="loading">
      <div style="color:#94a3b8;font-size:13px;margin-bottom:12px">Laden…</div>
      <div class="progress-bar"><div class="progress-fill" style="width:5%"></div></div>
    </div>`;

  try {
    const json = await fetchTransactions();
    if (json.status !== 'ok') throw new Error(json.message);

    if (!json.data || json.data.length === 0) {
      state.RAW_TRANSACTIONS = [];
      state.TICKER_META      = {};
      state.CURRENT_TICKERS  = [];
      renderImport();
      return;
    }

    state.RAW_TRANSACTIONS = json.data;
    await loadData(() => { renderApp(); pushToHA(); });
  } catch (e) {
    document.getElementById('root').innerHTML = `
      ${renderAppHeader()}
      <div class="error-box">
        <div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div>
        <div style="font-size:12px;color:#94a3b8">${e.message}</div>
        <button class="btn" onclick="window._init()" style="margin-top:16px">Opnieuw</button>
      </div>`;
  }
}

function setTab(t) {
  state.currentTab = t;
  if      (t === 'portefeuille') renderApp();
  else if (t === 'analyse')      renderAnalyse();
  else if (t === 'transacties')  renderTransacties();
  else if (t === 'import')       renderImport();
}

function setView(v)          { state.currentView = v; renderApp(); }
function setPeriod(p)        { state.currentPeriod = p; renderApp(); }
function setPeriodAnalyse(p) { state.currentPeriod = p; renderAnalyse(); }
function toggleClosed()      { state.showClosed = !state.showClosed; renderApp(); }

function toggleTheme() {
  state.currentTheme = state.currentTheme === 'dark' ? 'default' : 'dark';
  localStorage.setItem('theme', state.currentTheme);
  applyTheme();
  if      (state.currentTab === 'portefeuille') renderApp();
  else if (state.currentTab === 'analyse')      renderAnalyse();
  else if (state.currentTab === 'transacties')  renderTransacties();
  else if (state.currentTab === 'import')       renderImport();
}

function togglePrivacy() {
  state.privacyMode = !state.privacyMode;
  localStorage.setItem('privacy', state.privacyMode ? '1' : '0');
  document.body.classList.toggle('privacy', state.privacyMode);
  document.querySelectorAll('.privacy-btn').forEach(b => b.classList.toggle('on', state.privacyMode));
  if (state.currentTab === 'portefeuille') {
    destroyAllCharts();
    const visible = state.showClosed ? Object.keys(state.TICKER_META) : state.CURRENT_TICKERS;
    renderPortfolioChart(visible);
  } else if (state.currentTab === 'analyse') {
    destroyAllCharts();
    renderAnalyseCharts();
  }
}

async function clearCache() {
  try { await clearCacheApi(); await init(); }
  catch (e) { alert('Cache clear mislukt: ' + e.message); }
}

async function pushToHA() {
  const btn = document.getElementById('haPushBtn');
  if (btn) { btn.textContent = '…'; }
  try {
    const json = await pushToHaApi();
    if (!json.ok) throw new Error(json.error || 'push failed');
    if (btn) { btn.textContent = '✓'; btn.style.color = '#16a34a'; setTimeout(() => { btn.textContent = 'HA'; btn.style.color = ''; }, 3000); }
  } catch (e) {
    console.warn('[HA push]', e.message);
    if (btn) { btn.textContent = 'HA'; btn.style.color = ''; }
  }
}

function refreshIntraday() { loadIntradayData(true); }

// Expose all functions referenced by inline onclick= handlers
window._init             = init;
window._setTab           = setTab;
window._setView          = setView;
window._setPeriod        = setPeriod;
window._setPeriodAnalyse = setPeriodAnalyse;
window._toggleClosed     = toggleClosed;
window._toggleTheme      = toggleTheme;
window._togglePrivacy    = togglePrivacy;
window._clearCache       = clearCache;
window._pushToHA         = pushToHA;
window._refreshIntraday  = refreshIntraday;
window._handleCSVFile    = handleCSVFile;
window._updateYahooGuess = updateYahooGuess;
window._saveImport       = saveImport;
window._getColor         = getColor;
window._sortPos          = sortPos;
window._showPosModal     = showPosModal;
window._closePosModal    = closePosModal;
window._filterTx         = filterTx;
window._deleteTx         = deleteTx;
window._saveTxAll        = saveTxAll;

// Boot
document.body.classList.toggle('privacy', state.privacyMode);
applyTheme();
init();
