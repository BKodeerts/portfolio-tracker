import 'chartjs-adapter-date-fns';
import Chart from 'chart.js/auto';
import './styles/base.css';
import './styles/components.css';
import './styles/themes.css';
import './styles/responsive.css';

import { state } from './state.js';
import { getColor, destroyAllCharts } from './utils.js';
import { fetchTransactions, clearCacheApi } from './api.js';
import { loadData } from './data.js';
import { renderApp, renderPortfolioChart } from './tabs/portfolio.js';
import { renderAnalyse, renderAnalyseCharts, sortPos, saveTickerMetaUI, resetSectorsUI, setBreakdownTab, setBenchmark, exportPositionsCsv, exportTransactionsCsv } from './tabs/analyse.js';
import { renderStockDetail, setStockDetailPeriod } from './tabs/stock-detail.js';
import { renderBonusDetail, setBonusDetailShowPrior } from './tabs/bonus-detail.js';
import { handleCSVFile, updateYahooGuess, saveImport, saveTickerRenames } from './tabs/import.js';
import { renderTransacties, filterTx, deleteTx, saveTxAll, toggleAddTx, addManualTx, onAddTypeChange } from './tabs/transacties.js';
import { renderSettings } from './tabs/settings.js';
import { loadIntradayData, isExchangeOpen } from './tabs/intraday.js';
import { renderAppHeader } from './components/header.js';

const _systemMq = globalThis.matchMedia('(prefers-color-scheme: dark)');
let   _systemMqListener = null;

function applyTheme() {
  const dark = state.currentTheme === 'dark' ||
               (state.currentTheme === 'system' && _systemMq.matches);
  document.body.classList.toggle('theme-dark', dark);
}

function syncSystemListener() {
  if (_systemMqListener) {
    _systemMq.removeEventListener('change', _systemMqListener);
    _systemMqListener = null;
  }
  if (state.currentTheme === 'system') {
    _systemMqListener = () => applyTheme();
    _systemMq.addEventListener('change', _systemMqListener);
  }
}

function setTheme(t) {
  state.currentTheme = t;
  localStorage.setItem('theme', t);
  applyTheme();
  syncSystemListener();
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
      renderTransacties();
      return;
    }

    state.RAW_TRANSACTIONS = json.data;
    await loadData(() => { renderApp(); });
  } catch (e) {
    document.getElementById('root').innerHTML = `
      ${renderAppHeader()}
      <div class="error-box">
        <div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div>
        <div style="font-size:12px;color:#94a3b8">${e.message}</div>
        <button class="btn" onclick="globalThis._init()" style="margin-top:16px">Opnieuw</button>
      </div>`;
  }
}

// ── Navigation history (browser-native back/forward) ──────────────────────
// _applyTab renders the given tab without touching browser history.
// setTab / navigateToStock push a history entry so the browser's own
// back/forward gestures work.  The popstate handler calls _applyTab so
// the in-app state stays in sync.  A guard at the bottom of popstate
// prevents the user from accidentally leaving the app.

function _applyTab(t, id) {
  state.currentTab = t;
  if (t === 'aandeel' && id !== undefined) state.selectedTicker  = id;
  if (t === 'bonus'   && id !== undefined) state.selectedBonusId = id;
  if      (t === 'portefeuille') renderApp();
  else if (t === 'analyse')      renderAnalyse();
  else if (t === 'transacties')  renderTransacties();
  else if (t === 'import')       renderTransacties();
  else if (t === 'instellingen') renderSettings();
  else if (t === 'aandeel')      renderStockDetail();
  else if (t === 'bonus')        renderBonusDetail();
}

function setTab(t) {
  if (state.currentTab !== t) {
    history.pushState({ _ptab: true, tab: t, ticker: null }, '');
  }
  _applyTab(t);
}

function navigateToStock(ticker) {
  state.prevTab = state.currentTab;
  history.pushState({ _ptab: true, tab: 'aandeel', ticker }, '');
  _applyTab('aandeel', ticker);
}

function stockDetailBack() { history.back(); }
function bonusDetailBack() { history.back(); }

function navigateToBonusDetail(id) {
  state.prevTab = state.currentTab;
  history.pushState({ _ptab: true, tab: 'bonus', bonusId: id }, '');
  _applyTab('bonus', id);
}

function renderAppKeepScroll() { const y = globalThis.scrollY; renderApp(); globalThis.scrollTo(0, y); }
function setView(v)          { state.currentView = v; renderAppKeepScroll(); }
function setPeriod(p)        { state.currentPeriod = p; renderAppKeepScroll(); }
function setPeriodAnalyse(p) { const y = globalThis.scrollY; state.analysePeriod = p; renderAnalyse(); globalThis.scrollTo(0, y); }
function toggleClosed()      { state.showClosed = !state.showClosed; renderAppKeepScroll(); }


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

function refreshIntraday() {
  loadIntradayData(true, () => {
    if (state.currentPeriod === '1d' && state.currentTab === 'portefeuille') {
      destroyAllCharts();
      const visible = state.showClosed ? Object.keys(state.TICKER_META) : state.CURRENT_TICKERS;
      renderPortfolioChart(visible);
    }
  });
}

// Auto-refresh intraday data every 5 minutes when any held stock's exchange is open
let _autoRefreshTimer = null;
function startAutoRefresh() {
  if (_autoRefreshTimer) return;
  _autoRefreshTimer = setInterval(() => {
    const anyOpen = (state.CURRENT_TICKERS || []).some(t => {
      const yahoo = state.TICKER_META?.[t]?.yahoo;
      return yahoo && isExchangeOpen(yahoo);
    });
    if (anyOpen) refreshIntraday();
  }, 5 * 60 * 1000);
}

// Expose all functions referenced by inline onclick= handlers
globalThis._init             = init;
globalThis._setTab           = setTab;
globalThis._setView          = setView;
globalThis._setPeriod        = setPeriod;
globalThis._setPeriodAnalyse = setPeriodAnalyse;
globalThis._toggleClosed     = toggleClosed;
globalThis._setTheme         = setTheme;
globalThis._togglePrivacy    = togglePrivacy;
globalThis._handleCSVFile    = handleCSVFile;
globalThis._updateYahooGuess = updateYahooGuess;
globalThis._saveImport       = saveImport;
globalThis._getColor         = getColor;
globalThis._sortPos          = sortPos;
globalThis._navigateToStock          = navigateToStock;
globalThis._stockDetailBack          = stockDetailBack;
globalThis._setStockDetailPeriod     = setStockDetailPeriod;
globalThis._navigateToBonusDetail    = navigateToBonusDetail;
globalThis._bonusDetailBack          = bonusDetailBack;
globalThis._setBonusDetailPrior      = setBonusDetailShowPrior;
globalThis._filterTx         = filterTx;
globalThis._deleteTx         = deleteTx;
globalThis._saveTxAll           = saveTxAll;
globalThis._toggleAddTx         = toggleAddTx;
globalThis._addManualTx         = addManualTx;
globalThis._saveTickerRenames   = saveTickerRenames;
globalThis._onAddTypeChange     = onAddTypeChange;
globalThis._saveTickerMetaUI    = saveTickerMetaUI;
globalThis._resetSectorsUI      = resetSectorsUI;
globalThis._setBreakdownTab     = setBreakdownTab;
globalThis._setBenchmark            = setBenchmark;
globalThis._exportPositionsCsv      = exportPositionsCsv;
globalThis._exportTransactionsCsv   = exportTransactionsCsv;

// Dismiss chart tooltips on mobile when finger lifts (works for all canvases).
// rAF defers until after Chart.js finishes its own touch handling.
document.addEventListener('touchend', e => {
  const canvas = e.target.closest('canvas');
  if (!canvas) return;
  const chart = Chart.getChart(canvas);
  if (!chart) return;
  requestAnimationFrame(() => {
    chart.tooltip.setActiveElements([], {});
    chart.update('none');
  });
}, { passive: true });


// Seed the history stack so the initial tab has a state entry.
// This ensures popstate always receives our {_ptab} object.
history.replaceState({ _ptab: true, tab: 'portefeuille', ticker: null }, '');

// Browser back/forward — restore in-app tab without pushing a new entry.
// If the user pops past the app's first entry (state is null / foreign),
// push the current state back immediately so they stay in the app.
window.addEventListener('popstate', e => {
  if (e.state?._ptab) {
    _applyTab(e.state.tab, e.state.ticker ?? e.state.bonusId);
  } else {
    history.pushState({ _ptab: true, tab: state.currentTab, ticker: state.selectedTicker }, '');
  }
});

// Boot
document.body.classList.toggle('privacy', state.privacyMode);
document.querySelectorAll('.privacy-btn').forEach(b => b.classList.toggle('on', state.privacyMode));
applyTheme();
syncSystemListener();
init().then(() => startAutoRefresh());
