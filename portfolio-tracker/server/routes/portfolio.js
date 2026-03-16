const express = require('express');
const router  = express.Router();
const { computeFullPortfolio } = require('../portfolio.js');

router.get('/portfolio', async (req, res) => {
  try {
    const result = await computeFullPortfolio();
    if (!result) return res.json({ status: 'ok', data: null });
    res.json({ status: 'ok', data: result });
  } catch (e) {
    console.error('[Portfolio] Computation failed:', e.message);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
