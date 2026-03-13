const express = require('express');
const router  = express.Router();
const { clearAll, clearGroup, statusByGroup } = require('../cache.js');
const { invalidatePortfolioCache } = require('./portfolio.js');

router.post('/cache/clear', (req, res) => {
  try {
    const { group } = req.query;
    const count = group ? clearGroup(group) : clearAll();
    if (!group) invalidatePortfolioCache();
    console.log(`[CACHE] Cleared ${count} files${group ? ` (group: ${group})` : ''}`);
    res.json({ status: 'ok', cleared: count });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/cache/status', (req, res) => {
  try {
    res.json({ status: 'ok', groups: statusByGroup() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
