const express  = require('express');
const fs       = require('node:fs');
const path     = require('node:path');
const router   = express.Router();
const { invalidatePortfolioCache } = require('./portfolio.js');

const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULTS = {
  baseCurrency:              'EUR',
  watchlist:                 [],
  intradayDuringMarketHours: false,
  pushInterval:              15,
  pushPositions:             false,
};

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(s) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

router.get('/settings', (req, res) => {
  res.json({ status: 'ok', data: readSettings() });
});

router.post('/settings', (req, res) => {
  try {
    const { baseCurrency, watchlist, intradayDuringMarketHours,
            pushInterval, pushPositions } = req.body;
    const current = readSettings();

    if (typeof baseCurrency === 'string')
      current.baseCurrency = baseCurrency.toUpperCase();
    if (Array.isArray(watchlist))
      current.watchlist = watchlist.map(s => String(s).trim().toUpperCase()).filter(Boolean);
    if (typeof intradayDuringMarketHours === 'boolean')
      current.intradayDuringMarketHours = intradayDuringMarketHours;
    if (typeof pushInterval === 'number')
      current.pushInterval = Math.max(1, Math.min(60, Math.round(pushInterval)));
    // pushPositions: false | ["*"] | ["TICKER", ...]
    if (pushPositions === false || pushPositions === null) {
      current.pushPositions = false;
    } else if (Array.isArray(pushPositions)) {
      current.pushPositions = pushPositions.map(s => String(s).trim().toUpperCase()).filter(Boolean);
    }

    writeSettings(current);
    invalidatePortfolioCache();
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
