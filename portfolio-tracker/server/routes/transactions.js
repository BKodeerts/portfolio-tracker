const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const DATA_DIR         = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
    let final = transactions;
    if (mode === 'merge') {
      const existing = fs.existsSync(TRANSACTIONS_FILE)
        ? JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'))
        : [];
      const keys  = new Set(existing.map(t => `${t.date}|${t.ticker}|${t.shares}`));
      const added = transactions.filter(t => !keys.has(`${t.date}|${t.ticker}|${t.shares}`));
      final = [...existing, ...added].sort((a, b) => a.date.localeCompare(b.date));
    } else {
      final = transactions.sort((a, b) => a.date.localeCompare(b.date));
    }
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(final, null, 2));
    console.log(`[TRANSACTIONS] Saved ${final.length} (mode: ${mode || 'replace'})`);
    res.json({ status: 'ok', count: final.length });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
