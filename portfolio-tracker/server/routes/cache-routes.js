const express = require('express');
const router  = express.Router();
const { CACHE_TTL, clearAll, status } = require('../cache.js');

router.post('/cache/clear', (req, res) => {
  try {
    const count = clearAll();
    console.log(`[CACHE] Cleared ${count} files`);
    res.json({ status: 'ok', cleared: count });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/cache/status', (req, res) => {
  try {
    res.json({ status: 'ok', ttl_hours: CACHE_TTL / 3600000, entries: status() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
