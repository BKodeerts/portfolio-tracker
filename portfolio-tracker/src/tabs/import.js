import { state } from '../state.js';
import { saveTransactions, lookupIsin } from '../api.js';
import { parseDeGiroCSV, parseBoleroXLSX, aggregateOrders, buildIsinLookup, guessYahooSuffix } from '../csv.js';
import { renderAppHeader } from '../components/header.js';
import { destroyAllCharts } from '../utils.js';

function buildTickerRows() {
  const byTicker = {};
  state.RAW_TRANSACTIONS.forEach(t => {
    if (!byTicker[t.ticker]) byTicker[t.ticker] = { yahoo: t.yahoo, label: t.label || '', count: 0 };
    byTicker[t.ticker].count++;
  });
  return Object.entries(byTicker)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ticker, info]) => `<tr data-orig-ticker="${ticker}" data-orig-yahoo="${info.yahoo}">
      <td><input id="rt_ticker_${ticker}" value="${ticker}" style="width:80px;font-family:'JetBrains Mono',monospace;text-transform:uppercase"></td>
      <td><input id="rt_yahoo_${ticker}" value="${info.yahoo}"></td>
      <td class="c-neutral" style="font-size:11px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${info.label}</td>
      <td class="c-neutral" style="font-size:11px;text-align:right">${info.count}</td>
    </tr>`).join('');
}

export function renderImport() {
  destroyAllCharts();
  state.currentTab = 'import';
  const txCount   = state.RAW_TRANSACTIONS.length;
  const dateRange = txCount > 0
    ? `${state.RAW_TRANSACTIONS[0].date} → ${state.RAW_TRANSACTIONS.at(-1).date}`
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
      ${txCount > 0 ? `
      <div style="margin-top:28px">
        <h3 style="font-size:13px;margin:0 0 4px;font-weight:600">Tickers hernoemen</h3>
        <p class="c-neutral" style="font-size:12px;margin-bottom:8px;line-height:1.5">
          Wijzig ticker of Yahoo-symbool. Wordt toegepast op alle bijbehorende transacties (handig bij verkeerde ISIN-koppeling).
        </p>
        <table class="map-table">
          <thead><tr><th>Ticker</th><th>Yahoo symbool</th><th>Label</th><th>#</th></tr></thead>
          <tbody>${buildTickerRows()}</tbody>
        </table>
        <div class="import-actions" style="margin-top:8px">
          <button class="btn success" onclick="window._saveTickerRenames()">Tickers opslaan</button>
        </div>
      </div>` : ''}
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
    await globalThis._init();
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}

export async function saveTickerRenames() {
  const rows = document.querySelectorAll('[data-orig-ticker]');
  let changed = false;
  const updated = state.RAW_TRANSACTIONS.map(t => ({ ...t }));

  rows.forEach(row => {
    const origTicker = row.dataset.origTicker;
    const origYahoo  = row.dataset.origYahoo;
    const newTicker  = (document.getElementById(`rt_ticker_${origTicker}`)?.value || '').trim().toUpperCase();
    const newYahoo   = (document.getElementById(`rt_yahoo_${origTicker}`)?.value  || '').trim();
    if (!newTicker || !newYahoo) return;
    if (newTicker === origTicker && newYahoo === origYahoo) return;
    updated.forEach(t => {
      if (t.ticker === origTicker) { t.ticker = newTicker; t.yahoo = newYahoo; changed = true; }
    });
  });

  if (!changed) { alert('Geen wijzigingen gevonden.'); return; }
  try {
    const json = await saveTransactions('replace', updated);
    if (json.status !== 'ok') throw new Error(json.message);
    await globalThis._init();
  } catch (e) { alert('Opslaan mislukt: ' + e.message); }
}
