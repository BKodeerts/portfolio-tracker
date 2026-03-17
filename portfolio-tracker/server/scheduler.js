/**
 * Background HA sensor push scheduler.
 * Interval and behaviour controlled via /data/options.json (HA addon options).
 *
 * Routing:
 *   enable_ha_sensors: false  →  skip entirely
 *   use_mqtt_discovery: true  →  MQTT discovery (proper unique IDs, grouped device)
 *   use_mqtt_discovery: false →  States API push (simpler, no MQTT required)
 */

const { computeCurrentSnapshot } = require('./portfolio.js');
const { getOptions, pushAll }     = require('./ha-helper.js');

async function runOnce() {
  const options = getOptions();

  if (!options.enableHaSensors) return;

  try {
    const snapshot = await computeCurrentSnapshot();
    if (!snapshot) return;

    if (options.useMqttDiscovery) {
      await require('./mqtt-helper.js').publish(snapshot, options);
    } else {
      const token = process.env.SUPERVISOR_TOKEN;
      if (!token) {
        console.warn('[Scheduler] States API mode requires SUPERVISOR_TOKEN');
        return;
      }
      await pushAll(token, snapshot, options);
    }

    const { totalValue, totalCost, dailyPl } = snapshot;
    const pl    = totalValue - totalCost;
    const plPct = totalCost > 0 ? (pl / totalCost * 100) : 0;
    const mode  = options.useMqttDiscovery ? 'MQTT' : 'states API';
    console.log(
      `[Scheduler] HA push OK (${mode}) — ` +
      `€${totalValue.toFixed(0)}, P&L €${pl.toFixed(0)} (${plPct.toFixed(1)}%), ` +
      `vandaag €${(dailyPl || 0).toFixed(0)}`,
    );
  } catch (e) {
    console.warn('[Scheduler] run failed:', e.message);
  }
}

function start() {
  const options = getOptions();

  if (!options.enableHaSensors) {
    console.log('[Scheduler] HA sensors disabled — push skipped');
    return;
  }

  if (!options.useMqttDiscovery && !process.env.SUPERVISOR_TOKEN) {
    console.log('[Scheduler] No SUPERVISOR_TOKEN and MQTT not enabled — HA push disabled');
    return;
  }

  const intervalMs = options.pushInterval * 60 * 1000;

  // Push immediately on startup (2 s delay to let server and cache settle)
  setTimeout(runOnce, 2_000);
  setInterval(runOnce, intervalMs);

  const mode = options.useMqttDiscovery ? 'MQTT discovery' : 'states API';
  console.log(`[Scheduler] HA sensor push every ${options.pushInterval} min via ${mode}`);
}

module.exports = { start };
