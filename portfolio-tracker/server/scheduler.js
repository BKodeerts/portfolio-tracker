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
const { fetchIntraday, sleep, FETCH_DELAY } = require('./yahoo.js');
const { readCache, writeCache } = require('./cache.js');
const fs   = require('node:fs');
const path = require('node:path');

const TRANSACTIONS_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'transactions.json');
const TICKER_META_FILE  = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'ticker_meta.json');

async function writeEodCache() {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) return;
    const transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
    const meta = fs.existsSync(TICKER_META_FILE)
      ? JSON.parse(fs.readFileSync(TICKER_META_FILE, 'utf8'))
      : {};
    const yahooSymbols = [...new Set(transactions.map(t => meta[t.ticker]?.yahoo || t.yahoo || t.ticker).filter(Boolean))];
    if (!yahooSymbols.length) return;
    const today = new Date().toLocaleDateString('sv-SE');
    for (let i = 0; i < yahooSymbols.length; i++) {
      const sym = yahooSymbols[i];
      const existing = readCache(`eod_intraday_${sym}`, 24 * 60 * 60 * 1000);
      if (existing?.date === today) continue; // already written for today
      try {
        const data = await fetchIntraday(sym);
        if (data?.marketState === 'CLOSED') {
          writeCache(`eod_intraday_${sym}`, data);
          console.log(`[EOD] Cached full session for ${sym}`);
        }
      } catch (e) {
        console.warn(`[EOD] Failed for ${sym}:`, e.message);
      }
      if (i < yahooSymbols.length - 1) await sleep(FETCH_DELAY);
    }
  } catch (e) {
    console.warn('[EOD] writeEodCache failed:', e.message);
  }
}

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

// Always-on EOD writer: fires once daily at 22:00 UTC (well after US close at 20:00-21:00 UTC).
function startEodWriter() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const msUntil = next - now;
    setTimeout(() => { writeEodCache(); scheduleNext(); }, msUntil);
    console.log(`[EOD] Next EOD cache write scheduled in ${Math.round(msUntil / 60000)} min`);
  }
  scheduleNext();
}

module.exports = { start, startEodWriter };
