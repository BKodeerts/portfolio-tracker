const express  = require('express');
const fs       = require('node:fs');
const path     = require('node:path');

const router   = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE     = path.join(DATA_DIR, 'ticker_meta.json');

router.get('/', (req, res) => {
  try {
    const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
    res.json({ status: 'ok', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const body = req.body;
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ status: 'error', message: 'Expected a JSON object' });
    }
    // Sanitize: only allow known fields per ticker
    const allowed = ['quoteType', 'sector', 'geo', 'manualPriceEur', 'manualPriceAsOf'];
    const clean = {};
    for (const [ticker, meta] of Object.entries(body)) {
      if (typeof meta !== 'object' || !meta) continue;
      clean[ticker] = {};
      for (const key of allowed) {
        if (meta[key] !== undefined && meta[key] !== '') clean[ticker][key] = meta[key];
      }
      if (!Object.keys(clean[ticker]).length) delete clean[ticker];
    }
    fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
    res.json({ status: 'ok', count: Object.keys(clean).length });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
