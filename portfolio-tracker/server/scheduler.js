/**
 * Background HA sensor push scheduler.
 * Runs on the server, no browser needed.
 * Interval controlled by HA_PUSH_INTERVAL env var (minutes, default 15).
 */

const { computeCurrentSnapshot } = require('./portfolio.js');

async function pushToHA(portfolio) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return;

  const { totalValue, totalCost } = portfolio;
  const base    = 'http://supervisor/core/api/states';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function pushState(entity, value, attributes) {
    const r = await fetch(`${base}/${entity}`, {
      method: 'POST', headers,
      body: JSON.stringify({ state: String(value), attributes }),
    });
    if (!r.ok) throw new Error(`${entity}: HTTP ${r.status}`);
  }

  const totalPl    = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost * 100) : 0;

  await pushState('sensor.portfolio_pl', totalPl.toFixed(2), {
    unit_of_measurement: '€', friendly_name: 'Portfolio P&L',
  });
  await pushState('sensor.portfolio_pl_pct', totalPlPct.toFixed(2), {
    unit_of_measurement: '%', friendly_name: 'Portfolio P&L %',
  });

  console.log(`[Scheduler] HA push OK — P&L €${totalPl.toFixed(0)} (${totalPlPct.toFixed(1)}%)`);
}

async function runOnce() {
  try {
    const portfolio = await computeCurrentSnapshot();
    if (!portfolio) return;
    await pushToHA(portfolio);
  } catch (e) {
    console.warn('[Scheduler] run failed:', e.message);
  }
}

function start() {
  if (!process.env.SUPERVISOR_TOKEN) {
    console.log('[Scheduler] No SUPERVISOR_TOKEN — HA push disabled');
    return;
  }

  const intervalMin = Number.parseInt(process.env.HA_PUSH_INTERVAL, 10) || 15;
  const intervalMs  = intervalMin * 60 * 1000;

  setTimeout(runOnce, 15_000);
  setInterval(runOnce, intervalMs);

  console.log(`[Scheduler] HA sensor push every ${intervalMin} min`);
}

module.exports = { start };
