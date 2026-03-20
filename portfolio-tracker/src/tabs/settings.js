import { state } from '../state.js';
import { fetchSettings, saveSettings } from '../api.js';
import { renderAppHeader } from '../components/header.js';
import { destroyAllCharts } from '../utils.js';
import { SUPPORTED_CURRENCIES } from '../constants.js';

// ── Local state while the tab is open ─────────────────────────────────────────
let _baseCurrency              = 'EUR';
let _watchlist                 = [];
let _intradayDuringMarketHours = false;
let _pushInterval              = 15;
let _ppMode          = 'none';  // 'none' | 'all' | 'select' — explicit, not inferred
let _selectedTickers = [];      // tickers checked when _ppMode === 'select'
let _loading         = false;

// ── Watchlist helpers ──────────────────────────────────────────────────────────
function renderWatchlistItems() {
  const container = document.getElementById('watchlistItems');
  if (!container) return;
  if (_watchlist.length === 0) {
    container.innerHTML = `<div class="c-neutral" style="font-size:12px;padding:8px 0">Geen symbolen toegevoegd.</div>`;
    return;
  }
  container.innerHTML = _watchlist.map((sym, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'JetBrains Mono',monospace;font-size:13px;flex:1">${sym}</span>
      <button class="btn" style="padding:3px 10px;font-size:11px" onclick="globalThis._removeWatchlistItem(${i})">Verwijder</button>
    </div>`).join('');
}

function addWatchlistItem() {
  const input = document.getElementById('watchlistInput');
  if (!input) return;
  const sym = input.value.trim().toUpperCase();
  if (!sym || _watchlist.includes(sym)) { input.value = ''; return; }
  _watchlist.push(sym);
  input.value = '';
  renderWatchlistItems();
}

function removeWatchlistItem(i) {
  _watchlist.splice(i, 1);
  renderWatchlistItems();
}

// ── Push-positions helpers ─────────────────────────────────────────────────────
function renderPushPositions() {
  const container = document.getElementById('pushPositionsSection');
  if (!container) return;

  const tickers = state.CURRENT_TICKERS ?? [];

  const tickerRows = _ppMode === 'select' && tickers.length > 0
    ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
        ${tickers.map(t => {
          const label   = state.TICKER_META?.[t]?.label || t;
          const checked = _selectedTickers.includes(t) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
            <input type="checkbox" value="${t}" ${checked}
              onchange="globalThis._togglePushTicker('${t}', this.checked)">
            <span style="font-family:'JetBrains Mono',monospace">${t}</span>
            <span class="c-neutral">${label === t ? '' : label}</span>
          </label>`;
        }).join('')}
      </div>`
    : '';

  const labels = { none: 'Geen positie sensors', all: 'Alle posities', select: 'Handmatig kiezen' };
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${['none','all','select'].map(m => `
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
          <input type="radio" name="ppMode" value="${m}" ${_ppMode === m ? 'checked' : ''}
            onchange="globalThis._setPpMode('${m}')">
          ${labels[m]}
        </label>`).join('')}
    </div>
    ${tickerRows}
    ${_ppMode === 'select' && tickers.length === 0
      ? '<p class="c-neutral" style="font-size:12px;margin-top:8px">Geen open posities gevonden.</p>'
      : ''}`;
}

function setPpMode(m) {
  _ppMode = m;
  if (m !== 'select') _selectedTickers = [];
  renderPushPositions();
}

function togglePushTicker(ticker, checked) {
  if (checked) {
    if (!_selectedTickers.includes(ticker)) _selectedTickers.push(ticker);
  } else {
    _selectedTickers = _selectedTickers.filter(t => t !== ticker);
  }
}

function buildPushPositions() {
  if (_ppMode === 'all')    return ['*'];
  if (_ppMode === 'select') return _selectedTickers;
  return [];
}

// ── Save ───────────────────────────────────────────────────────────────────────
async function doSaveSettings() {
  if (_loading) return;
  _loading = true;
  const btn = document.getElementById('settingsSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Opslaan…'; }

  try {
    const result = await saveSettings({
      baseCurrency:              _baseCurrency,
      watchlist:                 _watchlist,
      intradayDuringMarketHours: _intradayDuringMarketHours,
      pushInterval:              _pushInterval,
      pushPositions:             buildPushPositions(),
    });
    if (result.status !== 'ok') throw new Error(result.message ?? 'Onbekende fout');
    state.baseCurrency = _baseCurrency;
    globalThis._init();
  } catch (e) {
    alert('Opslaan mislukt: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Opslaan'; }
    _loading = false;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────────
export async function renderSettings() {
  destroyAllCharts();
  state.currentTab = 'instellingen';
  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="import-wrap">
      <div style="display:flex;align-items:center;justify-content:center;padding:32px 0;color:#94a3b8;font-size:13px">Laden…</div>
    </div>`;

  try {
    const res = await fetchSettings();
    if (res.status !== 'ok') throw new Error(res.message ?? 'Laden mislukt');
    const d = res.data;
    _baseCurrency              = d.baseCurrency              ?? 'EUR';
    _watchlist                 = [...(d.watchlist            ?? [])];
    _intradayDuringMarketHours = d.intradayDuringMarketHours ?? false;
    _pushInterval              = d.pushInterval              ?? 15;
    const pp = Array.isArray(d.pushPositions) ? d.pushPositions : [];
    if (pp.includes('*'))   { _ppMode = 'all';    _selectedTickers = []; }
    else if (pp.length > 0) { _ppMode = 'select'; _selectedTickers = [...pp]; }
    else                    { _ppMode = 'none';   _selectedTickers = []; }
  } catch {
    _baseCurrency  = state.baseCurrency ?? 'EUR';
    _watchlist     = [...(state.watchlistData?.map(d => d.symbol) ?? [])];
  }

  const currencyOptions = SUPPORTED_CURRENCIES
    .map(c => `<option value="${c}" ${c === _baseCurrency ? 'selected' : ''}>${c}</option>`)
    .join('');

  const field = (label, content) => `
    <div style="display:grid;grid-template-columns:180px 1fr;align-items:start;gap:8px 16px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--text-muted);padding-top:2px">${label}</span>
      <div>${content}</div>
    </div>`;

  const inp = (id, val, type = 'number', extra = '') =>
    `<input id="${id}" type="${type}" value="${val}" ${extra}
      style="font-size:13px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);width:80px">`;

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="import-wrap">

      <section style="margin-bottom:32px">
        <h3 style="font-size:13px;font-weight:600;margin:0 0 2px">App</h3>
        <p class="c-neutral" style="font-size:12px;margin:0 0 12px">Algemene voorkeuren.</p>

        ${field('Basisvaluta',
          `<select id="settingsCurrency" style="font-size:13px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text)"
            onchange="globalThis._onCurrencyChange(this.value)">${currencyOptions}</select>`)}

        ${field('Thema',
          `<div style="display:flex;gap:20px">
            ${[['light','Licht'],['dark','Donker'],['system','Systeem']].map(([val, lbl]) => `
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
                <input type="radio" name="theme" value="${val}" ${state.currentTheme === val ? 'checked' : ''}
                  onchange="globalThis._setTheme('${val}')">
                ${lbl}
              </label>`).join('')}
          </div>`)}

        ${field('Intraday alleen tijdens markturen',
          `<label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="settingsIntraday" ${_intradayDuringMarketHours ? 'checked' : ''}
              onchange="globalThis._onIntradayChange(this.checked)">
            <span class="c-neutral" style="font-size:12px">Intraday data alleen ophalen als de markt open is</span>
          </label>`)}
      </section>

      <section style="margin-bottom:32px">
        <h3 style="font-size:13px;font-weight:600;margin:0 0 2px">Watchlist</h3>
        <p class="c-neutral" style="font-size:12px;margin:0 0 12px">
          Yahoo Finance-symbolen om te volgen naast je posities (bijv. <em>AAPL</em>, <em>BTC-USD</em>).
        </p>
        <div id="watchlistItems"></div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="watchlistInput" placeholder="Symbool (bijv. AAPL)"
            style="flex:1;font-size:13px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:'JetBrains Mono',monospace;text-transform:uppercase"
            onkeydown="if(event.key==='Enter') globalThis._addWatchlistItem()">
          <button class="btn" onclick="globalThis._addWatchlistItem()">Toevoegen</button>
        </div>
      </section>

      <section style="margin-bottom:32px">
        <h3 style="font-size:13px;font-weight:600;margin:0 0 2px">Home Assistant</h3>
        <p class="c-neutral" style="font-size:12px;margin:0 0 12px">
          Alleen van toepassing bij gebruik als HA add-on met sensoren ingeschakeld.
        </p>

        ${field('Push-interval',
          `<div style="display:flex;align-items:center;gap:8px">
            ${inp('settingsPushInterval', _pushInterval, 'number', 'min="1" max="60" onchange="globalThis._onPushIntervalChange(+this.value)"')}
            <span class="c-neutral" style="font-size:12px">minuten</span>
          </div>`)}

${field('Positie sensors',
          `<div id="pushPositionsSection"></div>`)}
      </section>

      <div class="import-actions">
        <button class="btn success" id="settingsSaveBtn" onclick="globalThis._saveSettings()">Opslaan</button>
      </div>
    </div>`;

  renderWatchlistItems();
  renderPushPositions();
}

// ── Expose handlers ────────────────────────────────────────────────────────────
globalThis._addWatchlistItem    = addWatchlistItem;
globalThis._removeWatchlistItem = removeWatchlistItem;
globalThis._onCurrencyChange    = v => { _baseCurrency = v; };
globalThis._onIntradayChange    = v => { _intradayDuringMarketHours = v; };
globalThis._onPushIntervalChange = v => { _pushInterval = Math.max(1, Math.min(60, v || 15)); };
globalThis._setPpMode           = setPpMode;
globalThis._togglePushTicker    = togglePushTicker;
globalThis._saveSettings        = doSaveSettings;
