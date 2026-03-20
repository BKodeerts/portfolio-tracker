import { state } from '../state.js';
import { getColor, destroyAllCharts } from '../utils.js';
import { saveTransactions } from '../api.js';
import { renderAppHeader } from '../components/header.js';
import { initBonus } from './bonus.js';
import { buildTickerRows } from './import.js';

let txSearchVal   = '';
let addTxVisible  = false;
let _importOpen   = false;

function addTxForm() {
  const today = new Date().toISOString().split('T')[0];
  return `
    <div id="addTxForm" class="tx-add-form" style="display:${addTxVisible ? 'block' : 'none'}">
      <div class="tx-add-form-fields">
        <div class="tx-add-form-field"><label>Type *</label>
          <select id="addType" style="width:100px" onchange="window._onAddTypeChange(this.value)">
            <option value="buy">Koop</option>
            <option value="sell">Verkoop</option>
            <option value="dividend">Dividend</option>
          </select>
        </div>
        <div class="tx-add-form-field"><label>Datum *</label><input id="addDate" type="date" value="${today}" style="width:130px"></div>
        <div class="tx-add-form-field"><label>Ticker *</label><input id="addTicker" type="text" placeholder="GOOGL" style="width:72px;text-transform:uppercase"></div>
        <div class="tx-add-form-field"><label>Yahoo *</label><input id="addYahoo" type="text" placeholder="GOOGL" style="width:90px"></div>
        <div class="tx-add-form-field"><label>Naam</label><input id="addLabel" type="text" placeholder="Alphabet Inc." style="width:140px"></div>
        <div class="tx-add-form-field"><label>ISIN</label><input id="addIsin" type="text" placeholder="optioneel" style="width:110px"></div>
        <div class="tx-add-form-field" id="addSharesField"><label>Aandelen *</label><input id="addShares" type="number" step="any" placeholder="10" style="width:80px"></div>
        <div class="tx-add-form-field"><label id="addCostLabel">Kosten € *</label><input id="addCostEur" type="number" step="any" min="0" placeholder="1234.56" style="width:92px"></div>
        <div class="tx-add-form-field"><label>Munt</label>
          <select id="addCurrency" style="width:64px">
            ${['EUR','USD','GBP','GBX','CLP','CHF','SEK','DKK','NOK','CAD','AUD','JPY','MXN','BRL'].map(c =>
              `<option value="${c}">${c}</option>`
            ).join('')}
          </select>
        </div>
        <div class="tx-add-form-field" style="justify-content:flex-end">
          <div style="display:flex;gap:6px">
            <button class="btn success" onclick="window._addManualTx()">Toevoegen</button>
            <button class="btn" onclick="window._toggleAddTx()">Annuleren</button>
          </div>
        </div>
      </div>
    </div>`;
}

function importSection() {
  const txCount   = state.RAW_TRANSACTIONS.length;
  const dateRange = txCount > 0
    ? `${state.RAW_TRANSACTIONS[0].date} → ${state.RAW_TRANSACTIONS.at(-1).date}`
    : '—';

  const tickerRenameBlock = txCount > 0 ? `
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--border)">
      <h3 style="font-size:13px;margin:0 0 4px;font-weight:600">Tickers hernoemen</h3>
      <p class="c-neutral" style="font-size:12px;margin-bottom:8px;line-height:1.5">
        Wijzig ticker of Yahoo-symbool. Wordt toegepast op alle bijbehorende transacties.
      </p>
      <table class="map-table">
        <thead><tr><th>Ticker</th><th>Yahoo symbool</th><th>Label</th><th>#</th></tr></thead>
        <tbody>${buildTickerRows()}</tbody>
      </table>
      <div class="import-actions" style="margin-top:8px">
        <button class="btn success" onclick="window._saveTickerRenames()">Tickers opslaan</button>
      </div>
    </div>` : '';

  return `
    <div style="margin-top:28px;border-top:1px solid var(--border);padding-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${_importOpen ? '14px' : '0'}">
        <h3 style="font-size:13px;font-weight:600;margin:0">Importeren</h3>
        <button class="btn" style="font-size:11px;padding:4px 10px" onclick="globalThis._toggleImportSection()">
          ${_importOpen ? 'Inklappen ↑' : 'Uitklappen ↓'}
        </button>
      </div>
      <div id="importSectionBody" style="display:${_importOpen ? 'block' : 'none'}">
        <div class="import-info">
          <strong>${txCount} transacties opgeslagen</strong>${txCount > 0 ? ` · ${dateRange}` : ''}<br>
          Upload een DeGiro <em>Transacties.csv</em> of Bolero <em>portfolio_…xlsx</em>. Bestaande data kun je behouden of vervangen.
        </div>
        <div class="drop-zone" id="dropZone"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="event.preventDefault();this.classList.remove('drag-over');window._handleCSVFile(event.dataTransfer.files[0])">
          <strong>Sleep bestand hierheen</strong>
          <p>of <label for="csvInput">klik om te bladeren</label></p>
          <input type="file" id="csvInput" accept=".csv,.xlsx,text/csv,text/plain" style="display:none" onchange="window._handleCSVFile(this.files[0])">
        </div>
        <div id="mappingSection" style="display:none"></div>
        ${tickerRenameBlock}
      </div>
    </div>`;
}

export function renderTransacties() {
  destroyAllCharts();
  state.currentTab = 'transacties';
  const noTx = state.RAW_TRANSACTIONS.length === 0;
  if (noTx) _importOpen = true;
  initBonus();

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="tx-wrap">
      ${noTx ? '' : `
      <div class="tx-toolbar">
        <input class="tx-search" id="txSearch" type="text" placeholder="Zoeken op ticker, datum…"
          value="${txSearchVal}" oninput="window._filterTx(this.value)">
        <button class="btn" onclick="window._toggleAddTx()">+ Transactie</button>
        <button class="btn" onclick="globalThis._openBonusEdit(null)">+ Bonus</button>
        <button class="btn" onclick="window._saveTxAll()">Opslaan</button>
      </div>
      ${addTxForm()}
      <div id="txTableWrap">${buildTxTable()}</div>
      <div class="tx-save-bar">
        <span style="font-size:11px;color:#888">${state.RAW_TRANSACTIONS.length} transacties</span>
        <button class="btn" onclick="window._saveTxAll()">Opslaan</button>
      </div>
      `}
      ${importSection()}
    </div>`;
}

function buildTxTable() {
  const q = txSearchVal.toLowerCase();
  const rows = state.RAW_TRANSACTIONS
    .map((t, i) => ({ ...t, _origIdx: i }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(t => {
      const match = !q || t.ticker.toLowerCase().includes(q) || t.date.includes(q) || (t.label || '').toLowerCase().includes(q);
      const isDividendTx = t.type === 'dividend';
      const isSale = !isDividendTx && t.shares < 0;
      let sharesColor = '#16a34a';
      if (isDividendTx) sharesColor = '#f59e0b';
      else if (isSale)  sharesColor = '#ef4444';
      const sharesDisplay = isDividendTx
        ? '<span style="font-size:10px;background:#f59e0b22;color:#f59e0b;padding:1px 5px;border-radius:3px;font-weight:600">DIV</span>'
        : `<span class="tx-cell" contenteditable="true" data-field="shares" inputmode="decimal">${t.shares}</span>`;
      return `<tr data-idx="${t._origIdx}"${match ? '' : ' style="display:none"'}>
        <td class="tx-col-date"><span class="tx-cell" contenteditable="true" data-field="date" inputmode="text">${t.date}</span></td>
        <td class="tx-col-name-group">
          <div class="tx-name-top"><span class="tx-dot" style="background:${getColor(t.ticker)}"></span><span class="tx-name-ticker">${t.ticker}</span></div>
          <div class="tx-name-sub">${t.label || ''}</div>
        </td>
        <td class="tx-col-shares" style="color:${sharesColor}">
          ${sharesDisplay}
        </td>
        <td class="tx-col-cost"><span class="tx-cell" contenteditable="true" data-field="costEur" inputmode="decimal">${Number.parseFloat(t.costEur).toFixed(2)}</span></td>
        <td class="tx-col-ccy">
          <select class="tx-ccy" data-field="currency">
            ${['EUR','USD','GBP','GBX','CLP','CHF','SEK','DKK','NOK','CAD','AUD','JPY','MXN','BRL'].map(c =>
              `<option value="${c}"${t.currency === c ? ' selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </td>
        <td class="tx-col-note"><span class="tx-cell" contenteditable="true" data-field="note" inputmode="text">${t.note || ''}</span></td>
        <td class="tx-col-del"><button class="tx-del-btn" onclick="window._deleteTx(${t._origIdx})" title="Verwijder">🗑</button></td>
      </tr>`;
    }).join('');

  return `<table class="tx-table">
    <thead><tr>
      <th>Datum</th><th>Ticker / Naam</th><th>Aandelen</th><th>Kosten €</th><th>Munt</th><th>Notitie</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function filterTx(q) {
  txSearchVal = q || '';
  const wrap = document.getElementById('txTableWrap');
  if (wrap) wrap.innerHTML = buildTxTable();
}

export async function deleteTx(origIdx) {
  const tx = state.RAW_TRANSACTIONS[origIdx];
  if (!tx) return;
  if (!confirm(`Verwijder ${tx.date} ${tx.ticker} (${tx.shares} aandelen)?`)) return;
  const newTxs = state.RAW_TRANSACTIONS.filter((_, i) => i !== origIdx);
  try {
    const json = await saveTransactions('replace', newTxs);
    if (json.status !== 'ok') throw new Error(json.message);
    await globalThis._init();
    globalThis._setTab('transacties');
  } catch (e) { alert('Verwijderen mislukt: ' + e.message); }
}

export function toggleAddTx() {
  addTxVisible = !addTxVisible;
  const form = document.getElementById('addTxForm');
  if (form) form.style.display = addTxVisible ? 'block' : 'none';
}

export function toggleImportSection() {
  _importOpen = !_importOpen;
  const body = document.getElementById('importSectionBody');
  const btn  = document.querySelector('[onclick="globalThis._toggleImportSection()"]');
  if (body) body.style.display = _importOpen ? 'block' : 'none';
  if (btn)  btn.textContent = _importOpen ? 'Inklappen ↑' : 'Uitklappen ↓';
}

export async function addManualTx() {
  const type     = document.getElementById('addType')?.value || 'buy';
  const date     = (document.getElementById('addDate')?.value    || '').trim();
  const ticker   = (document.getElementById('addTicker')?.value  || '').trim().toUpperCase();
  const yahoo    = (document.getElementById('addYahoo')?.value   || '').trim();
  const label    = (document.getElementById('addLabel')?.value   || '').trim();
  const isin     = (document.getElementById('addIsin')?.value    || '').trim() || undefined;
  const costEur  = Number.parseFloat(document.getElementById('addCostEur')?.value);
  const currency = document.getElementById('addCurrency')?.value || 'EUR';

  const isDividendTx = type === 'dividend';
  const sharesRaw = isDividendTx ? 0 : Number.parseFloat(document.getElementById('addShares')?.value);
  const shares    = type === 'sell' ? -Math.abs(sharesRaw) : sharesRaw;

  if (!date || !ticker || !yahoo || (!isDividendTx && Number.isNaN(shares)) || Number.isNaN(costEur) || costEur < 0) {
    alert('Vul alle verplichte velden in (datum, ticker, yahoo, aandelen, kosten).');
    return;
  }

  const tx = {
    date, ticker, yahoo, shares, costEur, currency,
    ...(isDividendTx && { type: 'dividend' }),
    ...(label && { label }),
    ...(isin  && { isin }),
  };
  try {
    const json = await saveTransactions('replace', [...state.RAW_TRANSACTIONS, tx]);
    if (json.status !== 'ok') throw new Error(json.message);
    addTxVisible = false;
    await globalThis._init();
    globalThis._setTab('transacties');
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}

export async function saveTxAll() {
  const rows = document.querySelectorAll('#txTableWrap tbody tr[data-idx]');
  const updated = state.RAW_TRANSACTIONS.map(t => ({ ...t }));

  for (const tr of rows) {
    const idx = Number.parseInt(tr.dataset.idx);
    if (Number.isNaN(idx) || !updated[idx]) continue;
    const date      = tr.querySelector("[data-field='date']")?.innerText.trim();
    const sharesRaw = tr.querySelector("[data-field='shares']")?.innerText.trim().replace(',', '.');
    const costRaw   = tr.querySelector("[data-field='costEur']")?.innerText.trim().replace(',', '.');
    const currency  = tr.querySelector("[data-field='currency']")?.value;
    const note      = tr.querySelector("[data-field='note']")?.innerText.trim();
    const shares    = Number.parseFloat(sharesRaw);
    const costEur   = Number.parseFloat(costRaw);
    updated[idx] = {
      ...updated[idx],
      ...(date                   ? { date }    : {}),
      ...(Number.isNaN(shares)   ? {} : { shares }),
      ...(Number.isNaN(costEur)  ? {} : { costEur }),
      ...(currency               ? { currency } : {}),
      note: note || undefined,
    };
  }

  try {
    const json = await saveTransactions('replace', updated);
    if (json.status !== 'ok') throw new Error(json.message);
    await globalThis._init();
    globalThis._setTab('transacties');
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}

export function onAddTypeChange(type) {
  const sharesField = document.getElementById('addSharesField');
  const costLabel   = document.getElementById('addCostLabel');
  if (type === 'dividend') {
    if (sharesField) sharesField.style.display = 'none';
    if (costLabel) costLabel.textContent = 'Bedrag € *';
  } else {
    if (sharesField) sharesField.style.display = '';
    if (costLabel) costLabel.textContent = 'Kosten € *';
  }
}

globalThis._toggleImportSection = toggleImportSection;
