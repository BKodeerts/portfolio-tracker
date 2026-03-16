import { state } from './state.js';
import { SERVER_BASE } from './constants.js';
import { getColor } from './utils.js';
import { renderAppHeader } from './components/header.js';

export async function loadData(onSuccess) {
  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="loading">
      <div style="color:#94a3b8;font-size:13px;margin-bottom:12px">Portefeuille berekenen…</div>
      <div class="progress-bar"><div class="progress-fill" style="width:15%"></div></div>
    </div>`;

  try {
    const res  = await fetch(`${SERVER_BASE}/api/portfolio`);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message || 'Server error');
    if (!json.data) throw new Error('Geen portfoliodata ontvangen');

    state.chartData      = json.data.chartData;
    state.benchmarkData  = json.data.benchmarkData;
    state.TICKER_META    = json.data.meta;
    state.CURRENT_TICKERS = json.data.currentTickers;
    state.latestFxRate   = json.data.latestFxRate;

    Object.keys(state.TICKER_META).forEach(t => getColor(t));
    onSuccess();
  } catch (e) {
    document.getElementById('root').innerHTML = `
      ${renderAppHeader()}
      <div class="error-box">
        <div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.6">${e.message}</div>
        <button class="btn" onclick="window._init()" style="margin-top:16px">Opnieuw proberen</button>
      </div>`;
  }
}
