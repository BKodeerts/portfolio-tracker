/**
 * Shared HA integration helpers.
 * Consumed by both scheduler.js and routes/ha.js.
 */

const fs   = require('node:fs');
const path = require('node:path');

const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE    = path.join(DATA_DIR, 'portfolio_state.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ── Options ───────────────────────────────────────────────────────────────────

/** Read in-app settings (written by /api/settings UI). Returns {} if not found. */
function readAppSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Convert options.json push_positions bool + in-app settings to a normalised string[].
 * Empty array = push nothing. ['*'] = push all. ['AAPL', ...] = push specific tickers.
 */
function normalisePushPositions(appVal, rawBool) {
  if (appVal !== undefined && appVal !== null) {
    if (appVal === false) return [];
    if (Array.isArray(appVal)) return appVal;
  }
  return rawBool ? ['*'] : [];
}

function getOptions() {
  // In-app settings take precedence over HA options.json for UI-manageable fields.
  const app = readAppSettings();

  try {
    const raw      = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
    let watchlist = app.watchlist ?? [];
    if (!Array.isArray(app.watchlist)) watchlist = Array.isArray(raw.watchlist) ? raw.watchlist : [];
    return {
      enableHaSensors:           Boolean(raw.enable_ha_sensors          ?? false),
      pushInterval:              Number(app.pushInterval                ?? raw.push_interval ?? process.env.HA_PUSH_INTERVAL ?? 15),
      useMqttDiscovery:          Boolean(raw.use_mqtt_discovery          ?? false),
      drawdownAlertPct:          Number(app.drawdownAlertPct            ?? raw.drawdown_alert_pct  ?? 10),
      targetValue:               Number(app.targetValue                 ?? raw.target_value        ?? 0),
      pushPositions:             normalisePushPositions(app.pushPositions, raw.push_positions),
      intradayDuringMarketHours: app.intradayDuringMarketHours ?? Boolean(raw.intraday_during_market_hours ?? false),
      baseCurrency:              String(app.baseCurrency ?? raw.base_currency ?? process.env.BASE_CURRENCY ?? 'EUR').toUpperCase(),
      watchlist,
      mqttBroker:                raw.mqtt_broker   ?? null,
      mqttPort:                  raw.mqtt_port     ?? 1883,
      mqttUsername:              raw.mqtt_username ?? null,
      mqttPassword:              raw.mqtt_password ?? null,
    };
  } catch {
    return {
      enableHaSensors:           false,
      pushInterval:              Number(app.pushInterval ?? process.env.HA_PUSH_INTERVAL ?? 15),
      useMqttDiscovery:          false,
      drawdownAlertPct:          Number(app.drawdownAlertPct ?? 10),
      targetValue:               Number(app.targetValue ?? 0),
      pushPositions:             normalisePushPositions(app.pushPositions, false),
      intradayDuringMarketHours: app.intradayDuringMarketHours ?? false,
      baseCurrency:              String(app.baseCurrency ?? process.env.BASE_CURRENCY ?? 'EUR').toUpperCase(),
      watchlist:                 Array.isArray(app.watchlist) ? app.watchlist : [],
      mqttBroker:                null,
      mqttPort:                  1883,
      mqttUsername:              null,
      mqttPassword:              null,
    };
  }
}

// ── Persistent state ──────────────────────────────────────────────────────────

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { peak: 0, peakDate: null };
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn('[HA] Could not write state file:', e.message);
  }
}

// ── Market hours (UTC-based) ───────────────────────────────────────────────────

function isWeekend() {
  const day = new Date().getUTCDay();
  return day === 0 || day === 6;
}

// Known exchange holidays (UTC date strings).
// EU covers XETRA, Euronext, LSE, etc. (shared Good Friday / Christmas block).
const MARKET_HOLIDAYS = {
  NYSE: [
    '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
    '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-07-04','2026-09-07','2026-11-26','2026-12-25',
  ],
  EU: [
    '2025-01-01','2025-04-18','2025-04-21','2025-05-01','2025-12-25','2025-12-26',
    '2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-25','2026-12-26',
  ],
};

function isHoliday(exchange) {
  const today   = new Date().toISOString().slice(0, 10);
  const group   = exchange === 'NYSE' ? 'NYSE' : 'EU';
  return MARKET_HOLIDAYS[group]?.includes(today) ?? false;
}

/**
 * exchange: 'NYSE' | 'XETRA' | 'EU_MARKETS'
 */
function isMarketOpen(exchange) {
  if (isWeekend()) return false;
  if (isHoliday(exchange)) return false;
  const now  = new Date();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (exchange === 'NYSE')  return mins >= 13 * 60 + 30 && mins < 21 * 60;
  // XETRA / EU_MARKETS: 09:00–17:30 CET → 07:00–16:30 UTC (safe DST window)
  return mins >= 7 * 60 && mins < 16 * 60 + 30;
}

// ── HA state push ─────────────────────────────────────────────────────────────

async function pushState(token, entity, value, attributes) {
  const r = await fetch(`http://supervisor/core/api/states/${entity}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ state: String(value), attributes }),
  });
  if (!r.ok) throw new Error(`HA ${entity}: HTTP ${r.status}`);
}

// ── Metrics aggregation ───────────────────────────────────────────────────────

function computeHealthScore(drawdownPct, positions) {
  let score = 100;
  // Drawdown penalty: 0–40 pts proportional to drawdown
  score -= Math.min(40, drawdownPct * 1.5);
  // Concentration penalty: Herfindahl-Hirschman Index
  if (positions.length) {
    const totalVal = positions.reduce((s, p) => s + p.value, 0);
    if (totalVal > 0) {
      const hhi = positions.reduce((s, p) => s + (p.value / totalVal) ** 2, 0);
      // HHI of 1 = monopoly, 1/n = perfect diversification; penalty up to 20 pts
      const diversityPenalty = Math.min(20, (hhi - 1 / positions.length) * 40);
      score -= diversityPenalty;
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildMetrics(snapshot) {
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
  const prevValue   = totalValue - (dailyPl || 0);
  const dailyPlPct  = prevValue > 0 ? (dailyPl || 0) / prevValue * 100 : 0;

  const byPlPct  = [...positions].sort((a, b) => b.plPct - a.plPct);
  const bestPos  = byPlPct[0];
  const worstPos = byPlPct.at(-1);
  const fmt1     = p => `${p.ticker} (${p.plPct >= 0 ? '+' : ''}${p.plPct.toFixed(1)}%)`;

  const positionsJson = JSON.stringify(positions.map(p => ({
    ticker: p.ticker, label: p.label,
    value:  +p.value.toFixed(2), cost: +(p.cost ?? 0).toFixed(2),
    pl:     +p.pl.toFixed(2),    plPct: +p.plPct.toFixed(1),
  })));

  const anyMarketOpen = isMarketOpen('NYSE') || isMarketOpen('XETRA');
  let marketStatus    = 'closed';
  if (isWeekend())        marketStatus = 'weekend';
  else if (anyMarketOpen) marketStatus = 'open';

  const healthScore     = computeHealthScore(drawdownPct, positions);

  // Read analytics from last full portfolio computation (written by computeFullPortfolio)
  const twrPct          = state.twrPct          ?? null;
  const irrPct          = state.irrPct          ?? null;
  const inceptionDate   = state.inceptionDate   ?? null;
  const totalInvested   = state.totalInvested   ?? totalCost;
  const inceptionReturn = totalInvested > 0
    ? Number.parseFloat(((totalValue - totalInvested) / totalInvested * 100).toFixed(2))
    : null;

  // Last trading day (most recent weekday + non-holiday)
  const lastMarketCloseDate = state.peakDate ?? null; // best approximation without full history

  return {
    totalValue, totalCost, unrealizedPl, realizedPl,
    totalPlPct, dailyPl, dailyPlPct,
    peak, drawdownPct, peakDate: state.peakDate,
    positionsJson, positionsCount: positions.length,
    marketStatus,
    topMover:  bestPos  ? fmt1(bestPos)  : '',
    botMover:  worstPos ? fmt1(worstPos) : '',
    bestTicker:  bestPos?.ticker  ?? '',  bestPlPct:  bestPos?.plPct  ?? 0,  bestValue:  bestPos?.value  ?? 0,
    worstTicker: worstPos?.ticker ?? '', worstPlPct: worstPos?.plPct ?? 0, worstValue: worstPos?.value ?? 0,
    healthScore, usdExposurePct,
    twrPct, irrPct, inceptionReturn, inceptionDate,
    lastMarketCloseDate,
  };
}

// ── Core sensors ──────────────────────────────────────────────────────────────

async function pushCoreSensors(token, m) {
  const weekend = isWeekend();
  await pushState(token, 'sensor.portfolio_value', m.totalValue.toFixed(2), {
    unit_of_measurement: '€', state_class: 'measurement', device_class: 'monetary',
    friendly_name: 'Portfolio Waarde',
    cost_basis: m.totalCost.toFixed(2),  pl_eur: m.unrealizedPl.toFixed(2),
    pl_pct: m.totalPlPct.toFixed(2),     daily_pl: (m.dailyPl || 0).toFixed(2),
    positions_count: m.positionsCount,   top_mover: m.topMover,
    bottom_mover: m.botMover,            peak_value: m.peak.toFixed(2),
    drawdown_pct: m.drawdownPct.toFixed(2), market_status: m.marketStatus,
    positions_json: m.positionsJson,     last_updated: new Date().toISOString(),
    usd_exposure_pct: m.usdExposurePct,
  });
  await pushState(token, 'sensor.portfolio_pl', m.unrealizedPl.toFixed(2), {
    unit_of_measurement: '€', state_class: 'measurement', device_class: 'monetary',
    friendly_name: 'Portfolio Ongerealiseerd P&L', market_status: m.marketStatus,
  });
  await pushState(token, 'sensor.portfolio_realized_pl', m.realizedPl.toFixed(2), {
    unit_of_measurement: '€', state_class: 'measurement', device_class: 'monetary',
    friendly_name: 'Portfolio Gerealiseerd P&L',
  });
  await pushState(token, 'sensor.portfolio_pl_pct', m.totalPlPct.toFixed(2), {
    unit_of_measurement: '%', state_class: 'measurement',
    friendly_name: 'Portfolio P&L %', market_status: m.marketStatus,
  });
  await pushState(token, 'sensor.portfolio_daily_pl',
    weekend ? 'unavailable' : (m.dailyPl || 0).toFixed(2), {
      unit_of_measurement: '€', state_class: 'measurement', device_class: 'monetary',
      friendly_name: 'Portfolio Vandaag',
      last_market_close_date: m.lastMarketCloseDate,
    });
  await pushState(token, 'sensor.portfolio_daily_pl_pct',
    weekend ? 'unavailable' : m.dailyPlPct.toFixed(2), {
      unit_of_measurement: '%', state_class: 'measurement',
      friendly_name: 'Portfolio Vandaag %',
      last_market_close_date: m.lastMarketCloseDate,
    });
  await pushState(token, 'sensor.portfolio_usd_exposure', m.usdExposurePct.toFixed(1), {
    unit_of_measurement: '%', state_class: 'measurement',
    friendly_name: 'Portfolio USD Blootstelling',
  });
  await pushState(token, 'sensor.portfolio_health', String(m.healthScore), {
    friendly_name: 'Portfolio Gezondheid',
    drawdown_pct: m.drawdownPct.toFixed(1), positions_count: m.positionsCount,
  });
  if (m.twrPct != null) {
    await pushState(token, 'sensor.portfolio_twr', m.twrPct.toFixed(2), {
      unit_of_measurement: '%', state_class: 'measurement',
      friendly_name: 'Portfolio TWR (tijdgewogen rendement)',
    });
  }
  if (m.irrPct != null) {
    await pushState(token, 'sensor.portfolio_irr', m.irrPct.toFixed(2), {
      unit_of_measurement: '%', state_class: 'measurement',
      friendly_name: 'Portfolio IRR (geldgewogen rendement)',
    });
  }
  if (m.inceptionReturn != null) {
    await pushState(token, 'sensor.portfolio_return_since_inception', m.inceptionReturn.toFixed(2), {
      unit_of_measurement: '%', state_class: 'measurement',
      friendly_name: 'Portfolio Rendement Sinds Start',
      inception_date: m.inceptionDate,
    });
  }
  // Best/worst performer
  if (m.bestTicker) {
    await pushState(token, 'sensor.portfolio_best_performer', m.bestTicker, {
      friendly_name: 'Beste Positie',
      pl_pct: m.bestPlPct.toFixed(1), value_eur: m.bestValue.toFixed(2),
    });
  }
  if (m.worstTicker) {
    await pushState(token, 'sensor.portfolio_worst_performer', m.worstTicker, {
      friendly_name: 'Slechtste Positie',
      pl_pct: m.worstPlPct.toFixed(1), value_eur: m.worstValue.toFixed(2),
    });
  }
}

async function pushBinarySensors(token, m, options) {
  await pushState(token, 'binary_sensor.portfolio_nyse_open',
    isMarketOpen('NYSE') ? 'on' : 'off',
    { friendly_name: 'NYSE Open', device_class: 'connectivity' });
  await pushState(token, 'binary_sensor.portfolio_eu_markets_open',
    isMarketOpen('XETRA') ? 'on' : 'off',
    { friendly_name: 'EU Beurzen Open', device_class: 'connectivity' });
  // Keep legacy xetra_open for backwards compatibility
  await pushState(token, 'binary_sensor.portfolio_xetra_open',
    isMarketOpen('XETRA') ? 'on' : 'off',
    { friendly_name: 'XETRA Open', device_class: 'connectivity' });
  await pushState(token, 'binary_sensor.portfolio_drawdown_warning',
    m.drawdownPct >= options.drawdownAlertPct ? 'on' : 'off', {
      friendly_name: 'Portfolio Drawdown Alarm', device_class: 'problem',
      current_drawdown_pct: +m.drawdownPct.toFixed(2),
      threshold_pct: options.drawdownAlertPct,
      peak_value: +m.peak.toFixed(2), peak_date: m.peakDate,
    });
  if (options.targetValue > 0) {
    await pushState(token, 'binary_sensor.portfolio_target_hit',
      m.totalValue >= options.targetValue ? 'on' : 'off', {
        friendly_name: 'Portfolio Doel Bereikt', device_class: 'running',
        target: options.targetValue, current: +m.totalValue.toFixed(2),
      });
  }
  await pushState(token, 'binary_sensor.portfolio_tracker_healthy', 'on', {
    friendly_name: 'Portfolio Tracker Actief', device_class: 'running',
    last_run: new Date().toISOString(),
  });
}

async function pushPositionSensors(token, positions) {
  for (const pos of positions) {
    const slug  = pos.ticker.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
    const value = isWeekend() ? 'unavailable' : pos.value.toFixed(2);
    await pushState(token, `sensor.portfolio_${slug}`, value, {
      unit_of_measurement: '€', state_class: 'measurement', device_class: 'monetary',
      friendly_name: `${pos.label} Waarde`,
      cost: +(pos.cost ?? 0).toFixed(2),       pl_eur: +pos.pl.toFixed(2),
      pl_pct: +pos.plPct.toFixed(2),           shares: pos.shares ?? 0,
      ticker: pos.ticker,
      realized_pl: +(pos.realizedPl ?? 0).toFixed(2),
      fifty_two_week_high: pos.high52 ?? null,
      fifty_two_week_low:  pos.low52  ?? null,
      pe_ratio:            pos.pe     ?? null,
    });
  }
}

async function pushWatchlistSensors(token, watchlistData) {
  for (const item of watchlistData) {
    const slug = item.symbol.toLowerCase().replaceAll(/[^a-z0-9]/g, '_');
    await pushState(token, `sensor.portfolio_watch_${slug}`, item.price?.toFixed(2) ?? 'unavailable', {
      unit_of_measurement: '€', state_class: 'measurement',
      friendly_name: `Watchlist ${item.symbol}`,
      symbol: item.symbol,
      fifty_two_week_high: item.high52  ?? null,
      fifty_two_week_low:  item.low52   ?? null,
      change_1d_pct:       item.change1dPct ?? null,
    });
  }
}

async function pushAll(token, snapshot, options) {
  const m = buildMetrics(snapshot);

  await pushCoreSensors(token, m);
  await pushBinarySensors(token, m, options);

  const pp = options.pushPositions; // string[] — empty = none, ['*'] = all, else specific tickers
  let pushedPositions = [];
  if (pp.length > 0) {
    pushedPositions = pp.includes('*')
      ? snapshot.positions
      : snapshot.positions.filter(p => pp.includes(p.ticker));
    await pushPositionSensors(token, pushedPositions);
  }

  if (snapshot.watchlistData?.length) await pushWatchlistSensors(token, snapshot.watchlistData);

  const baseCount = 15
    + (m.twrPct          == null ? 0 : 1)
    + (m.irrPct          == null ? 0 : 1)
    + (m.inceptionReturn == null ? 0 : 1)
    + (m.bestTicker  ? 1 : 0)
    + (m.worstTicker ? 1 : 0);
  return baseCount
    + (options.targetValue > 0 ? 1 : 0)
    + pushedPositions.length
    + (snapshot.watchlistData?.length || 0);
}

module.exports = { getOptions, readState, writeState, isWeekend, isMarketOpen, pushAll };
