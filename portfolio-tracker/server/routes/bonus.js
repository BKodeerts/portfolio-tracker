/**
 * Bonus tracker — store warrants/grants that track an index.
 * Data stored in data/bonus.json as an array of entries.
 */
const express = require('express');
const fs      = require('node:fs');
const path    = require('node:path');
const crypto  = require('node:crypto');
const router  = express.Router();
const { fetchCandles, fetchDailyQuote, sleep, FETCH_DELAY } = require('../yahoo.js');
const { readCache, writeCache } = require('../cache.js');

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const BONUS_FILE = path.join(DATA_DIR, 'bonus.json');

function loadBonus() {
  try { return JSON.parse(fs.readFileSync(BONUS_FILE, 'utf8')); } catch { return []; }
}
function saveBonus(items) {
  fs.writeFileSync(BONUS_FILE, JSON.stringify(items, null, 2));
}

async function getPriceAtDate(symbol, date) {
  const today    = new Date().toISOString().slice(0, 10);
  const cacheKey = `candles_bonus_${symbol}_${today}`;
  let candles = readCache(cacheKey, 24 * 60 * 60 * 1000);
  if (!candles) {
    candles = await fetchCandles(symbol, date);
    if (candles?.length) writeCache(cacheKey, candles);
    await sleep(FETCH_DELAY);
  }
  if (!candles?.length) return null;
  // Find closest candle on or after the grant date
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const exact  = sorted.find(c => c.date >= date);
  return exact?.close ?? sorted[0]?.close ?? null;
}

async function getCurrentPrice(symbol) {
  const cacheKey = `quote_bonus_${symbol}`;
  const cached = readCache(cacheKey, 15 * 60 * 1000); // 15 min
  if (cached) return cached;
  const q = await fetchDailyQuote(symbol);
  if (q?.close) writeCache(cacheKey, q.close);
  await sleep(FETCH_DELAY);
  return q?.close ?? null;
}

// GET /api/bonus — return all bonus entries with computed current values
router.get('/bonus', async (req, res) => {
  const items = loadBonus();
  const result = [];
  for (const item of items) {
    const grantIndexPrice   = await getPriceAtDate(item.symbol, item.grantDate);
    const currentIndexPrice = await getCurrentPrice(item.symbol);
    const currentWarrantPrice = (grantIndexPrice && currentIndexPrice)
      ? item.grantPrice * (currentIndexPrice / grantIndexPrice)
      : item.grantPrice;
    const totalValue         = item.quantity * currentWarrantPrice;
    const changeSinceGrantPct = grantIndexPrice && currentIndexPrice
      ? (currentIndexPrice - grantIndexPrice) / grantIndexPrice * 100
      : 0;
    result.push({
      ...item,
      grantIndexPrice,
      currentIndexPrice,
      currentWarrantPrice: Math.round(currentWarrantPrice * 100) / 100,
      totalValue:          Math.round(totalValue * 100) / 100,
      changeSinceGrantPct: Math.round(changeSinceGrantPct * 100) / 100,
    });
  }
  res.json({ status: 'ok', data: result });
});

// POST /api/bonus — add or update a bonus entry
router.post('/bonus', (req, res) => {
  const { id, label, symbol, quantity, grantDate, grantPrice } = req.body;
  if (!symbol || !quantity || !grantDate || !grantPrice) {
    return res.status(400).json({ error: 'symbol, quantity, grantDate en grantPrice zijn verplicht' });
  }
  const items = loadBonus();
  const entry = { id: id || crypto.randomUUID(), label: label || symbol, symbol, quantity: Number(quantity), grantDate, grantPrice: Number(grantPrice) };
  const idx = items.findIndex(i => i.id === entry.id);
  if (idx >= 0) items[idx] = entry; else items.push(entry);
  saveBonus(items);
  res.json({ status: 'ok', data: entry });
});

// DELETE /api/bonus/:id
router.delete('/bonus/:id', (req, res) => {
  const items = loadBonus().filter(i => i.id !== req.params.id);
  saveBonus(items);
  res.json({ status: 'ok' });
});

module.exports = router;
