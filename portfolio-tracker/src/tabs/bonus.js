import { state } from '../state.js';
import { fetchBonus, saveBonus, deleteBonus } from '../api.js';
import { sparklineSVG } from './intraday.js';
import { fmt } from '../utils.js';

// ── Modal ─────────────────────────────────────────────────────────────────────

function openBonusModal(existing = null) {
  const id        = existing?.id        || '';
  const label     = existing?.label     || '';
  const symbol    = existing?.symbol    || '^STOXX50E';
  const quantity  = existing?.quantity  || '';
  const grantDate = existing?.grantDate || '';
  const grantPrice = existing?.grantPrice || 10;

  const modal = document.createElement('div');
  modal.id = 'bonusModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;width:340px;max-width:90vw">
      <h3 style="margin:0 0 18px;font-size:14px;color:#e2e8f0;font-weight:600">${existing ? 'Bonus bewerken' : 'Bonus toevoegen'}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <label style="font-size:11px;color:#64748b">Naam
          <input id="bLabel" value="${label}" placeholder="Warrants EuroStoxx" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
        </label>
        <label style="font-size:11px;color:#64748b">Volgindex (Yahoo symbool)
          <input id="bSymbol" value="${symbol}" placeholder="^STOXX50E" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
        </label>
        <div style="display:flex;gap:10px">
          <label style="font-size:11px;color:#64748b;flex:1">Aantal warrants
            <input id="bQty" type="number" value="${quantity}" placeholder="250" step="1" min="1" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
          </label>
          <label style="font-size:11px;color:#64748b;flex:1">Prijs bij toekenning (€)
            <input id="bPrice" type="number" value="${grantPrice}" placeholder="10" step="0.01" min="0.01" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
          </label>
        </div>
        <label style="font-size:11px;color:#64748b">Toekenningsdatum
          <input id="bDate" type="date" value="${grantDate}" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">
        ${existing ? `<button class="btn" id="bDelete" style="margin-right:auto;color:#f87171">Verwijderen</button>` : ''}
        <button class="btn" id="bCancel">Annuleren</button>
        <button class="btn success" id="bSave">Opslaan</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('bCancel').onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  if (existing) {
    document.getElementById('bDelete').onclick = async () => {
      await deleteBonus(existing.id);
      modal.remove();
      await reloadBonusCards();
    };
  }

  document.getElementById('bSave').onclick = async () => {
    const entry = {
      id:         id || undefined,
      label:      document.getElementById('bLabel').value.trim() || document.getElementById('bSymbol').value.trim(),
      symbol:     document.getElementById('bSymbol').value.trim(),
      quantity:   Number(document.getElementById('bQty').value),
      grantDate:  document.getElementById('bDate').value,
      grantPrice: Number(document.getElementById('bPrice').value),
    };
    if (!entry.symbol || !entry.quantity || !entry.grantDate || !entry.grantPrice) {
      alert('Vul alle velden in.'); return;
    }
    const btn = document.getElementById('bSave');
    btn.textContent = 'Opslaan…'; btn.disabled = true;
    await saveBonus(entry);
    modal.remove();
    await reloadBonusCards();
  };
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function bonusCard(item) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const data     = state.intradayData[item.symbol];
  const pct      = item.changeSinceGrantPct ?? 0;
  const cls      = pct >= 0 ? 'c-pos' : 'c-neg';
  const sign     = pct >= 0 ? '+' : '';

  // Today's intraday change (from the tracking index)
  let todayPct = null;
  if (data?.points?.length && data.previousClose && data.date === todayStr) {
    const last = data.points[data.points.length - 1].close;
    todayPct = (last - data.previousClose) / data.previousClose * 100;
  }
  const todaySub = todayPct !== null
    ? `<span style="color:${todayPct >= 0 ? '#4ade80' : '#f87171'}">${todayPct >= 0 ? '+' : ''}${todayPct.toFixed(2)}% vandaag</span>`
    : `<span style="color:#64748b">${sign}${pct.toFixed(2)}% v.a. toekenning</span>`;

  const sparkline = data?.points?.length
    ? sparklineSVG(data.points, data.previousClose, 510)
    : '';

  return `<div class="intraday-card" style="cursor:pointer" onclick="window._openBonusModal(${JSON.stringify(JSON.stringify(item))})">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#888;margin-bottom:2px">
      <span class="pos-dot" style="background:#a78bfa"></span>${item.label}
      <span style="font-size:9px;color:#64748b;font-family:'JetBrains Mono',monospace;margin-left:auto">bonus</span>
    </div>
    <div class="metric-value ${cls} privacy-val" style="font-size:16px;margin-top:5px">${fmt(item.totalValue)}</div>
    ${sparkline}
    <div class="metric-sub">${todaySub}</div>
  </div>`;
}

function addCard() {
  return `<div class="intraday-card" style="cursor:pointer;border:1px dashed #334155;display:flex;align-items:center;justify-content:center;gap:6px;color:#475569;font-size:12px" onclick="window._openBonusModal(null)">
    <span style="font-size:18px;line-height:1">+</span> Bonus
  </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function reloadBonusCards() {
  const json = await fetchBonus();
  state.bonusItems = json.data || [];

  // Ensure intraday data is fetched for bonus symbols
  const bonusSymbols = [...new Set(state.bonusItems.map(b => b.symbol))];
  if (bonusSymbols.length) {
    const { fetchIntraday } = await import('../api.js');
    const json2 = await fetchIntraday(bonusSymbols);
    if (json2.status === 'ok') {
      Object.assign(state.intradayData, json2.data);
    }
  }

  renderBonusCards();
}

export function renderBonusCards() {
  const container = document.getElementById('bonusCards');
  if (!container) return;
  container.innerHTML = state.bonusItems.map(bonusCard).join('') + addCard();
}

export function initBonus() {
  window._openBonusModal = (jsonStr) => {
    const item = jsonStr ? JSON.parse(jsonStr) : null;
    openBonusModal(item);
  };
}
