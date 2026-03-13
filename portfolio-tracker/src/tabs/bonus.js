import { state } from '../state.js';
import { fetchBonus, saveBonus, deleteBonus, fetchBatch } from '../api.js';
import { sparklineSVG } from './intraday.js';
import { fmt, chartTheme } from '../utils.js';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

// ── Detail modal (reuses #posModal + pos-modal-inner styling) ─────────────────

async function showBonusDetail(item) {
  const isCall = item.type === 'call_option';
  const pct    = item.changeSinceGrantPct ?? 0;
  const cls    = pct >= 0 ? 'c-pos' : 'c-neg';
  const sign   = pct >= 0 ? '+' : '';
  const priceChange = (item.currentWarrantPrice ?? item.grantPrice) - item.grantPrice;
  const priceCls  = priceChange >= 0 ? 'c-pos' : 'c-neg';
  const priceSign = priceChange >= 0 ? '+' : '';

  const callExtraStats = isCall ? `
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Uitoefenprijs</div>
        <div class="pos-modal-stat-val">€${item.strikePrice?.toFixed(2) ?? '—'}${(item.ratio && item.ratio !== 1) ? `<span style="font-size:10px;color:#888"> ×${item.ratio}</span>` : ''}</div>
      </div>
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Status</div>
        <div class="pos-modal-stat-val ${item.isOutOfMoney ? 'c-neg' : 'c-pos'}">${item.isOutOfMoney ? 'Out of the money' : 'In the money ✓'}</div>
      </div>
      ${item.expiryDate ? `<div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Vervaldatum</div>
        <div class="pos-modal-stat-val">${item.expiryDate}</div>
      </div>` : ''}` : '';

  const modal = document.getElementById('posModal');
  modal.innerHTML = `<div class="pos-modal-inner">
    <div class="pos-modal-header">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#a78bfa;flex-shrink:0"></span>
      <span style="font-size:16px;font-weight:700;flex-shrink:0">${item.label}</span>
      <span class="pos-modal-header-label" style="font-size:13px;color:#888">${item.symbol}</span>
      <button class="btn" style="margin-left:auto;font-size:11px;padding:4px 10px" onclick="globalThis._openBonusEdit('${item.id}')">Bewerken</button>
      <button class="pos-modal-close" onclick="globalThis._closePosModal()">✕</button>
    </div>
    <div class="pos-modal-stats">
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">${isCall ? 'Aantal opties' : 'Aantal warrants'}</div>
        <div class="pos-modal-stat-val privacy-val">${item.quantity}</div>
      </div>
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Prijs bij toekenning</div>
        <div class="pos-modal-stat-val">€${item.grantPrice.toFixed(2)}</div>
        <div class="pos-modal-stat-sub" style="color:#888">${item.grantDate}</div>
      </div>
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Prijs nu</div>
        <div class="pos-modal-stat-val ${priceCls}">€${(item.currentWarrantPrice ?? item.grantPrice).toFixed(2)}</div>
        <div class="pos-modal-stat-sub ${priceCls}">${priceSign}€${Math.abs(priceChange).toFixed(2)}</div>
      </div>
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Totale waarde</div>
        <div class="pos-modal-stat-val privacy-val">${fmt(item.totalValue ?? 0)}</div>
        <div class="pos-modal-stat-sub ${cls}">${sign}${pct.toFixed(2)}%</div>
      </div>
      ${callExtraStats}
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">${isCall ? 'Onderliggende bij toekenning' : 'Index bij toekenning'}</div>
        <div class="pos-modal-stat-val">${item.grantIndexPrice?.toFixed(2) ?? '—'}</div>
      </div>
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">${isCall ? 'Onderliggende nu' : 'Index nu'}</div>
        <div class="pos-modal-stat-val">${item.currentIndexPrice?.toFixed(2) ?? '—'}</div>
      </div>
    </div>
    <div class="pos-modal-chart-wrap"><canvas id="posModalChart"></canvas></div>
  </div>`;

  modal.showModal();

  if (state.chartInstances.__posModal) { state.chartInstances.__posModal.destroy(); delete state.chartInstances.__posModal; }

  // Draw historical warrant value chart with YoY comparison + forecast
  try {
    const yearAgoGrant = (() => { const d = new Date(item.grantDate); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();
    const yearAgoToday = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();

    // Single fetch from 1y before grant covers current period, overlap AND forecast window
    const json    = await fetchBatch([item.symbol], [yearAgoGrant]);
    const candles = json.data?.[item.symbol] || [];
    if (!candles.length || !item.grantIndexPrice) return;

    const ct = chartTheme();

    // How far to extend the forecast: enough that the prior-year line is always ≥60 days total
    const daysSinceGrant  = Math.floor((Date.now() - new Date(item.grantDate)) / 86_400_000);
    const forecastDays    = Math.max(14, 60 - daysSinceGrant);
    const forecastEnd     = (() => { const d = new Date(yearAgoToday); d.setDate(d.getDate() + forecastDays); return d.toISOString().slice(0, 10); })();

    const current      = candles.filter(c => c.date >= item.grantDate);
    const priorOverlap = candles.filter(c => c.date >= yearAgoGrant && c.date <= yearAgoToday);
    const priorFcast   = candles.filter(c => c.date > yearAgoToday && c.date <= forecastEnd);

    const currentFirst = current[0];
    const priorFirst   = priorOverlap[0];
    if (!currentFirst) return; // need at least current data to draw anything

    const valueOf = (close) => isCall
      ? item.quantity * Math.max(0, close - item.strikePrice) * (item.ratio || 1)
      : item.quantity * item.grantPrice * (close / item.grantIndexPrice);

    const currentStartY = valueOf(currentFirst.close);

    const toPoint = (c, shiftYears = 0) => {
      const d = new Date(c.date);
      if (shiftYears) d.setFullYear(d.getFullYear() + shiftYears);
      return { x: d, y: valueOf(c.close) };
    };
    const toPriorPoint = c => {
      const d = new Date(c.date);
      d.setFullYear(d.getFullYear() + 1);
      return { x: d, y: currentStartY * (c.close / priorFirst.close) };
    };

    const points        = current.map(c => toPoint(c));
    const priorPoints = priorFirst ? priorOverlap.map(toPriorPoint) : [];
    // Prepend last overlap point so forecast line connects seamlessly
    const fcastPoints = priorFirst ? [
      toPriorPoint(priorOverlap[priorOverlap.length - 1]),
      ...priorFcast.map(toPriorPoint),
    ] : [];

    state.chartInstances.__posModal = new Chart(document.getElementById('posModalChart').getContext('2d'), {
      type: 'line',
      data: { datasets: [
        { data: points,       borderColor: '#a78bfa',   borderWidth: 2,   fill: true,  backgroundColor: '#a78bfa22', tension: 0.3, pointRadius: 0 },
        { data: priorPoints,  borderColor: '#a78bfa55', borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0, borderDash: [4, 3] },
        { data: fcastPoints,  borderColor: '#a78bfa88', borderWidth: 1.5, fill: true,  backgroundColor: '#a78bfa11', tension: 0.3, pointRadius: 0, borderDash: [3, 4] },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
            titleColor: ct.titleColor, bodyColor: ct.bodyColor,
            titleFont: { family: "'DM Sans'", size: 11, weight: 700 }, bodyFont: { family: "'JetBrains Mono'", size: 11 },
            padding: 10, cornerRadius: 8,
            callbacks: {
              title: items => new Date(items[0].parsed.x).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
              label: i => {
                if (i.datasetIndex === 1) return ` vorig jaar: ${fmt(i.parsed.y)}`;
                if (i.datasetIndex === 2) return ` prognose (vorig jaar): ${fmt(i.parsed.y)}`;
                return ` ${fmt(i.parsed.y)}`;
              },
            },
          },
        },
        scales: {
          x: { type: 'time', time: { unit: 'month' }, grid: { color: ct.gridColor }, ticks: { color: ct.tickColor, font: { size: 9 } } },
          y: { grid: { color: ct.gridColor }, ticks: { display: !state.privacyMode, color: ct.tickColor, font: { size: 9 }, callback: v => '€' + Math.round(Number(v)).toLocaleString('nl-BE') } },
        },
      },
    });
  } catch (e) {
    console.warn('Bonus chart load failed:', e.message);
  }
}

// ── Edit / add form (small dialog) ────────────────────────────────────────────

function openBonusEdit(existing = null) {
  // Close detail modal if open
  const posModal = document.getElementById('posModal');
  if (posModal?.open) posModal.close();

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
      <div id="bCallFields" style="display:${isCall?'flex':'none'};flex-direction:column;gap:12px;padding-top:4px;border-top:1px solid #1e293b">
        <div style="display:flex;gap:10px">
          <label style="${LBL};flex:2">Uitoefenprijs (strike)
            <input id="bStrike" type="number" value="${strikePrice}" placeholder="45.00" step="0.01" min="0" style="${INP}">
          </label>
          <label style="${LBL};flex:1">Ratio
            <input id="bRatio" type="number" value="${ratio}" placeholder="1" step="0.01" min="0.01" style="${INP}">
          </label>
        </div>
        <label style="${LBL}">Vervaldatum (optioneel)
          <input id="bExpiry" type="date" value="${expiryDate}" style="${INP}">
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
    };
  }

  document.getElementById('bSave').onclick = async () => {
    const type = dlg._bonusType;
    const strike = Number(document.getElementById('bStrike')?.value);
    if (type === 'call_option' && !strike) { alert('Vul de uitoefenprijs in.'); return; }
    const entry = {
      ...(id ? { id } : {}),
      label:      document.getElementById('bLabel').value.trim() || document.getElementById('bSymbol').value.trim(),
      symbol:     document.getElementById('bSymbol').value.trim(),
      quantity:   Number(document.getElementById('bQty').value),
      grantDate:  document.getElementById('bDate').value,
      grantPrice: Number(document.getElementById('bPrice').value),
      ...(type === 'call_option' && {
        type,
        strikePrice: strike,
        ratio: Number(document.getElementById('bRatio').value) || 1,
        expiryDate: document.getElementById('bExpiry').value || undefined,
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
  };
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function bonusCard(item) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const data     = state.intradayData[item.symbol];
  const pct      = item.changeSinceGrantPct ?? 0;
  const cls      = pct >= 0 ? 'c-pos' : 'c-neg';
  const sign     = pct >= 0 ? '+' : '';

  const hasToday  = data?.points?.length > 0 && data.previousClose && data.date === todayStr;
  const last      = hasToday ? data.points[data.points.length - 1].close : null;
  let todayPct;
  if (!hasToday) {
    todayPct = null;
  } else if (item.type === 'call_option') {
    // Show change in intrinsic value, not underlying % move
    const prevIntrinsic = Math.max(0, data.previousClose - item.strikePrice) * (item.ratio || 1);
    const currIntrinsic = Math.max(0, last - item.strikePrice) * (item.ratio || 1);
    todayPct = prevIntrinsic > 0
      ? (currIntrinsic - prevIntrinsic) / prevIntrinsic * 100
      : null; // was OTM at open — can't express as %
  } else {
    todayPct = (last - data.previousClose) / data.previousClose * 100;
  }
  let todaySub;
  if (todayPct === null) {
    todaySub = `<span>${sign}${pct.toFixed(2)}% v.a. toekenning</span>`;
  } else {
    const color = todayPct >= 0 ? '#4ade80' : '#f87171';
    const todaySign = todayPct >= 0 ? '+' : '';
    todaySub = `<span style="color:${color}">${todaySign}${todayPct.toFixed(2)}% vandaag</span>`;
  }

  const sparkline = data?.points?.length
    ? sparklineSVG(data.points, data.previousClose, 510)
    : '';

  const isCall = item.type === 'call_option';
  const tag    = isCall ? 'call optie' : 'bonus';
  const valueHtml = isCall && item.isOutOfMoney
    ? `<div style="display:flex;align-items:center;gap:6px;margin-top:5px">
        <span class="metric-value c-neg privacy-val" style="font-size:16px">${fmt(0)}</span>
        <span style="font-size:9px;color:#f87171;font-family:'JetBrains Mono',monospace;font-weight:700">OTM</span>
      </div>`
    : `<div class="metric-value ${cls} privacy-val" style="font-size:16px;margin-top:5px">${fmt(item.totalValue ?? 0)}</div>`;

  return `<div class="intraday-card" style="cursor:pointer" onclick="globalThis._showBonusDetail('${item.id}')">
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

  // Remove any previously injected bonus cards from the grid
  grid.querySelectorAll('.bonus-card').forEach(el => el.remove());

  // Append bonus cards directly into the intraday grid so they share the same row
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
  globalThis._showBonusDetail = (id) => {
    const item = state.bonusItems.find(b => b.id === id);
    if (item) showBonusDetail(item);
  };
  globalThis._openBonusEdit = (id) => {
    const item = id ? state.bonusItems.find(b => b.id === id) : null;
    openBonusEdit(item ?? null);
  };
}
