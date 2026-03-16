import { state } from '../state.js';
import { getColor } from '../utils.js';
import { saveTransactions } from '../api.js';
import { renderAppHeader } from '../components/header.js';
import { destroyAllCharts } from '../utils.js';

let txSearchVal = '';

export function renderTransacties() {
  destroyAllCharts();
  state.currentTab = 'transacties';
  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="tx-wrap">
      <div class="tx-toolbar">
        <input class="tx-search" id="txSearch" type="text" placeholder="Zoeken op ticker, datum…"
          value="${txSearchVal}" oninput="window._filterTx(this.value)">
        <button class="btn" onclick="window._saveTxAll()">Opslaan</button>
      </div>
      <div id="txTableWrap">${buildTxTable()}</div>
      <div class="tx-save-bar">
        <span style="font-size:11px;color:#888">${state.RAW_TRANSACTIONS.length} transacties</span>
        <button class="btn" onclick="window._saveTxAll()">Opslaan</button>
      </div>
    </div>`;
}

function buildTxTable() {
  const q = txSearchVal.toLowerCase();
  const rows = state.RAW_TRANSACTIONS
    .map((t, i) => ({ ...t, _origIdx: i }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(t => {
      const hidden = q && !t.ticker.toLowerCase().includes(q) && !t.date.includes(q) && !(t.label || '').toLowerCase().includes(q);
      const isSale = t.shares < 0;
      return `<tr data-idx="${t._origIdx}"${hidden ? ' style="display:none"' : ''}>
        <td><span class="tx-cell" contenteditable="true" data-field="date">${t.date}</span></td>
        <td style="font-family:inherit;font-weight:600">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${getColor(t.ticker)};margin-right:5px;vertical-align:middle"></span>${t.ticker}
        </td>
        <td style="font-family:inherit;font-size:11px;color:#888">${t.label || ''}</td>
        <td style="color:${isSale ? '#ef4444' : '#16a34a'}">
          <span class="tx-cell" contenteditable="true" data-field="shares">${t.shares}</span>
        </td>
        <td><span class="tx-cell" contenteditable="true" data-field="costEur">${t.costEur}</span></td>
        <td>
          <select class="tx-ccy" data-field="currency">
            <option value="EUR"${t.currency !== 'USD' ? ' selected' : ''}>EUR</option>
            <option value="USD"${t.currency === 'USD' ? ' selected' : ''}>USD</option>
          </select>
        </td>
        <td><button class="tx-del-btn" onclick="window._deleteTx(${t._origIdx})" title="Verwijder">🗑</button></td>
      </tr>`;
    }).join('');

  return `<table class="tx-table">
    <thead><tr>
      <th>Datum</th><th>Ticker</th><th>Naam</th><th>Aandelen</th><th>Kosten €</th><th>Munt</th><th></th>
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
    window._init();
  } catch (e) { alert('Verwijderen mislukt: ' + e.message); }
}

export async function saveTxAll() {
  const rows = document.querySelectorAll('#txTableWrap tbody tr[data-idx]');
  const updated = state.RAW_TRANSACTIONS.map(t => ({ ...t }));

  for (const tr of rows) {
    const idx = parseInt(tr.dataset.idx);
    if (isNaN(idx) || !updated[idx]) continue;
    const date    = tr.querySelector("[data-field='date']")?.innerText.trim();
    const sharesRaw = tr.querySelector("[data-field='shares']")?.innerText.trim().replace(',', '.');
    const costRaw   = tr.querySelector("[data-field='costEur']")?.innerText.trim().replace(',', '.');
    const currency  = tr.querySelector("[data-field='currency']")?.value;
    const shares  = parseFloat(sharesRaw);
    const costEur = parseFloat(costRaw);
    updated[idx] = {
      ...updated[idx],
      ...(date    ? { date }    : {}),
      ...(isNaN(shares)  ? {} : { shares }),
      ...(isNaN(costEur) ? {} : { costEur }),
      ...(currency ? { currency } : {}),
    };
  }

  try {
    const json = await saveTransactions('replace', updated);
    if (json.status !== 'ok') throw new Error(json.message);
    window._init();
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}
