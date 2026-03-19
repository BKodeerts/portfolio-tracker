import { state } from '../state.js';
import { fetchBonus, saveBonus, deleteBonus, fetchBatch } from '../api.js';
import { sparklineSVG } from './intraday.js';
import { fmt, chartTheme } from '../utils.js';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

// ── Detail modal (reuses #posModal + pos-modal-inner styling) ─────────────────

async function showBonusDetail(item) {
  const pct   = item.changeSinceGrantPct ?? 0;
  const cls   = pct >= 0 ? 'c-pos' : 'c-neg';
  const sign  = pct >= 0 ? '+' : '';
  const priceChange = (item.currentWarrantPrice ?? item.grantPrice) - item.grantPrice;
  const priceCls  = priceChange >= 0 ? 'c-pos' : 'c-neg';
  const priceSign = priceChange >= 0 ? '+' : '';

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
        <div class="pos-modal-stat-label">Aantal warrants</div>
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
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Index bij toekenning</div>
        <div class="pos-modal-stat-val">${item.grantIndexPrice?.toFixed(0) ?? '—'}</div>
      </div>
      <div class="pos-modal-stat">
        <div class="pos-modal-stat-label">Index nu</div>
        <div class="pos-modal-stat-val">${item.currentIndexPrice?.toFixed(0) ?? '—'}</div>
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
    if (!currentFirst || !priorFirst) return;

    const currentStartY = item.quantity * item.grantPrice * (currentFirst.close / item.grantIndexPrice);

    const toPoint = (c, shiftYears = 0) => {
      const d = new Date(c.date);
      if (shiftYears) d.setFullYear(d.getFullYear() + shiftYears);
      return { x: d, y: item.quantity * item.grantPrice * (c.close / item.grantIndexPrice) };
    };
    const toPriorPoint = c => {
      const d = new Date(c.date);
      d.setFullYear(d.getFullYear() + 1);
      return { x: d, y: currentStartY * (c.close / priorFirst.close) };
    };

    const points        = current.map(c => toPoint(c));
    const priorPoints   = priorOverlap.map(toPriorPoint);
    // Prepend last overlap point so forecast line connects seamlessly
    const fcastPoints   = [
      ...(priorOverlap.length ? [toPriorPoint(priorOverlap[priorOverlap.length - 1])] : []),
      ...priorFcast.map(toPriorPoint),
    ];

    state.chartInstances.__posModal = new Chart(document.getElementById('posModalChart').getContext('2d'), {
      type: 'line',
      data: { datasets: [
        { data: points,       borderColor: '#a78bfa',   borderWidth: 2,   fill: true,  backgroundColor: '#a78bfa22', tension: 0.3, pointRadius: 0 },
        { data: priorPoints,  borderColor: '#a78bfa55', borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0, borderDash: [4, 3] },
        { data: fcastPoints,  borderColor: '#a78bfa33', borderWidth: 1,   fill: false, tension: 0.3, pointRadius: 0, borderDash: [2, 5] },
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

  const id         = existing?.id         || '';
  const label      = existing?.label      || '';
  const symbol     = existing?.symbol     || '^STOXX50E';
  const quantity   = existing?.quantity   || '';
  const grantDate  = existing?.grantDate  || '';
  const grantPrice = existing?.grantPrice || 10;

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
      <label style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Naam
        <input id="bLabel" value="${label}" placeholder="Warrants EuroStoxx" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
      </label>
      <label style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Yahoo volgindex
        <input id="bSymbol" value="${symbol}" placeholder="^STOXX50E" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
      </label>
      <div style="display:flex;gap:10px">
        <label style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em;flex:1">Aantal
          <input id="bQty" type="number" value="${quantity}" placeholder="250" step="1" min="1" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
        </label>
        <label style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em;flex:1">Prijs bij toekenning
          <input id="bPrice" type="number" value="${grantPrice}" placeholder="10" step="0.01" min="0.01" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
        </label>
      </div>
      <label style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Toekenningsdatum
        <input id="bDate" type="date" value="${grantDate}" style="display:block;width:100%;margin-top:4px;box-sizing:border-box">
      </label>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      ${existing ? `<button class="btn" id="bDelete" style="margin-right:auto;color:#ef4444">Verwijderen</button>` : ''}
      <button class="btn" onclick="document.getElementById('bonusEditDlg').close()">Annuleren</button>
      <button class="btn success" id="bSave">Opslaan</button>
    </div>
  </div>`;

  dlg.showModal();
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };

  if (existing) {
    document.getElementById('bDelete').onclick = async () => {
      await deleteBonus(existing.id);
      dlg.close();
      await reloadBonusCards();
    };
  }

  document.getElementById('bSave').onclick = async () => {
    const entry = {
      ...(id ? { id } : {}),
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
  const todayPct  = hasToday ? (last - data.previousClose) / data.previousClose * 100 : null;
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

  return `<div class="intraday-card" style="cursor:pointer" onclick="globalThis._showBonusDetail('${item.id}')">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:#888;margin-bottom:2px">
      <span class="pos-dot" style="background:#a78bfa"></span>${item.label}
      <span style="font-size:9px;color:#a78bfa;font-family:'JetBrains Mono',monospace;margin-left:auto">bonus</span>
    </div>
    <div class="metric-value ${cls} privacy-val" style="font-size:16px;margin-top:5px">${fmt(item.totalValue ?? 0)}</div>
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
  const grid    = document.getElementById('intradayGrid');
  const addLink = document.getElementById('bonusAddLink');
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
  grid.appendChild(fragment);

  if (addLink) {
    addLink.innerHTML = `<button onclick="globalThis._openBonusEdit(null)" style="background:none;border:none;cursor:pointer;font-size:11px;color:#64748b;padding:2px 4px">＋ bonus toevoegen</button>`;
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
