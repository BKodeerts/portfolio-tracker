import { state } from '../state.js';
import { getColor } from '../utils.js';
import { chartTheme, fmt } from '../utils.js';
import Chart from 'chart.js/auto';

export function renderDonutChart(latest, canvasId) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const tickers = state.CURRENT_TICKERS.filter(t => (latest[t] || 0) > 0);
  const values  = tickers.map(t => latest[t] || 0);
  const total   = values.reduce((a, b) => a + b, 0);

  const legendEl = document.getElementById(canvasId + 'Legend');
  if (legendEl) {
    legendEl.innerHTML = tickers.map((t, i) => {
      const pct = total > 0 ? (values[i] / total * 100) : 0;
      return `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${getColor(t)}"></span>
        <span class="donut-legend-ticker">${t}</span>
        <span class="donut-legend-pct">${pct.toFixed(1)}%</span>
        <span class="donut-legend-val privacy-val">${fmt(values[i])}</span>
      </div>`;
    }).join('');
  }

  const instKey = canvasId === 'homeDonut' ? 'homeDonut' : 'donut';
  state.chartInstances[instKey] = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: tickers,
      datasets: [{ data: values, backgroundColor: tickers.map(t => getColor(t)), borderColor: chartTheme().donutBorder, borderWidth: 2, hoverOffset: 5 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme().tooltipBg, borderColor: chartTheme().tooltipBorder, borderWidth: 1,
          bodyColor: chartTheme().bodyColor, bodyFont: { family: "'JetBrains Mono'", size: 11 }, padding: 12, cornerRadius: 10,
          callbacks: { label: item => ` ${item.label}: ${state.privacyMode ? '●●●' : fmt(item.raw)} (${((item.raw / total) * 100).toFixed(1)}%)` },
        },
      },
    },
  });
}
