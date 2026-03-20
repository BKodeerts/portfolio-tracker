const express = require('express');
const fs      = require('node:fs');
const path    = require('node:path');
const router  = express.Router();
const { invalidatePortfolioCache } = require('./portfolio.js');

const DATA_DIR          = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const MAX_BACKUPS       = 5;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function txKey(t) {
  return `${t.date}|${t.ticker}|${t.shares}|${t.costEur}`;
}

function writeWithBackup(filePath, content) {
  if (fs.existsSync(filePath)) {
    const ts  = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
    const bak = filePath.replace('.json', `.${ts}.bak.json`);
    fs.copyFileSync(filePath, bak);

    // Prune old backups beyond MAX_BACKUPS
    const dir  = path.dirname(filePath);
    const base = path.basename(filePath, '.json');
    const old  = fs.readdirSync(dir)
      .filter(f => f.startsWith(base) && f.endsWith('.bak.json'))
      .sort();
    for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS))) {
      try { fs.unlinkSync(path.join(dir, f)); } catch {}
    }
  }
  fs.writeFileSync(filePath, content);
}

router.get('/transactions', (req, res) => {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) return res.json({ status: 'ok', data: [] });
    res.json({ status: 'ok', data: JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8')) });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/transactions', (req, res) => {
  try {
    const { mode, transactions } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ status: 'error', message: 'transactions must be an array' });
    }

    let final;
    if (mode === 'merge') {
      const existing = fs.existsSync(TRANSACTIONS_FILE)
        ? JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'))
        : [];
      const keys  = new Set(existing.map(txKey));
      const added = transactions.filter(t => !keys.has(txKey(t)));
      final = [...existing, ...added].toSorted((a, b) => a.date.localeCompare(b.date));
    } else {
      final = transactions.toSorted((a, b) => a.date.localeCompare(b.date));
    }

    writeWithBackup(TRANSACTIONS_FILE, JSON.stringify(final, null, 2));
    invalidatePortfolioCache();
    console.log(`[TRANSACTIONS] Saved ${final.length} (mode: ${mode || 'replace'})`);
    res.json({ status: 'ok', count: final.length });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
