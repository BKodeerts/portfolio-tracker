import { state } from '../state.js';
import { fetchBonus, saveBonus, deleteBonus } from '../api.js';
import { sparklineSVG, latestSessionPoints } from './intraday.js';
import { fmt } from '../utils.js';

// ── Edit / add form (dialog) ──────────────────────────────────────────────────

function openBonusEdit(existing = null) {
  const id          = existing?.id          || '';
  const label       = existing?.label       || '';
  const symbol      = existing?.symbol      || '^STOXX50E';
  const quantity    = existing?.quantity    || '';
  const grantDate   = existing?.grantDate   || '';
  const grantPrice  = existing?.grantPrice  || 10;
  const isCall      = existing?.type === 'call_option';
  const strikePrice = existing?.strikePrice || '';
  const ratio       = existing?.ratio       || 1;
  const expiryDate  = existing?.expiryDate  || '';

  const LBL = 'font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em';
  const INP = 'display:block;width:100%;margin-top:4px;box-sizing:border-box';

  let dlg = document.getElementById('bonusEditDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'bonusEditDlg';
    document.body.appendChild(dlg);
  }

  dlg.innerHTML = `<div class="pos-modal-inner" style="max-width:360px">
    <div class="pos-modal-header">
      <span style="font-size:15px;font-weight:700">${existing ? 'Bonus bewerken' : 'Bonus toevoegen'}</span>
      <button class="pos-modal-close" onclick="document.getElementById('bonusEditDlg').close()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
      <div>
        <div style="${LBL};margin-bottom:6px">Type</div>
        <div style="display:flex;gap:0;border:1px solid #334155;border-radius:6px;overflow:hidden;width:fit-content">
          <button id="bTypeWarrant" onclick="window._setBonusType('warrant')"
            style="padding:5px 14px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:${!isCall?'#334155':'transparent'};color:${!isCall?'#fff':'#888'}">Gewoon warrant</button>
          <button id="bTypeCall" onclick="window._setBonusType('call_option')"
            style="padding:5px 14px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:${isCall?'#a78bfa':'transparent'};color:${isCall?'#fff':'#888'}">Call optie</button>
        </div>
      </div>
      <label style="${LBL}">Naam
        <input id="bLabel" value="${label}" placeholder="Warrants EuroStoxx" style="${INP}">
      </label>
      <label style="${LBL}">Yahoo volgindex / onderliggend
        <input id="bSymbol" value="${symbol}" placeholder="^STOXX50E" style="${INP}">
      </label>
      <div style="display:flex;gap:10px">
        <label style="${LBL};flex:1">Aantal
          <input id="bQty" type="number" value="${quantity}" placeholder="250" step="1" min="1" style="${INP}">
        </label>
        <label style="${LBL};flex:1">Prijs bij toekenning
          <input id="bPrice" type="number" value="${grantPrice}" placeholder="10" step="0.01" min="0" style="${INP}">
        </label>
      </div>
      <label style="${LBL}">Toekenningsdatum
        <input id="bDate" type="date" value="${grantDate}" style="${INP}">
      </label>
      <label style="${LBL}">Koers onderliggende bij toekenning (override)
        <input id="bGrantIdx" type="number" value="${existing?.grantIndexPriceOverride ?? ''}" placeholder="auto (Yahoo)" step="0.01" min="0" style="${INP}">
      </label>
      <label style="${LBL}" title="Correctiefactor voor ETFs die met premium boven NAV handelen (bijv. 0.991 voor SC0D.DE). Yahoo-koers × factor = geschatte NAV.">NAV-correctiefactor (optioneel)
        <input id="bNavFactor" type="number" value="${existing?.navCorrectionFactor ?? ''}" placeholder="1 (geen correctie)" step="0.0001" min="0.9" max="1.1" style="${INP}">
      </label>
      <div id="bCallFields" style="display:${isCall?'flex':'none'};flex-direction:column;gap:12px;padding-top:4px;border-top:1px solid #1e293b">
        <div style="display:flex;gap:10px">
          <label style="${LBL};flex:2">Uitoefenprijs (strike)
            <input id="bStrike" type="number" value="${strikePrice}" placeholder="45.00" step="0.01" min="0" style="${INP}">
          </label>
          <label style="${LBL};flex:1">Ratio
            <input id="bRatio" type="number" value="${ratio}" placeholder="1" step="0.01" min="0.01" style="${INP}">
          </label>
        </div>
        <label style="${LBL}">Vervaldatum
          <input id="bExpiry" type="date" value="${expiryDate}" style="${INP}">
        </label>
        <div style="display:flex;gap:10px">
          <label style="${LBL};flex:1">Volatiliteit σ (%)
            <input id="bVol" type="number" value="${existing?.volatility ?? ''}" placeholder="20% (standaard)" step="0.1" min="0" max="200" style="${INP}">
          </label>
          <label style="${LBL};flex:1">Risicovrije rente r (%)
            <input id="bRate" type="number" value="${existing?.riskFreeRate == null ? '' : existing.riskFreeRate * 100}" placeholder="2% (standaard)" step="0.1" min="0" max="20" style="${INP}">
          </label>
        </div>
        <label style="${LBL}">Belastingtarief BV (%)
          <input id="bTaxRate" type="number" value="${existing?.taxRate ?? 53.5}" step="0.1" min="0" max="100" style="${INP}">
        </label>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      ${existing ? `<button class="btn" id="bDelete" style="margin-right:auto;color:#ef4444">Verwijderen</button>` : ''}
      <button class="btn" onclick="document.getElementById('bonusEditDlg').close()">Annuleren</button>
      <button class="btn success" id="bSave">Opslaan</button>
    </div>
  </div>`;

  dlg.showModal();
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };

  window._setBonusType = (t) => {
    const callFields = document.getElementById('bCallFields');
    const wBtn = document.getElementById('bTypeWarrant');
    const cBtn = document.getElementById('bTypeCall');
    callFields.style.display = t === 'call_option' ? 'flex' : 'none';
    wBtn.style.background = t === 'warrant' ? '#334155' : 'transparent';
    wBtn.style.color      = t === 'warrant' ? '#fff' : '#888';
    cBtn.style.background = t === 'call_option' ? '#a78bfa' : 'transparent';
    cBtn.style.color      = t === 'call_option' ? '#fff' : '#888';
    dlg._bonusType = t;
  };
  dlg._bonusType = isCall ? 'call_option' : 'warrant';

  if (existing) {
    document.getElementById('bDelete').onclick = async () => {
      await deleteBonus(existing.id);
      dlg.close();
      await reloadBonusCards();
      if (state.currentTab === 'bonus') history.back();
    };
  }

  document.getElementById('bSave').onclick = async () => {
    const type   = dlg._bonusType;
    const strike = Number(document.getElementById('bStrike')?.value) || undefined;
    const entry  = {
      ...(id ? { id } : {}),
      label:      document.getElementById('bLabel').value.trim() || document.getElementById('bSymbol').value.trim(),
      symbol:     document.getElementById('bSymbol').value.trim(),
      quantity:   Number(document.getElementById('bQty').value),
      grantDate:  document.getElementById('bDate').value,
      grantPrice: Number(document.getElementById('bPrice').value),
      grantIndexPriceOverride: Number(document.getElementById('bGrantIdx')?.value) || undefined,
      navCorrectionFactor: Number(document.getElementById('bNavFactor')?.value) || undefined,
      ...(type === 'call_option' && {
        type,
        strikePrice: strike,
        ratio: Number(document.getElementById('bRatio').value) || 1,
        expiryDate: document.getElementById('bExpiry').value || undefined,
        volatility: Number(document.getElementById('bVol')?.value) || undefined,
        riskFreeRate: Number(document.getElementById('bRate')?.value) / 100 || undefined,
        taxRate: Number(document.getElementById('bTaxRate')?.value) || 53.5,
      }),
    };
    if (!entry.symbol || !entry.quantity || !entry.grantDate) {
      alert('Vul alle verplichte velden in.'); return;
    }
    const btn = document.getElementById('bSave');
    btn.textContent = 'Opslaan…'; btn.disabled = true;
    await saveBonus(entry);
    dlg.close();
    await reloadBonusCards();
    if (state.currentTab === 'bonus' && state.selectedBonusId === entry.id) {
      const { renderBonusDetail } = await import('./bonus-detail.js');
      await renderBonusDetail();
    }
  };
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function bonusCard(item) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const data     = state.intradayData[item.symbol];
  const pct      = item.changeSinceGrantPct ?? 0;
  const cls      = pct >= 0 ? 'c-pos' : 'c-neg';
  const sign     = pct >= 0 ? '+' : '';

  const hasToday = data?.points?.length > 0 && data.previousClose && data.date === todayStr;
  const last     = hasToday ? data.points[data.points.length - 1].close : null;
  let todayPct;
  if (!hasToday) {
    todayPct = null;
  } else if (item.type === 'call_option') {
    const prevIntrinsic = Math.max(0, data.previousClose - item.strikePrice) * (item.ratio || 1);
    const currIntrinsic = Math.max(0, last - item.strikePrice) * (item.ratio || 1);
    todayPct = prevIntrinsic > 0
      ? (currIntrinsic - prevIntrinsic) / prevIntrinsic * 100
      : null;
  } else {
    todayPct = (last - data.previousClose) / data.previousClose * 100;
  }
  let todaySub;
  if (todayPct === null) {
    todaySub = `<span>${sign}${pct.toFixed(2)}% v.a. toekenning</span>`;
  } else {
    const color     = todayPct >= 0 ? '#4ade80' : '#f87171';
    const todaySign = todayPct >= 0 ? '+' : '';
    todaySub = `<span style="color:${color}">${todaySign}${todayPct.toFixed(2)}% vandaag</span>`;
  }

  const sessionPts = latestSessionPoints(data);
  const sparkline  = sessionPts.length ? sparklineSVG(sessionPts, data.previousClose, 510) : '';

  const isCall = item.type === 'call_option';
  const hasBs  = isCall && item.volatility && item.expiryDate;
  const tag    = isCall ? 'call optie' : 'bonus';
  const otmTag = item.isOutOfMoney
    ? '<span style="font-size:9px;color:#f87171;font-family:\'JetBrains Mono\',monospace;font-weight:700;margin-left:4px">OTM</span>'
    : '';
  const valueHtml = isCall && item.isOutOfMoney && !hasBs
    ? `<div style="display:flex;align-items:center;gap:6px;margin-top:5px">
        <span class="metric-value c-neg privacy-val" style="font-size:16px">${fmt(0)}</span>
        ${otmTag}
      </div>`
    : `<div style="display:flex;align-items:center;gap:2px;margin-top:5px">
        <span class="metric-value ${cls} privacy-val" style="font-size:16px">${fmt(item.totalValue ?? 0)}</span>
        ${isCall && item.isOutOfMoney ? otmTag : ''}
      </div>`;

  return `<div class="intraday-card clickable" onclick="globalThis._navigateToBonusDetail('${item.id}')">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#888;margin-bottom:2px">
      <span class="pos-dot" style="background:#a78bfa"></span>${item.label}
      <span style="font-size:9px;color:#a78bfa;font-family:'JetBrains Mono',monospace;margin-left:auto">${tag}</span>
    </div>
    ${valueHtml}
    ${sparkline}
    <div class="metric-sub">${todaySub}</div>
  </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function reloadBonusCards() {
  const json = await fetchBonus();
  state.bonusItems = json.data || [];

  const bonusSymbols = [...new Set(state.bonusItems.map(b => b.symbol))];
  if (bonusSymbols.length) {
    const { fetchIntraday } = await import('../api.js');
    const json2 = await fetchIntraday(bonusSymbols);
    if (json2.status === 'ok') Object.assign(state.intradayData, json2.data);
  }

  renderBonusCards();
}

export function renderBonusCards() {
  const grid = document.getElementById('intradayGrid');
  if (!grid) return;

  grid.querySelectorAll('.bonus-card').forEach(el => el.remove());

  const fragment = document.createDocumentFragment();
  for (const item of state.bonusItems) {
    const div = document.createElement('div');
    div.innerHTML = bonusCard(item);
    const card = div.firstElementChild;
    card.classList.add('bonus-card');
    fragment.appendChild(card);
  }
  const watchlistStart = grid.querySelector('.watchlist-section-start');
  if (watchlistStart) {
    grid.insertBefore(fragment, watchlistStart);
  } else {
    grid.appendChild(fragment);
  }
}

export function initBonus() {
  globalThis._openBonusEdit = (id) => {
    const item = id ? state.bonusItems.find(b => b.id === id) : null;
    openBonusEdit(item ?? null);
  };
}
