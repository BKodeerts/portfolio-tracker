/**
 * Shared HA integration helpers.
 * Consumed by both scheduler.js and routes/ha.js.
 */

const fs   = require('node:fs');
const path = require('node:path');

const DATA_DIR   = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'portfolio_state.json');

// ── Options ───────────────────────────────────────────────────────────────────
// Read /data/options.json (written by HA supervisor from config.yaml schema).
// Falls back to env vars when running outside HA.

function getOptions() {
  try {
    const raw = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
    return {
      pushInterval:     Number(raw.push_interval      ?? process.env.HA_PUSH_INTERVAL ?? 15),
      drawdownAlertPct: Number(raw.drawdown_alert_pct ?? 10),
      targetValue:      Number(raw.target_value       ?? 0),
      pushPositions:    Boolean(raw.push_positions    ?? false),
    };
  } catch {
    return {
      pushInterval:     Number(process.env.HA_PUSH_INTERVAL ?? 15),
      drawdownAlertPct: 10,
      targetValue:      0,
      pushPositions:    false,
    };
  }
}

// ── Persistent state (rolling peak, for drawdown sensor) ─────────────────────

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

// ── Market hours (UTC-based, covers both standard and daylight time) ──────────

function isWeekend() {
  const day = new Date().getUTCDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

function isMarketOpen(exchange) {
  if (isWeekend()) return false;
  const now  = new Date();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  // NYSE  09:30–16:00 ET  →  13:30–21:00 UTC (covers EST & EDT overlap)
  if (exchange === 'NYSE')  return mins >= 13 * 60 + 30 && mins < 21 * 60;
  // XETRA 09:00–17:30 CET →  07:00–16:30 UTC (covers CET & CEST overlap)
  if (exchange === 'XETRA') return mins >= 7  * 60       && mins < 16 * 60 + 30;
  return false;
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

// Push the full sensor set.  Returns the number of entities pushed.
async function pushAll(token, snapshot, options) {
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

  // Top / bottom mover by today's P&L% (use total P&L% as proxy in snapshot)
  const byPlPct  = [...positions].sort((a, b) => b.plPct - a.plPct);
  const fmt1     = p => `${p.ticker} (${p.plPct >= 0 ? '+' : ''}${p.plPct.toFixed(1)}%)`;
  const topMover = byPlPct[0]     ? fmt1(byPlPct[0])     : '';
  const botMover = byPlPct.at(-1) ? fmt1(byPlPct.at(-1)) : '';

  // Compact positions JSON stored as attribute on the main sensor
  const positionsJson = JSON.stringify(positions.map(p => ({
    ticker: p.ticker,
    label:  p.label,
    value:  +p.value.toFixed(2),
    cost:   +(p.cost ?? 0).toFixed(2),
    pl:     +p.pl.toFixed(2),
    plPct:  +p.plPct.toFixed(1),
  })));

  const marketStatus = isWeekend() ? 'weekend' : isMarketOpen('NYSE') || isMarketOpen('XETRA') ? 'open' : 'closed';

  // ── Core sensors ─────────────────────────────────────────────────────────
  await pushState(token, 'sensor.portfolio_value', totalValue.toFixed(2), {
    unit_of_measurement: '€',
    state_class:         'measurement',
    device_class:        'monetary',
    friendly_name:       'Portfolio Waarde',
    cost_basis:          totalCost.toFixed(2),
    pl_eur:              totalPl.toFixed(2),
    pl_pct:              totalPlPct.toFixed(2),
    daily_pl:            (dailyPl || 0).toFixed(2),
    positions_count:     positions.length,
    top_mover:           topMover,
    bottom_mover:        botMover,
    peak_value:          peak.toFixed(2),
    drawdown_pct:        drawdownPct.toFixed(2),
    market_status:       marketStatus,
    positions_json:      positionsJson,
    last_updated:        new Date().toISOString(),
  });

  await pushState(token, 'sensor.portfolio_pl', totalPl.toFixed(2), {
    unit_of_measurement: '€',
    state_class:         'measurement',
    device_class:        'monetary',
    friendly_name:       'Portfolio P&L',
    market_status:       marketStatus,
  });

  await pushState(token, 'sensor.portfolio_pl_pct', totalPlPct.toFixed(2), {
    unit_of_measurement: '%',
    state_class:         'measurement',
    friendly_name:       'Portfolio P&L %',
    market_status:       marketStatus,
  });

  // Daily P&L is only meaningful on trading days — mark unavailable on weekends
  const dailyState = isWeekend() ? 'unavailable' : (dailyPl || 0).toFixed(2);
  await pushState(token, 'sensor.portfolio_daily_pl', dailyState, {
    unit_of_measurement: '€',
    state_class:         'measurement',
    device_class:        'monetary',
    friendly_name:       'Portfolio Vandaag',
  });

  // ── Binary sensors ────────────────────────────────────────────────────────
  await pushState(token, 'binary_sensor.portfolio_nyse_open', isMarketOpen('NYSE') ? 'on' : 'off', {
    friendly_name: 'NYSE Open',
    device_class:  'connectivity',
  });

  await pushState(token, 'binary_sensor.portfolio_xetra_open', isMarketOpen('XETRA') ? 'on' : 'off', {
    friendly_name: 'XETRA Open',
    device_class:  'connectivity',
  });

  await pushState(token,
    'binary_sensor.portfolio_drawdown_warning',
    drawdownPct >= options.drawdownAlertPct ? 'on' : 'off',
    {
      friendly_name:        'Portfolio Drawdown Alarm',
      device_class:         'problem',
      current_drawdown_pct: +drawdownPct.toFixed(2),
      threshold_pct:        options.drawdownAlertPct,
      peak_value:           +peak.toFixed(2),
      peak_date:            state.peakDate,
    },
  );

  if (options.targetValue > 0) {
    await pushState(token,
      'binary_sensor.portfolio_target_hit',
      totalValue >= options.targetValue ? 'on' : 'off',
      {
        friendly_name: 'Portfolio Doel Bereikt',
        device_class:  'running',
        target:        options.targetValue,
        current:       +totalValue.toFixed(2),
      },
    );
  }

  // ── Health check ──────────────────────────────────────────────────────────
  await pushState(token, 'binary_sensor.portfolio_tracker_healthy', 'on', {
    friendly_name: 'Portfolio Tracker Actief',
    device_class:  'running',
    last_run:      new Date().toISOString(),
  });

  // ── Per-position sensors (opt-in) ─────────────────────────────────────────
  if (options.pushPositions) {
    for (const pos of positions) {
      const slug  = pos.ticker.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const state = isWeekend() ? 'unavailable' : pos.value.toFixed(2);
      await pushState(token, `sensor.portfolio_${slug}_value`, state, {
        unit_of_measurement: '€',
        state_class:         'measurement',
        device_class:        'monetary',
        friendly_name:       `${pos.label} Waarde`,
        cost:                +(pos.cost  ?? 0).toFixed(2),
        pl_eur:              +pos.pl.toFixed(2),
        pl_pct:              +pos.plPct.toFixed(2),
        shares:              pos.shares ?? 0,
        ticker:              pos.ticker,
      });
    }
  }

  return 8 + (options.targetValue > 0 ? 1 : 0) + (options.pushPositions ? positions.length : 0);
}

module.exports = { getOptions, pushAll };
