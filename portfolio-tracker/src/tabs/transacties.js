import { state } from '../state.js';
import { getColor, destroyAllCharts } from '../utils.js';
import { saveTransactions } from '../api.js';
import { renderAppHeader } from '../components/header.js';

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
      const match = !q || t.ticker.toLowerCase().includes(q) || t.date.includes(q) || (t.label || '').toLowerCase().includes(q);
      const isSale = t.shares < 0;
      return `<tr data-idx="${t._origIdx}"${match ? '' : ' style="display:none"'}>
        <td class="tx-col-date"><span class="tx-cell" contenteditable="true" data-field="date" inputmode="text">${t.date}</span></td>
        <td class="tx-col-name-group">
          <div class="tx-name-top"><span class="tx-dot" style="background:${getColor(t.ticker)}"></span><span class="tx-name-ticker">${t.ticker}</span></div>
          <div class="tx-name-sub">${t.label || ''}</div>
        </td>
        <td class="tx-col-shares" style="color:${isSale ? '#ef4444' : '#16a34a'}">
          <span class="tx-cell" contenteditable="true" data-field="shares" inputmode="decimal">${t.shares}</span>
        </td>
        <td class="tx-col-cost"><span class="tx-cell" contenteditable="true" data-field="costEur" inputmode="decimal">${Number.parseFloat(t.costEur).toFixed(2)}</span></td>
        <td class="tx-col-ccy">
          <select class="tx-ccy" data-field="currency">
            <option value="EUR"${t.currency === 'USD' ? '' : ' selected'}>EUR</option>
            <option value="USD"${t.currency === 'USD' ? ' selected' : ''}>USD</option>
          </select>
        </td>
        <td class="tx-col-del"><button class="tx-del-btn" onclick="window._deleteTx(${t._origIdx})" title="Verwijder">🗑</button></td>
      </tr>`;
    }).join('');

  return `<table class="tx-table">
    <thead><tr>
      <th>Datum</th><th>Ticker / Naam</th><th>Aandelen</th><th>Kosten €</th><th>Munt</th><th></th>
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
    const shares    = Number.parseFloat(sharesRaw);
    const costEur   = Number.parseFloat(costRaw);
    updated[idx] = {
      ...updated[idx],
      ...(date                   ? { date }    : {}),
      ...(Number.isNaN(shares)   ? {} : { shares }),
      ...(Number.isNaN(costEur)  ? {} : { costEur }),
      ...(currency               ? { currency } : {}),
    };
  }

  try {
    const json = await saveTransactions('replace', updated);
    if (json.status !== 'ok') throw new Error(json.message);
    await globalThis._init();
    globalThis._setTab('transacties');
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}
