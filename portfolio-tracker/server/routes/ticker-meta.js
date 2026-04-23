const express  = require('express');
const fs       = require('node:fs');
const path     = require('node:path');
const { invalidatePortfolioCache } = require('./portfolio.js');

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

const ALLOWED_META_KEYS = ['quoteType', 'sector', 'industry', 'geo', 'manualPriceEur', 'manualPriceAsOf'];

function sanitizeMeta(ticker, meta) {
  const entry = {};
  for (const key of ALLOWED_META_KEYS) {
    if (meta[key] !== undefined && meta[key] !== '') entry[key] = meta[key];
  }
  if (entry.manualPriceEur !== undefined) {
    const p = Number(entry.manualPriceEur);
    if (!Number.isFinite(p) || p < 0) {
      throw new RangeError(`manualPriceEur for ${ticker} must be a non-negative number`);
    }
    entry.manualPriceEur = p;
  }
  return Object.keys(entry).length ? entry : null;
}

router.post('/', (req, res) => {
  try {
    const body = req.body;
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ status: 'error', message: 'Expected a JSON object' });
    }
    const clean = {};
    for (const [ticker, meta] of Object.entries(body)) {
      if (typeof meta !== 'object' || !meta) continue;
      try {
        const entry = sanitizeMeta(ticker, meta);
        if (entry) clean[ticker] = entry;
      } catch (e) {
        return res.status(400).json({ status: 'error', message: e.message });
      }
    }
    fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
    invalidatePortfolioCache();
    res.json({ status: 'ok', count: Object.keys(clean).length });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
