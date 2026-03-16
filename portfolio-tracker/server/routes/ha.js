const express = require('express');
const router  = express.Router();

router.post('/ha/push', async (req, res) => {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return res.status(503).json({ error: 'No SUPERVISOR_TOKEN — not running as HA addon' });

  const { total_value, daily_pl, positions = [] } = req.body;
  const base    = 'http://supervisor/core/api/states';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function pushState(entity, stateVal, attributes) {
    const r = await fetch(`${base}/${entity}`, {
      method: 'POST', headers,
      body: JSON.stringify({ state: String(stateVal), attributes }),
    });
    if (!r.ok) throw new Error(`HA API ${entity}: ${r.status}`);
  }

  try {
    await pushState('sensor.portfolio_total_value', (total_value || 0).toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Waarde', device_class: 'monetary',
    });
    await pushState('sensor.portfolio_daily_pl', (daily_pl || 0).toFixed(2), {
      unit_of_measurement: '€', friendly_name: 'Portfolio Dagresultaat',
    });
    for (const p of positions) {
      const slug = p.ticker.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await pushState(`sensor.portfolio_${slug}`, (p.value || 0).toFixed(2), {
        unit_of_measurement: '€', friendly_name: `Portfolio ${p.ticker}`,
        pl_eur: (p.pl || 0).toFixed(2), pl_pct: (p.plPct || 0).toFixed(2),
      });
    }
    console.log(`[HA] Pushed ${positions.length + 2} sensors`);
    res.json({ ok: true, pushed: positions.length + 2 });
  } catch (e) {
    console.error('[HA] Push failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
