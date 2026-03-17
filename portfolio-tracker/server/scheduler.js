/**
 * Background HA sensor push scheduler.
 * Interval and behaviour controlled via /data/options.json (HA addon options).
 */

const { computeCurrentSnapshot } = require('./portfolio.js');
const { getOptions, pushAll }     = require('./ha-helper.js');

async function runOnce() {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return;

  try {
    const snapshot = await computeCurrentSnapshot();
    if (!snapshot) return;

    const options = getOptions();
    const pushed  = await pushAll(token, snapshot, options);

    const { totalValue, totalCost, dailyPl } = snapshot;
    const pl    = totalValue - totalCost;
    const plPct = totalCost > 0 ? (pl / totalCost * 100) : 0;
    console.log(
      `[Scheduler] HA push OK (${pushed} entities) — ` +
      `€${totalValue.toFixed(0)}, P&L €${pl.toFixed(0)} (${plPct.toFixed(1)}%), ` +
      `vandaag €${(dailyPl || 0).toFixed(0)}`,
    );
  } catch (e) {
    console.warn('[Scheduler] run failed:', e.message);
  }
}

function start() {
  if (!process.env.SUPERVISOR_TOKEN) {
    console.log('[Scheduler] No SUPERVISOR_TOKEN — HA push disabled');
    return;
  }

  const options    = getOptions();
  const intervalMs = options.pushInterval * 60 * 1000;

  // Push immediately on startup (2 s delay to let the server and cache settle)
  setTimeout(runOnce, 2_000);
  setInterval(runOnce, intervalMs);

  console.log(`[Scheduler] HA sensor push every ${options.pushInterval} min`);
}

module.exports = { start };
