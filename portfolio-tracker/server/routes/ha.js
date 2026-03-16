const express = require('express');
const router  = express.Router();
const { computeCurrentSnapshot } = require('../portfolio.js');

router.post('/ha/push', async (req, res) => {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return res.status(503).json({ error: 'No SUPERVISOR_TOKEN — not running as HA addon' });

  try {
    const portfolio = await computeCurrentSnapshot();
    if (!portfolio) return res.status(400).json({ error: 'No portfolio data available' });

    const { totalValue, totalCost, dailyPl, positions } = portfolio;
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

    await pushState('sensor.portfolio_total_value', totalValue.toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Waarde', device_class: 'monetary',
    });
    await pushState('sensor.portfolio_total_invested', totalCost.toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Geïnvesteerd',
    });
    await pushState('sensor.portfolio_pl', totalPl.toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio P&L', pl_pct: totalPlPct.toFixed(2),
    });
    await pushState('sensor.portfolio_daily_pl', dailyPl.toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Dagresultaat',
    });

    for (const p of positions) {
      const slug = p.ticker.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await pushState(`sensor.portfolio_${slug}`, p.value.toFixed(2), {
        unit_of_measurement: '€', friendly_name: `Portfolio ${p.ticker}`,
        pl_eur: p.pl.toFixed(2), pl_pct: p.plPct.toFixed(2),
      });
    }

    console.log(`[HA] Pushed ${positions.length + 4} sensors`);
    res.json({ ok: true, pushed: positions.length + 4 });
  } catch (e) {
    console.error('[HA] Push failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
