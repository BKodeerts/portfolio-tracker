const express = require('express');
const router  = express.Router();
const { readCache, readStaleCache, writeCache } = require('../cache.js');
const { fetchCandles, fetchDailyQuote, fetchIntraday, fetchYahoo, sleep, FETCH_DELAY } = require('../yahoo.js');
const { QUOTES_CACHE_TTL, INTRADAY_CACHE_TTL } = require('../cache.js');

// Single symbol candles
router.get('/candles/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const from = req.query.from || '2021-01-01';
  const cached = readCache(symbol);
  if (cached) {
    console.log(`[CACHE HIT] ${symbol}`);
    return res.json({ status: 'ok', source: 'cache', data: cached });
  }
  try {
    console.log(`[FETCH] ${symbol} from ${from}`);
    const data = await fetchCandles(symbol, from);
    if (data && data.length > 0) {
      writeCache(symbol, data);
      return res.json({ status: 'ok', source: 'yahoo', data });
    }
    const stale = readStaleCache(symbol);
    if (stale) return res.json({ status: 'ok', source: 'stale_cache', data: stale });
    return res.json({ status: 'error', message: `No data for ${symbol}` });
  } catch (e) {
    console.error(`[ERROR] ${symbol}:`, e.message);
    const stale = readStaleCache(symbol);
    if (stale) return res.json({ status: 'ok', source: 'stale_cache', data: stale });
    return res.status(502).json({ status: 'error', message: e.message });
  }
});

// Batch candles
router.get('/batch', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').filter(Boolean);
  const froms   = (req.query.froms   || '').split(',');
  if (symbols.length === 0) return res.status(400).json({ status: 'error', message: 'No symbols provided' });

  const results = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const from       = froms[symbols.indexOf(symbol)] || '2021-01-01';
    const cached     = readCache(symbol);
    // If cached data doesn't reach back to the requested from date, treat as miss
    const cacheStart = cached?.[0]?.date;
    const cacheValid = cached && (!cacheStart || cacheStart <= from);
    if (cacheValid) { console.log(`[CACHE HIT] ${symbol}`); results[symbol] = cached; }
    else toFetch.push({ symbol, from });
  }

  for (let i = 0; i < toFetch.length; i++) {
    const { symbol, from } = toFetch[i];
    try {
      console.log(`[FETCH] ${symbol} (${i + 1}/${toFetch.length})`);
      const data = await fetchCandles(symbol, from);
      if (data && data.length > 0) { writeCache(symbol, data); results[symbol] = data; }
      else { console.warn(`[EMPTY] ${symbol}: no data, trying stale`); results[symbol] = readStaleCache(symbol); }
    } catch (e) {
      console.error(`[ERROR] ${symbol}: ${e.message}`);
      results[symbol] = readStaleCache(symbol) || null;
    }
    if (i < toFetch.length - 1) await sleep(FETCH_DELAY);
  }

  console.log(`[BATCH] ${Object.values(results).filter(Boolean).length}/${symbols.length} symbols loaded`);
  res.json({ status: 'ok', data: results });
});

// Daily quotes
router.get('/quotes', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').filter(Boolean);
  if (symbols.length === 0) return res.status(400).json({ status: 'error', message: 'No symbols provided' });

  const results = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const cached = readCache(`quote_${symbol}`, QUOTES_CACHE_TTL);
    if (cached) { console.log(`[QUOTE CACHE HIT] ${symbol}`); results[symbol] = cached; }
    else toFetch.push(symbol);
  }

  for (let i = 0; i < toFetch.length; i++) {
    const symbol = toFetch[i];
    try {
      console.log(`[QUOTE FETCH] ${symbol} (${i + 1}/${toFetch.length})`);
      const quote = await fetchDailyQuote(symbol);
      if (quote) { writeCache(`quote_${symbol}`, quote); results[symbol] = quote; }
      else { results[symbol] = readStaleCache(`quote_${symbol}`) || null; }
    } catch (e) {
      console.error(`[QUOTE ERROR] ${symbol}: ${e.message}`);
      results[symbol] = readStaleCache(`quote_${symbol}`) || null;
    }
    if (i < toFetch.length - 1) await sleep(FETCH_DELAY);
  }

  console.log(`[QUOTES] ${Object.values(results).filter(Boolean).length}/${symbols.length} loaded`);
  res.json({ status: 'ok', data: results });
});

// Intraday
router.get('/intraday', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').filter(Boolean);
  const force   = req.query.force === '1';
  if (symbols.length === 0) return res.status(400).json({ status: 'error', message: 'No symbols provided' });

  const results = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const cached = !force && readCache(`intraday_${symbol}`, INTRADAY_CACHE_TTL);
    if (cached) { console.log(`[INTRADAY CACHE HIT] ${symbol}`); results[symbol] = cached; }
    else toFetch.push(symbol);
  }

  for (let i = 0; i < toFetch.length; i++) {
    const symbol = toFetch[i];
    try {
      console.log(`[INTRADAY FETCH] ${symbol}`);
      const data = await fetchIntraday(symbol);
      writeCache(`intraday_${symbol}`, data);
      results[symbol] = data;
    } catch (e) {
      console.error(`[INTRADAY ERROR] ${symbol}: ${e.message}`);
      results[symbol] = readStaleCache(`intraday_${symbol}`) || null;
    }
    if (i < toFetch.length - 1) await sleep(FETCH_DELAY);
  }

  res.json({ status: 'ok', data: results });
});

// ISIN lookup
const LOOKUP_SUFFIXES = {
  XETRA:'.DE', XET:'.DE', GER:'.DE', XAMS:'.AS', AMS:'.AS', XPAR:'.PA', EPA:'.PA',
  XLON:'.L', LSE:'.L', XMIL:'.MI', MIL:'.MI', XBRU:'.BR', BRU:'.BR', XSWX:'.SW', SWX:'.SW',
  NSQ:'', NYSE:'', XNAS:'', XNYS:'',
};
router.get('/lookup', async (req, res) => {
  const { isin, exchange } = req.query;
  if (!isin) return res.status(400).json({ status: 'error', message: 'isin required' });
  const cacheKey = `lookup_${isin.replaceAll(/[^a-zA-Z0-9]/g, '_')}`;
  const cached = readCache(cacheKey, 30 * 24 * 60 * 60 * 1000);
  if (cached) return res.json({ status: 'ok', symbol: cached.symbol });
  try {
    const url  = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&enableNavLinks=false`;
    const text = await fetchYahoo(url);
    const quotes = (JSON.parse(text)?.quotes || []).filter(q => ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType));
    const sfx  = exchange ? (LOOKUP_SUFFIXES[(exchange || '').toUpperCase()] ?? null) : null;
    let best   = null;
    if (sfx !== null && sfx !== '') best = quotes.find(q => q.symbol.endsWith(sfx));
    else if (sfx === '')            best = quotes.find(q => !q.symbol.includes('.')) || quotes[0];
    if (!best) best = quotes[0];
    if (!best) return res.json({ status: 'not_found' });
    writeCache(cacheKey, { symbol: best.symbol });
    console.log(`[LOOKUP] ${isin} → ${best.symbol}`);
    return res.json({ status: 'ok', symbol: best.symbol });
  } catch (e) {
    console.error(`[LOOKUP] ${isin}: ${e.message}`);
    return res.status(502).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
