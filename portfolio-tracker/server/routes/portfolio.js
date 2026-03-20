const express = require('express');
const router  = express.Router();
const { computeFullPortfolio } = require('../portfolio.js');
const { getOptions } = require('../ha-helper.js');

// In-memory cache: invalidated whenever transactions are written
let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function invalidatePortfolioCache() {
  _cache     = null;
  _cacheTime = 0;
}

router.get('/portfolio', async (req, res) => {
  try {
    const now = Date.now();
    if (_cache && (now - _cacheTime) < CACHE_TTL) {
      return res.json({ status: 'ok', data: _cache });
    }

    const result = await computeFullPortfolio();
    if (!result) return res.json({ status: 'ok', data: null });
    const { baseCurrency } = getOptions();
    _cache     = { ...result, baseCurrency };
    _cacheTime = now;
    res.json({ status: 'ok', data: _cache });
  } catch (e) {
    console.error('[Portfolio] Computation failed:', e.message);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
module.exports.invalidatePortfolioCache = invalidatePortfolioCache;
