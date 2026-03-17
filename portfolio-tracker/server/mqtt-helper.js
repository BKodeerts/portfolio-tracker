/**
 * MQTT discovery integration for Portfolio Tracker.
 *
 * On first connect (and on every HA restart):
 *   - publishes MQTT discovery configs → HA registers proper entities with unique IDs,
 *     grouped under a single "Portfolio Tracker" device.
 *
 * On each scheduler run:
 *   - publishes a single JSON state payload to portfolio_tracker/state.
 *   - all sensors read from that one topic via value_template.
 *
 * Broker credentials are resolved in order:
 *   1. HA supervisor services API  (http://supervisor/services/mqtt)
 *   2. Manual options from /data/options.json  (mqtt_broker / mqtt_port / …)
 */

const mqtt = require('mqtt');
const { getOptions, readState, writeState, isWeekend, isMarketOpen } = require('./ha-helper.js');

const STATE_TOPIC        = 'portfolio_tracker/state';
const AVAILABILITY_TOPIC = 'portfolio_tracker/availability';
const DISCOVERY_PREFIX   = 'homeassistant';

const DEVICE = {
  identifiers:  ['portfolio_tracker'],
  name:         'Portfolio Tracker',
  model:        'Portfolio Tracker',
  manufacturer: 'Self-hosted',
};

// Singleton MQTT client — persists across scheduler ticks
let client            = null;
let discoveryPublished = false;
// Track which per-position slugs we've published discovery for, so we can
// clean up sensors for positions that have been closed.
let knownPositionSlugs = new Set();

// ── Broker credentials ────────────────────────────────────────────────────────

async function resolveBrokerCredentials(options) {
  // 1. Try HA supervisor services API (auto-discovery when Mosquitto is installed)
  const token = process.env.SUPERVISOR_TOKEN;
  if (token) {
    try {
      const r = await fetch('http://supervisor/services/mqtt', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        // Supervisor API wraps responses: { result: "ok", data: { host, port, ... } }
        const json = await r.json();
        const svc  = json.data ?? json;
        return {
          host:     svc.host,
          port:     svc.port     ?? 1883,
          username: svc.username ?? null,
          password: svc.password ?? null,
          ssl:      svc.ssl      ?? false,
        };
      }
      console.warn(`[MQTT] Supervisor services/mqtt returned ${r.status}`);

    } catch {
      // fall through to manual options
    }
  }

  // 2. Fall back to manually configured broker
  if (!options.mqttBroker) {
    throw new Error('MQTT broker not configured and supervisor auto-discovery failed');
  }
  return {
    host:     options.mqttBroker,
    port:     options.mqttPort     ?? 1883,
    username: options.mqttUsername ?? null,
    password: options.mqttPassword ?? null,
    ssl:      false,
  };
}

// ── Connection ────────────────────────────────────────────────────────────────

async function ensureConnected(options) {
  if (client?.connected) return client;

  // Clean up a broken client before reconnecting
  if (client) {
    try { await client.endAsync(true); } catch { /* ignore */ }
    client = null;
  }

  const creds    = await resolveBrokerCredentials(options);
  const protocol = creds.ssl ? 'mqtts' : 'mqtt';
  const url      = `${protocol}://${creds.host}:${creds.port}`;

  client = await mqtt.connectAsync(url, {
    clientId:  'portfolio_tracker',
    username:  creds.username ?? undefined,
    password:  creds.password ?? undefined,
    // Last Will: mark all entities unavailable if we disconnect
    will: {
      topic:   AVAILABILITY_TOPIC,
      payload: Buffer.from('offline'),
      qos:     1,
      retain:  true,
    },
    reconnectPeriod: 5000,
  });

  // Re-publish discovery whenever HA restarts
  client.on('message', (topic, payload) => {
    if (topic === `${DISCOVERY_PREFIX}/status` && payload.toString() === 'online') {
      console.log('[MQTT] HA restarted — will re-publish discovery configs');
      discoveryPublished = false;
    }
  });
  await client.subscribeAsync(`${DISCOVERY_PREFIX}/status`);

  // Mark all entities as available
  await client.publishAsync(AVAILABILITY_TOPIC, 'online', { retain: true });
  discoveryPublished = false;

  console.log(`[MQTT] Connected to ${url}`);
  return client;
}

// ── Discovery helpers ─────────────────────────────────────────────────────────

function sensorConfig(uniqueId, name, valueTemplate, extra = {}) {
  return {
    unique_id:          `portfolio_tracker_${uniqueId}`,
    name,
    state_topic:        STATE_TOPIC,
    value_template:     valueTemplate,
    availability_topic: AVAILABILITY_TOPIC,
    device:             DEVICE,
    ...extra,
  };
}

function binarySensorConfig(uniqueId, name, valueTemplate, extra = {}) {
  return sensorConfig(uniqueId, name, valueTemplate, {
    payload_on:  'true',
    payload_off: 'false',
    ...extra,
  });
}

async function publishDiscovery(mqttClient, options) {
  const pub = async (component, id, config) =>
    mqttClient.publishAsync(
      `${DISCOVERY_PREFIX}/${component}/portfolio_tracker_${id}/config`,
      JSON.stringify(config),
      { retain: true },
    );

  // ── Core sensors ───────────────────────────────────────────────────────────
  await pub('sensor', 'value', sensorConfig(
    'value', 'Portfolio Waarde',
    '{{ value_json.value }}',
    {
      unit_of_measurement:    '€',
      device_class:           'monetary',
      state_class:            'measurement',
      json_attributes_topic:  STATE_TOPIC,
      json_attributes_template: `{{
        {
          'cost_basis':      value_json.cost_basis,
          'pl_eur':          value_json.pl,
          'pl_pct':          value_json.pl_pct,
          'daily_pl':        value_json.daily_pl,
          'positions_count': value_json.positions_count,
          'top_mover':       value_json.top_mover,
          'bottom_mover':    value_json.bottom_mover,
          'peak_value':      value_json.peak_value,
          'drawdown_pct':    value_json.drawdown_pct,
          'market_status':   value_json.market_status,
          'last_updated':    value_json.last_updated
        } | tojson }}`,
    },
  ));

  await pub('sensor', 'pl', sensorConfig(
    'pl', 'Portfolio P&L',
    '{{ value_json.pl }}',
    { unit_of_measurement: '€', device_class: 'monetary', state_class: 'measurement' },
  ));

  await pub('sensor', 'pl_pct', sensorConfig(
    'pl_pct', 'Portfolio P&L %',
    '{{ value_json.pl_pct }}',
    { unit_of_measurement: '%', state_class: 'measurement' },
  ));

  await pub('sensor', 'daily_pl', sensorConfig(
    'daily_pl', 'Portfolio Vandaag',
    '{{ value_json.daily_pl }}',
    { unit_of_measurement: '€', device_class: 'monetary', state_class: 'measurement' },
  ));

  // ── Binary sensors ─────────────────────────────────────────────────────────
  await pub('binary_sensor', 'nyse_open', binarySensorConfig(
    'nyse_open', 'NYSE Open',
    '{{ value_json.nyse_open | string | lower }}',
    { device_class: 'connectivity' },
  ));

  await pub('binary_sensor', 'xetra_open', binarySensorConfig(
    'xetra_open', 'XETRA Open',
    '{{ value_json.xetra_open | string | lower }}',
    { device_class: 'connectivity' },
  ));

  await pub('binary_sensor', 'drawdown_warning', binarySensorConfig(
    'drawdown_warning', 'Portfolio Drawdown Alarm',
    '{{ value_json.drawdown_warning | string | lower }}',
    { device_class: 'problem' },
  ));

  if (options.targetValue > 0) {
    await pub('binary_sensor', 'target_hit', binarySensorConfig(
      'target_hit', 'Portfolio Doel Bereikt',
      '{{ value_json.target_hit | string | lower }}',
      { device_class: 'running' },
    ));
  }

  discoveryPublished = true;
  console.log('[MQTT] Discovery configs published');
}

async function publishPositionDiscovery(mqttClient, pos) {
  const slug      = pos.ticker.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
  const stateTopic = `portfolio_tracker/positions/${slug}/state`;

  await mqttClient.publishAsync(
    `${DISCOVERY_PREFIX}/sensor/portfolio_tracker_${slug}_value/config`,
    JSON.stringify({
      unique_id:             `portfolio_tracker_${slug}_value`,
      name:                  `${pos.label} Waarde`,
      state_topic:           stateTopic,
      value_template:        '{{ value_json.value }}',
      json_attributes_topic: stateTopic,
      availability_topic:    AVAILABILITY_TOPIC,
      unit_of_measurement:   '€',
      device_class:          'monetary',
      state_class:           'measurement',
      device:                DEVICE,
    }),
    { retain: true },
  );
  return slug;
}

async function removePositionDiscovery(mqttClient, slug) {
  // Empty payload removes the entity from HA discovery
  await mqttClient.publishAsync(
    `${DISCOVERY_PREFIX}/sensor/portfolio_tracker_${slug}_value/config`,
    '',
    { retain: true },
  );
}

// ── State publishing ──────────────────────────────────────────────────────────

function marketStatus() {
  if (isWeekend()) return 'weekend';
  if (isMarketOpen('NYSE') || isMarketOpen('XETRA')) return 'open';
  return 'closed';
}

async function publishState(mqttClient, snapshot, options) {
  const { totalValue, totalCost, dailyPl, positions } = snapshot;
  const totalPl    = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost * 100) : 0;

  // Update rolling peak
  const state = readState();
  if (totalValue > (state.peak || 0)) {
    state.peak     = totalValue;
    state.peakDate = new Date().toISOString().slice(0, 10);
    writeState(state);
  }
  const peak        = state.peak || totalValue;
  const drawdownPct = Math.max(0, (peak - totalValue) / peak * 100);

  const byPlPct = [...positions].sort((a, b) => b.plPct - a.plPct);
  const fmt1    = p => `${p.ticker} (${p.plPct >= 0 ? '+' : ''}${p.plPct.toFixed(1)}%)`;

  const payload = {
    value:            +totalValue.toFixed(2),
    cost_basis:       +totalCost.toFixed(2),
    pl:               +totalPl.toFixed(2),
    pl_pct:           +totalPlPct.toFixed(2),
    daily_pl:         isWeekend() ? null : +(dailyPl || 0).toFixed(2),
    positions_count:  positions.length,
    top_mover:        byPlPct[0]     ? fmt1(byPlPct[0])     : '',
    bottom_mover:     byPlPct.at(-1) ? fmt1(byPlPct.at(-1)) : '',
    peak_value:       +peak.toFixed(2),
    drawdown_pct:     +drawdownPct.toFixed(2),
    nyse_open:        isMarketOpen('NYSE'),
    xetra_open:       isMarketOpen('XETRA'),
    drawdown_warning: drawdownPct >= options.drawdownAlertPct,
    target_hit:       options.targetValue > 0 && totalValue >= options.targetValue,
    market_status:    marketStatus(),
    last_updated:     new Date().toISOString(),
  };

  await mqttClient.publishAsync(STATE_TOPIC, JSON.stringify(payload), { retain: true });

  // Per-position sensors
  if (options.pushPositions) {
    const currentSlugs = new Set();
    for (const pos of positions) {
      const slug = await publishPositionDiscovery(mqttClient, pos);
      currentSlugs.add(slug);

      const stateTopic = `portfolio_tracker/positions/${slug}/state`;
      const posPayload = {
        value:  +pos.value.toFixed(2),
        cost:   +(pos.cost   ?? 0).toFixed(2),
        pl:     +pos.pl.toFixed(2),
        pl_pct: +pos.plPct.toFixed(2),
        shares: pos.shares ?? 0,
        ticker: pos.ticker,
      };
      await mqttClient.publishAsync(stateTopic, JSON.stringify(posPayload), { retain: true });
    }

    // Remove discovery for positions that no longer exist
    for (const oldSlug of knownPositionSlugs) {
      if (!currentSlugs.has(oldSlug)) {
        await removePositionDiscovery(mqttClient, oldSlug);
      }
    }
    knownPositionSlugs = currentSlugs;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function publish(snapshot, options) {
  const mqttClient = await ensureConnected(options);

  if (!discoveryPublished) {
    await publishDiscovery(mqttClient, options);
  }

  await publishState(mqttClient, snapshot, options);
}

module.exports = { publish };
