const express = require('express');
const router  = express.Router();
const { computeFullPortfolio } = require('../portfolio.js');
const { getOptions } = require('../ha-helper.js');

router.get('/portfolio', async (req, res) => {
  try {
    const result = await computeFullPortfolio();
    if (!result) return res.json({ status: 'ok', data: null });
    const { baseCurrency } = getOptions();
    res.json({ status: 'ok', data: { ...result, baseCurrency } });
  } catch (e) {
    console.error('[Portfolio] Computation failed:', e.message);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
