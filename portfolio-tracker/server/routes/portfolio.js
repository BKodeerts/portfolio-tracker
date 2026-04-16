const express = require('express');
const router  = express.Router();
const { computeFullPortfolio } = require('../portfolio.js');
const { getOptions } = require('../ha-helper.js');

// In-memory cache: invalidated whenever transactions are written
let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-flight promise: concurrent requests share one computation instead of each starting their own
let _inflight = null;

const COMPUTATION_TIMEOUT_MS = 60_000; // 60 seconds

function invalidatePortfolioCache() {
  _cache     = null;
  _cacheTime = 0;
  // Do NOT cancel in-flight; it will still populate the cache when done.
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Portfolio computation timed out after ${ms / 1000}s`)), ms)),
  ]);
}

router.get('/portfolio', async (req, res) => {
  try {
    const now = Date.now();
    if (_cache && (now - _cacheTime) < CACHE_TTL) {
      return res.json({ status: 'ok', data: _cache });
    }

    if (!_inflight) {
      _inflight = computeFullPortfolio().finally(() => { _inflight = null; });
    }
    const result = await withTimeout(_inflight, COMPUTATION_TIMEOUT_MS);
    if (!result) return res.json({ status: 'ok', data: null });
    const { baseCurrency } = getOptions();
    _cache     = { ...result, baseCurrency };
    _cacheTime = now;
    res.json({ status: 'ok', data: _cache });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Portfolio] Computation failed:', msg, e);
    res.status(500).json({ status: 'error', message: msg });
  }
});

module.exports = router;
module.exports.invalidatePortfolioCache = invalidatePortfolioCache;
