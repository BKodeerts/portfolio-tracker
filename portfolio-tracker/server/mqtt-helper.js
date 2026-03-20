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
const DRAWDOWN_CMD_TOPIC = 'portfolio_tracker/drawdown_threshold/set';

const DEVICE = {
  identifiers:  ['portfolio_tracker'],
  name:         'Portfolio Tracker',
  model:        'Portfolio Tracker',
  manufacturer: 'Self-hosted',
};

let client             = null;
let discoveryPublished = false;
let knownPositionSlugs = new Set();
let knownWatchSlugs    = new Set();

// Runtime override for drawdown threshold (set via MQTT number entity)
let runtimeDrawdownPct = null;

// ── Broker credentials ────────────────────────────────────────────────────────

async function resolveBrokerCredentials(options) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (token) {
    try {
      const r = await fetch('http://supervisor/services/mqtt', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
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
    will: {
      topic:   AVAILABILITY_TOPIC,
      payload: Buffer.from('offline'),
      qos:     1,
      retain:  true,
    },
    reconnectPeriod: 5000,
  });

  client.on('message', (topic, payload) => {
    if (topic === `${DISCOVERY_PREFIX}/status` && payload.toString() === 'online') {
      console.log('[MQTT] HA restarted — will re-publish discovery configs');
      discoveryPublished = false;
    }
    if (topic === DRAWDOWN_CMD_TOPIC) {
      const val = Number(payload.toString());
      if (val >= 1 && val <= 50) {
        runtimeDrawdownPct = val;
        console.log(`[MQTT] Drawdown threshold updated to ${val}%`);
      }
    }
  });

  await client.subscribeAsync(`${DISCOVERY_PREFIX}/status`);
  await client.subscribeAsync(DRAWDOWN_CMD_TOPIC);
  await client.publishAsync(AVAILABILITY_TOPIC, 'online', { retain: true });
  discoveryPublished = false;

  console.log(`[MQTT] Connected to ${url}`);
  return client;
}

// ── Discovery helpers ─────────────────────────────────────────────────────────

function sensorConfig(uniqueId, name, valueTemplate, extra = {}) {
  return {
    unique_id:          `portfolio_tracker_${uniqueId}`,
    object_id:          `portfolio_${uniqueId}`,
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

  // ── Core sensors ────────────────────────────────────────────────────────────
  await pub('sensor', 'value', sensorConfig(
    'value', 'Portfolio Waarde',
    '{{ value_json.value }}',
    {
      unit_of_measurement:      '€',
      device_class:             'monetary',
      state_class:              'measurement',
      json_attributes_topic:    STATE_TOPIC,
      json_attributes_template: `{{
        {
          'cost_basis':         value_json.cost_basis,
          'pl_eur':             value_json.unrealized_pl,
          'pl_pct':             value_json.pl_pct,
          'daily_pl':           value_json.daily_pl,
          'positions_count':    value_json.positions_count,
          'top_mover':          value_json.top_mover,
          'bottom_mover':       value_json.bottom_mover,
          'peak_value':         value_json.peak_value,
          'drawdown_pct':       value_json.drawdown_pct,
          'market_status':      value_json.market_status,
          'usd_exposure_pct':   value_json.usd_exposure_pct,
          'last_updated':       value_json.last_updated
        } | tojson }}`,
    },
  ));

  await pub('sensor', 'pl', sensorConfig(
    'pl', 'Portfolio Ongerealiseerd P&L',
    '{{ value_json.unrealized_pl }}',
    { unit_of_measurement: '€', device_class: 'monetary', state_class: 'measurement' },
  ));

  await pub('sensor', 'realized_pl', sensorConfig(
    'realized_pl', 'Portfolio Gerealiseerd P&L',
    '{{ value_json.realized_pl }}',
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
    {
      unit_of_measurement: '€', device_class: 'monetary', state_class: 'measurement',
      json_attributes_topic:    STATE_TOPIC,
      json_attributes_template: `{{ {'last_market_close_date': value_json.last_market_close_date} | tojson }}`,
    },
  ));

  await pub('sensor', 'daily_pl_pct', sensorConfig(
    'daily_pl_pct', 'Portfolio Vandaag %',
    '{{ value_json.daily_pl_pct }}',
    { unit_of_measurement: '%', state_class: 'measurement' },
  ));

  await pub('sensor', 'usd_exposure', sensorConfig(
    'usd_exposure', 'Portfolio USD Blootstelling',
    '{{ value_json.usd_exposure_pct }}',
    { unit_of_measurement: '%', state_class: 'measurement' },
  ));

  await pub('sensor', 'health', sensorConfig(
    'health', 'Portfolio Gezondheid',
    '{{ value_json.health_score }}',
    { state_class: 'measurement' },
  ));

  await pub('sensor', 'twr', sensorConfig(
    'twr', 'Portfolio TWR',
    '{{ value_json.twr_pct }}',
    { unit_of_measurement: '%', state_class: 'measurement' },
  ));

  await pub('sensor', 'irr', sensorConfig(
    'irr', 'Portfolio IRR',
    '{{ value_json.irr_pct }}',
    { unit_of_measurement: '%', state_class: 'measurement' },
  ));

  await pub('sensor', 'return_since_inception', sensorConfig(
    'return_since_inception', 'Portfolio Rendement Sinds Start',
    '{{ value_json.inception_return }}',
    {
      unit_of_measurement: '%', state_class: 'measurement',
      json_attributes_topic: STATE_TOPIC,
      json_attributes_template: `{{ {'inception_date': value_json.inception_date} | tojson }}`,
    },
  ));

  await pub('sensor', 'best_performer', sensorConfig(
    'best_performer', 'Beste Positie',
    '{{ value_json.best_ticker }}',
    {
      json_attributes_topic:    STATE_TOPIC,
      json_attributes_template: `{{ {'pl_pct': value_json.best_pl_pct, 'value_eur': value_json.best_value} | tojson }}`,
    },
  ));

  await pub('sensor', 'worst_performer', sensorConfig(
    'worst_performer', 'Slechtste Positie',
    '{{ value_json.worst_ticker }}',
    {
      json_attributes_topic:    STATE_TOPIC,
      json_attributes_template: `{{ {'pl_pct': value_json.worst_pl_pct, 'value_eur': value_json.worst_value} | tojson }}`,
    },
  ));

  // ── Binary sensors ──────────────────────────────────────────────────────────
  await pub('binary_sensor', 'nyse_open', binarySensorConfig(
    'nyse_open', 'NYSE Open',
    '{{ value_json.nyse_open | string | lower }}',
    { device_class: 'connectivity' },
  ));

  await pub('binary_sensor', 'eu_markets_open', binarySensorConfig(
    'eu_markets_open', 'EU Beurzen Open',
    '{{ value_json.eu_markets_open | string | lower }}',
    { device_class: 'connectivity' },
  ));

  // Keep xetra_open for backwards compatibility
  await pub('binary_sensor', 'xetra_open', binarySensorConfig(
    'xetra_open', 'XETRA Open',
    '{{ value_json.eu_markets_open | string | lower }}',
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

  // ── Drawdown threshold number entity ────────────────────────────────────────
  await pub('number', 'drawdown_threshold', {
    unique_id:          'portfolio_tracker_drawdown_threshold',
    object_id:          'portfolio_drawdown_threshold',
    name:               'Drawdown Drempel',
    state_topic:        STATE_TOPIC,
    value_template:     '{{ value_json.drawdown_threshold }}',
    command_topic:      DRAWDOWN_CMD_TOPIC,
    availability_topic: AVAILABILITY_TOPIC,
    device:             DEVICE,
    min:                1,
    max:                50,
    step:               1,
    unit_of_measurement: '%',
    mode:               'slider',
  });

  discoveryPublished = true;
  console.log('[MQTT] Discovery configs published');
}

async function publishPositionDiscovery(mqttClient, pos) {
  const slug       = pos.ticker.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
  const stateTopic = `portfolio_tracker/positions/${slug}/state`;

  await mqttClient.publishAsync(
    `${DISCOVERY_PREFIX}/sensor/portfolio_tracker_${slug}_value/config`,
    JSON.stringify({
      unique_id:             `portfolio_tracker_${slug}_value`,
      object_id:             `portfolio_${slug}`,
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
  await mqttClient.publishAsync(
    `${DISCOVERY_PREFIX}/sensor/portfolio_tracker_${slug}_value/config`,
    '',
    { retain: true },
  );
}

async function publishWatchDiscovery(mqttClient, symbol) {
  const slug = symbol.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
  const stateTopic = `portfolio_tracker/watch/${slug}/state`;
  await mqttClient.publishAsync(
    `${DISCOVERY_PREFIX}/sensor/portfolio_tracker_watch_${slug}/config`,
    JSON.stringify({
      unique_id:             `portfolio_tracker_watch_${slug}`,
      object_id:             `portfolio_watch_${slug}`,
      name:                  `Watchlist ${symbol}`,
      state_topic:           stateTopic,
      value_template:        '{{ value_json.price }}',
      json_attributes_topic: stateTopic,
      availability_topic:    AVAILABILITY_TOPIC,
      unit_of_measurement:   '€',
      state_class:           'measurement',
      device:                DEVICE,
    }),
    { retain: true },
  );
  return slug;
}

async function removeWatchDiscovery(mqttClient, slug) {
  await mqttClient.publishAsync(
    `${DISCOVERY_PREFIX}/sensor/portfolio_tracker_watch_${slug}/config`,
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
  const { totalValue, totalCost, dailyPl, positions, realizedPl = 0, usdExposurePct = 0 } = snapshot;
  const unrealizedPl = totalValue - totalCost;
  const totalPlPct   = totalCost > 0 ? (unrealizedPl / totalCost * 100) : 0;

  const state = readState();
  if (totalValue > (state.peak || 0)) {
    state.peak     = totalValue;
    state.peakDate = new Date().toISOString().slice(0, 10);
    writeState(state);
  }
  const peak        = state.peak || totalValue;
  const drawdownPct = Math.max(0, (peak - totalValue) / peak * 100);

  const prevValue  = totalValue - (dailyPl || 0);
  const dailyPlPct = prevValue > 0 ? (dailyPl || 0) / prevValue * 100 : 0;

  const byPlPct = [...positions].sort((a, b) => b.plPct - a.plPct);

  // Effective drawdown threshold (runtime override takes priority)
  const effectiveDrawdownPct = runtimeDrawdownPct ?? options.drawdownAlertPct;

  // Analytics from state file (written by computeFullPortfolio)
  const twrPct        = state.twrPct          ?? null;
  const irrPct        = state.irrPct          ?? null;
  const inceptionDate = state.inceptionDate   ?? null;
  const totalInvested = state.totalInvested   ?? totalCost;
  const inceptionReturn = totalInvested > 0
    ? Number.parseFloat(((totalValue - totalInvested) / totalInvested * 100).toFixed(2))
    : null;

  const bestPos    = byPlPct[0];
  const worstPos   = byPlPct.at(-1);
  const fmtMover   = p => `${p.ticker} (${p.plPct >= 0 ? '+' : ''}${p.plPct.toFixed(1)}%)`;

  const payload = {
    value:            +totalValue.toFixed(2),
    cost_basis:       +totalCost.toFixed(2),
    unrealized_pl:    +unrealizedPl.toFixed(2),
    realized_pl:      +realizedPl.toFixed(2),
    pl_pct:           +totalPlPct.toFixed(2),
    daily_pl:         isWeekend() ? null : +(dailyPl || 0).toFixed(2),
    daily_pl_pct:     isWeekend() ? null : +dailyPlPct.toFixed(2),
    positions_count:  positions.length,
    top_mover:        bestPos  ? fmtMover(bestPos)  : '',
    bottom_mover:     worstPos ? fmtMover(worstPos) : '',
    best_ticker:      bestPos?.ticker  ?? '',
    best_pl_pct:      bestPos  ? +bestPos.plPct.toFixed(1)  : 0,
    best_value:       bestPos  ? +bestPos.value.toFixed(2)  : 0,
    worst_ticker:     worstPos?.ticker ?? '',
    worst_pl_pct:     worstPos ? +worstPos.plPct.toFixed(1) : 0,
    worst_value:      worstPos ? +worstPos.value.toFixed(2) : 0,
    peak_value:       +peak.toFixed(2),
    drawdown_pct:     +drawdownPct.toFixed(2),
    drawdown_threshold: effectiveDrawdownPct,
    usd_exposure_pct: usdExposurePct,
    health_score:     Math.round(Math.max(0, Math.min(100, 100 - drawdownPct * 1.5))),
    twr_pct:          twrPct,
    irr_pct:          irrPct,
    inception_return: inceptionReturn,
    inception_date:   inceptionDate,
    nyse_open:        isMarketOpen('NYSE'),
    eu_markets_open:  isMarketOpen('XETRA'),
    drawdown_warning: drawdownPct >= effectiveDrawdownPct,
    target_hit:       options.targetValue > 0 && totalValue >= options.targetValue,
    market_status:    marketStatus(),
    last_market_close_date: state.peakDate ?? null,
    last_updated:     new Date().toISOString(),
  };

  await mqttClient.publishAsync(STATE_TOPIC, JSON.stringify(payload), { retain: true });

  const pp = options.pushPositions; // string[] — [] = none, ['*'] = all, else specific tickers
  if (pp.length > 0) {
    const toPublish = pp.includes('*') ? positions : positions.filter(p => pp.includes(p.ticker));
    await publishPositionStates(mqttClient, toPublish);
  }
  if (snapshot.watchlistData?.length) await publishWatchStates(mqttClient, snapshot.watchlistData);
}

async function publishPositionStates(mqttClient, positions) {
  const currentSlugs = new Set();
  for (const pos of positions) {
    const slug = await publishPositionDiscovery(mqttClient, pos);
    currentSlugs.add(slug);
    await mqttClient.publishAsync(`portfolio_tracker/positions/${slug}/state`, JSON.stringify({
      value:               +pos.value.toFixed(2),
      cost:                +(pos.cost   ?? 0).toFixed(2),
      pl:                  +pos.pl.toFixed(2),
      pl_pct:              +pos.plPct.toFixed(2),
      shares:              pos.shares ?? 0,
      ticker:              pos.ticker,
      realized_pl:         +(pos.realizedPl ?? 0).toFixed(2),
      fifty_two_week_high: pos.high52 ?? null,
      fifty_two_week_low:  pos.low52  ?? null,
      pe_ratio:            pos.pe     ?? null,
    }), { retain: true });
  }
  for (const oldSlug of knownPositionSlugs) {
    if (currentSlugs.has(oldSlug)) continue;
    await removePositionDiscovery(mqttClient, oldSlug);
  }
  knownPositionSlugs = currentSlugs;
}

async function publishWatchStates(mqttClient, watchlistData) {
  const currentWatchSlugs = new Set();
  for (const item of watchlistData) {
    const slug = await publishWatchDiscovery(mqttClient, item.symbol);
    currentWatchSlugs.add(slug);
    const price = item.price ? +item.price.toFixed(2) : null;
    await mqttClient.publishAsync(`portfolio_tracker/watch/${slug}/state`, JSON.stringify({
      price,
      symbol:              item.symbol,
      fifty_two_week_high: item.high52      ?? null,
      fifty_two_week_low:  item.low52       ?? null,
      change_1d_pct:       item.change1dPct ?? null,
    }), { retain: true });
  }
  for (const oldSlug of knownWatchSlugs) {
    if (currentWatchSlugs.has(oldSlug)) continue;
    await removeWatchDiscovery(mqttClient, oldSlug);
  }
  knownWatchSlugs = currentWatchSlugs;
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
