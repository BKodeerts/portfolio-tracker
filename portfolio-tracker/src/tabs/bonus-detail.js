import { state } from '../state.js';
import { fetchBonusHistory } from '../api.js';
import { fmt, chartTheme } from '../utils.js';
import { renderAppHeader } from '../components/header.js';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

let _chartInst = null;
let _histData  = null;
let _showPrior = true;

export function setBonusDetailShowPrior(v) {
  _showPrior = Boolean(v);
  _redrawChart();
}

export async function renderBonusDetail() {
  const id   = state.selectedBonusId;
  const item = id && state.bonusItems.find(b => b.id === id);
  if (!item) return;

  if (_chartInst) { _chartInst.destroy(); _chartInst = null; }
  _histData  = null;
  _showPrior = true;

  const isCall       = item.type === 'call_option';
  const pct          = item.changeSinceGrantPct ?? 0;
  const pctCls       = pct >= 0 ? 'c-pos' : 'c-neg';
  const sign         = pct >= 0 ? '+' : '';
  const priceChange  = (item.currentWarrantPrice ?? item.grantPrice) - item.grantPrice;
  const priceCls     = priceChange >= 0 ? 'c-pos' : 'c-neg';
  const priceSign    = priceChange >= 0 ? '+' : '';
  const intrinsic    = isCall && item.currentIndexPrice && item.strikePrice
    ? Math.max(0, item.currentIndexPrice - item.strikePrice) * (item.ratio || 1)
    : 0;
  const timeValue    = isCall ? (item.currentWarrantPrice ?? 0) - intrinsic : 0;
  const daysToExpiry = isCall && item.expiryDate
    ? Math.max(0, Math.round((new Date(item.expiryDate) - Date.now()) / 86_400_000))
    : null;
  const sigmaNum     = item.sigmaUsed ?? item.volatility ?? null;
  const sigmaLabel   = sigmaNum == null
    ? '—'
    : item.volatility
      ? `${sigmaNum}%`
      : `${sigmaNum}%<span style="font-size:9px;color:#888"> (VSTOXX)</span>`;

  const stat = (label, val, sub = '', cls2 = '') => `
    <div class="pos-modal-stat">
      <div class="pos-modal-stat-label">${label}</div>
      <div class="pos-modal-stat-val ${cls2}">${val}</div>
      ${sub ? `<div class="pos-modal-stat-sub ${cls2}">${sub}</div>` : ''}
    </div>`;

  const baseStats = [
    stat(isCall ? 'Aantal opties' : 'Aantal warrants', `<span class="privacy-val">${item.quantity}</span>`),
    stat('Toekenningsdatum', item.grantDate),
    stat('Toekenningsprijs',
      `€${item.grantPrice.toFixed(2)}${isCall && item.grantIndexPrice
        ? `<span style="font-size:10px;color:#888"> (idx: ${item.grantIndexPrice.toFixed(2)})</span>`
        : ''}`),
    stat('Huidige prijs',
      `€${(item.currentWarrantPrice ?? item.grantPrice).toFixed(2)}${isCall && item.currentIndexPrice
        ? `<span style="font-size:10px;color:#888"> (${item.currentIndexPrice.toFixed(2)})</span>`
        : ''}`,
      `${priceSign}€${Math.abs(priceChange).toFixed(2)}`, priceCls),
    stat('Totale waarde',
      `<span class="privacy-val">${fmt(item.totalValue ?? 0)}</span>`,
      `${sign}${pct.toFixed(2)}% v.a. toekenning`, pctCls),
  ].join('');

  const callStats = isCall ? [
    stat('Uitoefenprijs',
      `€${item.strikePrice?.toFixed(2) ?? '—'}${(item.ratio && item.ratio !== 1)
        ? `<span style="font-size:10px;color:#888"> ×${item.ratio}</span>`
        : ''}`,
      item.isOutOfMoney ? 'out of the money' : 'in the money ✓',
      item.isOutOfMoney ? 'c-neg' : 'c-pos'),
    intrinsic > 0 ? stat('Intrinsieke waarde', `€${intrinsic.toFixed(2)}`) : '',
    stat('Tijdswaarde', `€${timeValue.toFixed(2)}`),
    item.expiryDate
      ? stat('Vervaldatum', item.expiryDate,
          daysToExpiry !== null ? `${daysToExpiry} dagen resterend` : '')
      : '',
    stat('Volatiliteit σ', sigmaLabel),
    item.riskFreeRate != null
      ? stat('Risicovrije rente', `${(item.riskFreeRate * 100).toFixed(1)}%`)
      : '',
  ].join('') : '';

  const taxCard = item.vatGross != null ? `
    <div class="chart-card bd-tax-card">
      <div class="card-title" style="color:#f59e0b">Belgische fiscaliteit (VAA / ATN)</div>
      <div class="pos-modal-stats">
        ${stat('Belastbare grondslag', fmt(item.vatGross), `${item.quantity} × €${item.grantPrice?.toFixed(2)}`)}
        ${stat(`Bedrijfsvoorheffing ${item.taxRate ?? 53.5}%`, '−' + fmt(item.vatTax), `belastbaar op ${item.taxableDate}`, 'c-neg')}
        ${stat('Netto optiewaarde na BV', fmt(item.netValue ?? 0), '', (item.netValue ?? 0) >= 0 ? 'c-pos' : 'c-neg')}
      </div>
    </div>` : '';

  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="bonus-detail-page">

      <div class="bonus-detail-topbar">
        <button class="bd-back-btn" onclick="globalThis._bonusDetailBack()">← Terug</button>
        <button class="btn" style="font-size:11px;padding:5px 12px" onclick="globalThis._openBonusEdit('${item.id}')">Bewerken</button>
      </div>

      <div class="bd-header">
        <div class="bd-header-id">
          <span class="pos-dot" style="background:#a78bfa;width:11px;height:11px;flex-shrink:0"></span>
          <span class="bd-label">${item.label}</span>
        </div>
        <div class="bd-badges">
          <span class="bd-type-tag">${isCall ? 'call optie' : 'warrant'}</span>
          ${isCall && item.isOutOfMoney ? '<span class="bd-otm-tag">OTM</span>' : ''}
        </div>
        <div class="bd-total-value privacy-val">${fmt(item.totalValue ?? 0)}</div>
        <div class="bd-meta-row">
          <span class="bd-grant-change ${pctCls}">${sign}${pct.toFixed(2)}%</span>
          <span class="bd-grant-label">v.a. toekenning</span>
          ${item.currentIndexPrice ? `
            <span class="bd-meta-sep">·</span>
            <span class="bd-underlying-symbol">${item.symbol}</span>
            <span class="bd-underlying-price">€${item.currentIndexPrice.toFixed(2)}</span>
          ` : `<span class="bd-meta-sep">·</span><span class="bd-underlying-symbol">${item.symbol}</span>`}
        </div>
      </div>

      <div class="chart-card bd-chart-card">
        <div class="bd-chart-header">
          <span class="bd-chart-title">Historische waarde</span>
          <label class="bd-prior-toggle" id="bdPriorToggle" style="display:none">
            <input type="checkbox" checked onchange="globalThis._setBonusDetailPrior(this.checked)">
            Vorig jaar
          </label>
        </div>
        <div id="bonusDetailChartWrap" style="height:280px;position:relative">
          <div class="sd-chart-msg">Laden…</div>
        </div>
      </div>

      <div class="chart-card" style="margin-bottom:12px">
        <div class="card-title">Instrument</div>
        <div class="pos-modal-stats">
          ${baseStats}
          ${callStats}
        </div>
      </div>

      ${taxCard}

    </div>`;

  try {
    const json = await fetchBonusHistory(item.id);
    if (json.status === 'ok' && json.data.points.length) {
      _histData = json.data;
      // Show prior-year toggle only when that data exists
      const hasPrior = _histData.priorPoints?.length > 0;
      const toggle = document.getElementById('bdPriorToggle');
      if (toggle && hasPrior) toggle.style.display = '';
      _redrawChart();
    } else {
      _showChartMsg('Geen historische data beschikbaar');
    }
  } catch (e) {
    _showChartMsg(`Fout bij laden: ${e.message}`);
  }
}

function _showChartMsg(msg) {
  const wrap = document.getElementById('bonusDetailChartWrap');
  if (wrap) wrap.innerHTML = `<div class="sd-chart-msg">${msg}</div>`;
}

function _redrawChart() {
  if (!_histData) return;
  if (_chartInst) { _chartInst.destroy(); _chartInst = null; }

  const wrap = document.getElementById('bonusDetailChartWrap');
  if (!wrap) return;
  wrap.innerHTML = '<canvas id="bonusDetailChart"></canvas>';

  const canvas = document.getElementById('bonusDetailChart');
  if (!canvas) return;

  const ct      = chartTheme();
  const toPoint = p => ({ x: new Date(p.date), y: p.value });

  const datasets = [
    {
      data: _histData.points.map(toPoint),
      borderColor: '#a78bfa', borderWidth: 2,
      fill: true, backgroundColor: '#a78bfa22',
      tension: 0.3, pointRadius: 0,
    },
  ];

  if (_showPrior && _histData.priorPoints?.length) {
    datasets.push({
      data: _histData.priorPoints.map(toPoint),
      borderColor: '#a78bfa55', borderWidth: 1.5,
      fill: false, tension: 0.3, pointRadius: 0,
      borderDash: [4, 3],
    });
  }

  _chartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1,
          titleColor: ct.titleColor, bodyColor: ct.bodyColor,
          titleFont: { family: "'DM Sans'", size: 11, weight: 700 },
          bodyFont: { family: "'JetBrains Mono'", size: 11 },
          padding: 10, cornerRadius: 8,
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }),
            label: i => {
              const v = `€${Number(i.parsed.y).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return i.datasetIndex === 1 ? ` vorig jaar: ${v}` : ` ${v}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month' },
          grid: { color: ct.gridColor },
          ticks: { color: ct.tickColor, font: { size: 9 } },
        },
        y: {
          position: 'right',
          grid: { color: ct.gridColor },
          ticks: {
            display: !state.privacyMode,
            color: ct.tickColor,
            font: { size: 9 },
            callback: v => '€' + Number(v).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          },
        },
      },
    },
  });
}
