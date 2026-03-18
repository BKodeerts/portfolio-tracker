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
import { renderAnalyse, renderAnalyseCharts, sortPos, showPosModal, closePosModal, saveTickerMetaUI, resetSectorsUI, setBreakdownTab, setBenchmark } from './tabs/analyse.js';
import { renderImport, handleCSVFile, updateYahooGuess, saveImport, saveTickerRenames } from './tabs/import.js';
import { renderTransacties, filterTx, deleteTx, saveTxAll, toggleAddTx, addManualTx } from './tabs/transacties.js';
import { loadIntradayData } from './tabs/intraday.js';
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

function setTab(t) {
  state.currentTab = t;
  if      (t === 'portefeuille') renderApp();
  else if (t === 'analyse')      renderAnalyse();
  else if (t === 'transacties')  renderTransacties();
  else if (t === 'import')       renderImport();
}

function renderAppKeepScroll() { const y = globalThis.scrollY; renderApp(); globalThis.scrollTo(0, y); }
function setView(v)          { state.currentView = v; renderAppKeepScroll(); }
function setPeriod(p)        { state.currentPeriod = p; renderAppKeepScroll(); }
function setPeriodAnalyse(p) { const y = globalThis.scrollY; state.analysePeriod = p; renderAnalyse(); globalThis.scrollTo(0, y); }
function toggleClosed()      { state.showClosed = !state.showClosed; renderAppKeepScroll(); }

function toggleTheme() {
  state.currentTheme = state.currentTheme === 'dark' ? 'default' : 'dark';
  localStorage.setItem('theme', state.currentTheme);
  applyTheme();
  if      (state.currentTab === 'portefeuille') renderAppKeepScroll();
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

function refreshIntraday() {
  loadIntradayData(true, () => {
    if (state.currentPeriod === '1d' && state.currentTab === 'portefeuille') {
      destroyAllCharts();
      const visible = state.showClosed ? Object.keys(state.TICKER_META) : state.CURRENT_TICKERS;
      renderPortfolioChart(visible);
    }
  });
}

// Expose all functions referenced by inline onclick= handlers
globalThis._init             = init;
globalThis._setTab           = setTab;
globalThis._setView          = setView;
globalThis._setPeriod        = setPeriod;
globalThis._setPeriodAnalyse = setPeriodAnalyse;
globalThis._toggleClosed     = toggleClosed;
globalThis._toggleTheme      = toggleTheme;
globalThis._togglePrivacy    = togglePrivacy;
globalThis._clearCache       = clearCache;
globalThis._refreshIntraday  = refreshIntraday;
globalThis._handleCSVFile    = handleCSVFile;
globalThis._updateYahooGuess = updateYahooGuess;
globalThis._saveImport       = saveImport;
globalThis._getColor         = getColor;
globalThis._sortPos          = sortPos;
globalThis._showPosModal     = showPosModal;
globalThis._closePosModal    = closePosModal;
globalThis._filterTx         = filterTx;
globalThis._deleteTx         = deleteTx;
globalThis._saveTxAll           = saveTxAll;
globalThis._toggleAddTx         = toggleAddTx;
globalThis._addManualTx         = addManualTx;
globalThis._saveTickerRenames   = saveTickerRenames;
globalThis._saveTickerMetaUI    = saveTickerMetaUI;
globalThis._resetSectorsUI      = resetSectorsUI;
globalThis._setBreakdownTab     = setBreakdownTab;
globalThis._setBenchmark        = setBenchmark;

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

// Boot
document.body.classList.toggle('privacy', state.privacyMode);
applyTheme();
init();
