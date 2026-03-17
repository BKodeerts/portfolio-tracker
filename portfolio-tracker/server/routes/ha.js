const express = require('express');
const router  = express.Router();
const { computeCurrentSnapshot } = require('../portfolio.js');
const { getOptions, pushAll }     = require('../ha-helper.js');

router.post('/ha/push', async (req, res) => {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return res.status(503).json({ error: 'No SUPERVISOR_TOKEN — not running as HA addon' });

  try {
    const snapshot = await computeCurrentSnapshot();
    if (!snapshot) return res.status(400).json({ error: 'No portfolio data available' });

    const options = getOptions();
    const pushed  = await pushAll(token, snapshot, options);

    console.log(`[HA] Pushed ${pushed} entities`);
    res.json({ ok: true, pushed });
  } catch (e) {
    console.error('[HA] Push failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
