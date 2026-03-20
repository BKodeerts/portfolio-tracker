import { state } from './state.js';
import { SERVER_BASE } from './constants.js';
import { getColor } from './utils.js';
import { renderAppHeader } from './components/header.js';

export async function loadData(onSuccess) {
  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="loading">
      <div style="color:#94a3b8;font-size:13px;margin-bottom:12px">Portefeuille berekenen…</div>
      <div class="progress-bar"><div class="progress-fill" id="loadProgressFill" style="width:5%"></div></div>
    </div>`;

  // Animate progress bar while waiting (5% → 85% over ~25s, then held)
  let pct = 5;
  const progressTimer = setInterval(() => {
    pct = Math.min(85, pct + (85 - pct) * 0.07);
    const el = document.getElementById('loadProgressFill');
    if (el) el.style.width = `${pct.toFixed(1)}%`;
  }, 600);

  try {
    const [portfolioRes, metaRes] = await Promise.all([
      fetch(`${SERVER_BASE}/api/portfolio`),
      fetch(`${SERVER_BASE}/api/ticker-meta`),
    ]);
    clearInterval(progressTimer);
    const fillEl = document.getElementById('loadProgressFill');
    if (fillEl) fillEl.style.width = '100%';

    const json     = await portfolioRes.json();
    const metaJson = await metaRes.json();

    if (json.status !== 'ok') throw new Error(json.message || 'Server error');
    if (!json.data) throw new Error('Geen portfoliodata ontvangen');

    const d = json.data;
    state.chartData           = d.chartData;
    state.benchmarkData       = d.benchmarkData;
    state.sp500Data           = d.sp500Data ?? [];
    state.TICKER_META         = d.meta;
    state.CURRENT_TICKERS     = d.currentTickers;
    state.latestFxRate        = d.latestFxRate;
    state.riskMetrics         = d.riskMetrics         ?? null;
    state.rollingReturns      = d.rollingReturns      ?? null;
    state.realizedPl          = d.realizedPl          ?? 0;
    state.realizedPlPerTicker = d.realizedPlPerTicker ?? {};
    state.totalInvested       = d.totalInvested       ?? 0;
    state.totalDividends      = d.totalDividends      ?? 0;
    state.dividendsPerTicker  = d.dividendsPerTicker  ?? {};
    state.annualPl            = d.annualPl            ?? [];
    state.watchlistData       = d.watchlistData       ?? [];
    state.usdExposurePct      = d.usdExposurePct      ?? 0;
    state.currencyExposure    = d.currencyExposure    ?? {};
    state.baseCurrency        = d.baseCurrency        ?? 'EUR';
    state.twrPct              = d.twrPct              ?? null;
    state.irrPct              = d.irrPct              ?? null;

    // Per-position 52w data — store on TICKER_META for use in Analyse tab
    if (d.positions) {
      for (const pos of d.positions) {
        if (state.TICKER_META[pos.ticker]) {
          state.TICKER_META[pos.ticker].high52 = pos.high52;
          state.TICKER_META[pos.ticker].low52  = pos.low52;
          state.TICKER_META[pos.ticker].pe     = pos.pe;
        }
      }
    }

    state.tickerMeta = metaJson.status === 'ok' ? (metaJson.data ?? {}) : {};

    Object.keys(state.TICKER_META).forEach(t => getColor(t));
    onSuccess();
  } catch (e) {
    clearInterval(progressTimer);
    document.getElementById('root').innerHTML = `
      ${renderAppHeader()}
      <div class="error-box">
        <div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.6">${e.message}</div>
        <button class="btn" onclick="window._init()" style="margin-top:16px">Opnieuw proberen</button>
      </div>`;
  }
}
