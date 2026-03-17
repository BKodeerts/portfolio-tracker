/**
 * Background HA sensor push scheduler.
 * Interval and behaviour controlled via /data/options.json (HA addon options).
 *
 * Routing:
 *   enable_ha_sensors: false          →  skip entirely
 *   use_mqtt_discovery: true          →  MQTT discovery (proper unique IDs, grouped device)
 *   use_mqtt_discovery: false         →  States API push (simpler, no MQTT required)
 *   intraday_during_market_hours: true →  faster push interval while any exchange is open
 */

const { computeCurrentSnapshot } = require('./portfolio.js');
const { getOptions, pushAll, isMarketOpen } = require('./ha-helper.js');

async function runOnce() {
  const options = getOptions();

  if (!options.enableHaSensors) return;

  try {
    const snapshot = await computeCurrentSnapshot({ watchlist: options.watchlist });
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

  if (options.useMqttDiscovery) {
    const hasSupervisor   = Boolean(process.env.SUPERVISOR_TOKEN);
    const hasManualBroker = Boolean(options.mqttBroker);
    if (!hasSupervisor && !hasManualBroker) {
      console.log('[Scheduler] MQTT mode: no SUPERVISOR_TOKEN and no mqtt_broker configured — HA push disabled');
      return;
    }
  } else if (!process.env.SUPERVISOR_TOKEN) {
    console.log('[Scheduler] States API mode: no SUPERVISOR_TOKEN — HA push disabled');
    return;
  }

  const normalIntervalMs   = options.pushInterval * 60 * 1000;
  const intradayIntervalMs = Math.min(normalIntervalMs, 5 * 60 * 1000);

  if (options.intradayDuringMarketHours) {
    // 1-minute heartbeat; effective push interval adapts to market hours
    let lastRun = 0;
    const tick = () => {
      const marketOpen   = isMarketOpen('NYSE') || isMarketOpen('XETRA');
      const effectiveMs  = marketOpen ? intradayIntervalMs : normalIntervalMs;
      if (Date.now() - lastRun >= effectiveMs) {
        lastRun = Date.now();
        runOnce();
      }
    };
    setTimeout(runOnce, 2_000);
    setInterval(tick, 60_000);
    console.log(
      `[Scheduler] HA sensor push: ${options.pushInterval} min (market closed) / ` +
      `${intradayIntervalMs / 60000} min (market open) via ${options.useMqttDiscovery ? 'MQTT discovery' : 'states API'}`,
    );
  } else {
    setTimeout(runOnce, 2_000);
    setInterval(runOnce, normalIntervalMs);
    const mode = options.useMqttDiscovery ? 'MQTT discovery' : 'states API';
    console.log(`[Scheduler] HA sensor push every ${options.pushInterval} min via ${mode}`);
  }
}

module.exports = { start };
