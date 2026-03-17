const express = require('express');
const router  = express.Router();
const { computeCurrentSnapshot } = require('../portfolio.js');

router.post('/ha/push', async (req, res) => {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return res.status(503).json({ error: 'No SUPERVISOR_TOKEN — not running as HA addon' });

  try {
    const portfolio = await computeCurrentSnapshot();
    if (!portfolio) return res.status(400).json({ error: 'No portfolio data available' });

    const { totalValue, totalCost, dailyPl } = portfolio;
    const base    = 'http://supervisor/core/api/states';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    async function pushState(entity, stateVal, attributes) {
      const r = await fetch(`${base}/${entity}`, {
        method: 'POST', headers,
        body: JSON.stringify({ state: String(stateVal), attributes }),
      });
      if (!r.ok) throw new Error(`HA API ${entity}: ${r.status}`);
    }

    const totalPl    = totalValue - totalCost;
    const totalPlPct = totalCost > 0 ? (totalPl / totalCost * 100) : 0;

    await pushState('sensor.portfolio_value', totalValue.toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Waarde',
    });
    await pushState('sensor.portfolio_pl', totalPl.toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio P&L',
    });
    await pushState('sensor.portfolio_pl_pct', totalPlPct.toFixed(2), {
      unit_of_measurement: '%', friendly_name: 'Portfolio P&L %',
    });
    await pushState('sensor.portfolio_daily_pl', (dailyPl || 0).toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Vandaag',
    });

    console.log('[HA] Pushed 4 sensors');
    res.json({ ok: true, pushed: 4 });
  } catch (e) {
    console.error('[HA] Push failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
