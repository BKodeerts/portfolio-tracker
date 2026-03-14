import { state } from '../state.js';
import { saveTransactions, lookupIsin } from '../api.js';
import { parseDeGiroCSV, parseBoleroXLSX, aggregateOrders, buildIsinLookup, guessYahooSuffix } from '../csv.js';
import { renderAppHeader } from '../components/header.js';
import { destroyAllCharts } from '../utils.js';

export function renderImport() {
  destroyAllCharts();
  state.currentTab = 'import';
  const txCount   = state.RAW_TRANSACTIONS.length;
  const dateRange = txCount > 0
    ? `${state.RAW_TRANSACTIONS[0].date} → ${state.RAW_TRANSACTIONS[state.RAW_TRANSACTIONS.length - 1].date}`
    : '—';

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="import-wrap">
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
    </div>`;
}

export async function handleCSVFile(file) {
  if (!file) return;
  const isBolero = file.name.endsWith('.xlsx') || file.name.startsWith('portfolio_');

  const parseAndRender = async rows => {
    if (rows.length === 0) { alert('Geen geldige transacties gevonden.'); return; }
    state.parsedCSVRows = isBolero ? rows : aggregateOrders(rows);

    const isinLookup = buildIsinLookup(state.RAW_TRANSACTIONS);
    const isinMeta = {};
    state.parsedCSVRows.forEach(r => { if (!isinMeta[r.isin]) isinMeta[r.isin] = { beurs: r.beurs }; });
    const unknowns = Object.entries(isinMeta).filter(([isin]) => !isinLookup[isin]);

    const sec = document.getElementById('mappingSection');
    sec.style.display = 'block';
    if (unknowns.length > 0) {
      sec.innerHTML = `<div style="color:#94a3b8;font-size:13px;margin-top:16px">Symbolen opzoeken (${unknowns.length})…</div>`;
    }

    const resolved = {};
    await Promise.all(unknowns.map(async ([isin, meta]) => {
      try {
        const j = await lookupIsin(isin, meta.beurs);
        if (j.status === 'ok' && j.symbol) {
          const sfx    = guessYahooSuffix(meta.beurs);
          const ticker = sfx ? j.symbol.slice(0, j.symbol.length - sfx.length) : j.symbol;
          resolved[isin] = { ticker, yahoo: j.symbol };
        }
      } catch {}
    }));

    renderMappingTable(state.parsedCSVRows, resolved);
  };

  if (isBolero) {
    try { await parseAndRender(parseBoleroXLSX(await file.arrayBuffer())); }
    catch (err) { alert('XLSX-fout: ' + err.message); }
  } else {
    const reader = new FileReader();
    reader.onload = async e => {
      try { await parseAndRender(parseDeGiroCSV(e.target.result)); }
      catch (err) { alert('CSV-fout: ' + err.message); }
    };
    reader.readAsText(file, 'utf-8');
  }
}

export function renderMappingTable(rows, resolved = {}) {
  const isinMap = {};
  rows.forEach(r => {
    if (!isinMap[r.isin]) isinMap[r.isin] = { product: r.product, beurs: r.beurs, count: 0, currency: r.currency };
    isinMap[r.isin].count++;
  });
  const isinLookup = buildIsinLookup(state.RAW_TRANSACTIONS);

  const tableRows = Object.entries(isinMap).map(([isin, info]) => {
    const known   = isinLookup[isin] || resolved[isin] || {};
    const sfx     = guessYahooSuffix(info.beurs);
    const ticker  = known.ticker || '';
    const yahoo   = known.yahoo  || (ticker ? ticker + sfx : '');
    const missing = !ticker;
    return `<tr data-isin="${isin}" ${missing ? 'style="outline:1px solid #f59e0b;outline-offset:-1px"' : ''}>
      <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#475569">${isin}</td>
      <td style="color:#94a3b8;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">${info.product}</td>
      <td><input id="ticker_${isin}" value="${ticker}" placeholder="bv. ASTS" style="width:76px" oninput="window._updateYahooGuess('${isin}','${sfx}')"></td>
      <td><input id="yahoo_${isin}"  value="${yahoo}"  placeholder="bv. ASTS of VWCE.DE"></td>
      <td><select id="ccy_${isin}" style="width:58px">
        <option value="EUR" ${info.currency !== 'USD' ? 'selected' : ''}>EUR</option>
        <option value="USD" ${info.currency === 'USD' ? 'selected' : ''}>USD</option>
      </select></td>
      <td style="color:#475569;font-size:11px;text-align:right">${info.count}</td>
    </tr>`;
  }).join('');

  document.getElementById('mappingSection').style.display = 'block';
  document.getElementById('mappingSection').innerHTML = `
    <h3 style="font-size:13px;color:#e2e8f0;margin:20px 0 6px;font-weight:600">ISIN → Ticker mapping</h3>
    <p style="font-size:12px;color:#64748b;margin-bottom:4px;line-height:1.5">
      Vul per ISIN de korte naam en Yahoo Finance symbool in.<br>
      US-aandelen: ticker alleen (bv. <span style="font-family:'JetBrains Mono',monospace">ASTS</span>) ·
      Europese ETFs: voeg suffix toe (bv. <span style="font-family:'JetBrains Mono',monospace">VWCE.DE</span>)
    </p>
    <table class="map-table">
      <thead><tr><th>ISIN</th><th>Product</th><th>Ticker</th><th>Yahoo symbool</th><th>Munt</th><th>#</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="import-actions">
      <button class="btn" onclick="window._setTab('portefeuille')" style="margin-right:auto">← Annuleren</button>
      <button class="btn" onclick="window._saveImport('merge')">Samenvoegen</button>
      <button class="btn success" onclick="window._saveImport('replace')">Vervang alles</button>
    </div>`;
}

export function updateYahooGuess(isin, suffix) {
  const ticker  = (document.getElementById(`ticker_${isin}`)?.value || '').trim().toUpperCase();
  const yahooEl = document.getElementById(`yahoo_${isin}`);
  if (yahooEl && !yahooEl.dataset.edited) yahooEl.value = ticker + suffix;
}

export async function saveImport(mode) {
  const isinEls = document.querySelectorAll('[data-isin]');
  let valid = true;
  const mapping = {};
  isinEls.forEach(row => {
    const isin   = row.dataset.isin;
    const ticker = (document.getElementById(`ticker_${isin}`)?.value || '').trim().toUpperCase();
    const yahoo  = (document.getElementById(`yahoo_${isin}`)?.value  || '').trim();
    const ccy    = document.getElementById(`ccy_${isin}`)?.value || 'EUR';
    document.getElementById(`ticker_${isin}`).classList.toggle('invalid', !ticker);
    document.getElementById(`yahoo_${isin}`).classList.toggle('invalid',  !yahoo);
    if (!ticker || !yahoo) valid = false;
    mapping[isin] = { ticker, yahoo, currency: ccy };
  });
  if (!valid) { alert('Vul alle ticker- en Yahoo-velden in.'); return; }

  const transactions = state.parsedCSVRows.map(row => {
    const m = mapping[row.isin];
    if (!m) return null;
    return {
      date: row.date, ticker: m.ticker, yahoo: m.yahoo, isin: row.isin,
      shares: row.shares, costEur: Math.abs(row.totaalEur || 0),
      currency: m.currency, label: row.product,
    };
  }).filter(Boolean);

  try {
    const json = await saveTransactions(mode, transactions);
    if (json.status !== 'ok') throw new Error(json.message);
    alert(`${json.count} transacties opgeslagen.`);
    await window._init();
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}
