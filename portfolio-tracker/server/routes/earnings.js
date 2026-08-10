const express = require('express');
const router  = express.Router();
const { readCache, readStaleCache, writeCache, QUOTES_CACHE_TTL } = require('../cache.js');
const { fetchQuoteStats, sleep, FETCH_DELAY } = require('../yahoo.js');
const { normalizeEarnings } = require('../domain/earnings.js');

const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,30}$/;
// The dashboard asks for holdings + watchlist in one call; a cache miss costs
// one Yahoo request per symbol, so cap the fan-out.
const MAX_SYMBOLS = 40;

// Next earnings date for a set of symbols — the dashboard's earnings list and
// holding-card badges. `/api/stats/:symbol` already carries this for a single
// ticker, but it also fetches the chart and the full candle history; the
// dashboard needs one field for a dozen tickers.
//
// The disk cache holds the *raw* quote fields rather than the normalized
// result: `upcoming` is derived against today's date, so a cached normalized
// block would claim an already-reported date is still upcoming after midnight.
// Normalizing per request keeps that honest even when a stale entry is served.

/** Only what `normalizeEarnings` reads — the cache spares requests, not payloads. */
function earningsFields(quote) {
  return {
    earningsTimestamp:      quote.earningsTimestamp      ?? null,
    earningsTimestampStart: quote.earningsTimestampStart ?? null,
    earningsTimestampEnd:   quote.earningsTimestampEnd   ?? null,
    isEarningsDateEstimate: quote.isEarningsDateEstimate ?? null,
    exchangeTimezoneName:   quote.exchangeTimezoneName   ?? null,
  };
}

router.get('/earnings', async (req, res) => {
  const symbols = [...new Set((req.query.symbols || '').split(',').filter(Boolean))];
  if (symbols.length === 0) return res.status(400).json({ status: 'error', message: 'No symbols provided' });
  const invalid = symbols.find(s => !SYMBOL_RE.test(s));
  if (invalid) return res.status(400).json({ status: 'error', message: `Invalid symbol: ${invalid}` });
  if (symbols.length > MAX_SYMBOLS) {
    return res.status(400).json({ status: 'error', message: `Too many symbols (max ${MAX_SYMBOLS})` });
  }

  const raw     = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const cached = readCache(`earnings_${symbol}`, QUOTES_CACHE_TTL);
    if (cached) { raw[symbol] = cached; continue; }
    toFetch.push(symbol);
  }

  for (let i = 0; i < toFetch.length; i++) {
    const symbol = toFetch[i];
    try {
      console.log(`[EARNINGS FETCH] ${symbol} (${i + 1}/${toFetch.length})`);
      // Best-effort: null means the crumb handshake or the quote call failed.
      // A quote *without* earnings fields is a normal payload (ETFs, many
      // non-US listings) and is cached like any other answer.
      const quote = await fetchQuoteStats(symbol);
      if (quote) { raw[symbol] = earningsFields(quote); writeCache(`earnings_${symbol}`, raw[symbol]); }
      else { raw[symbol] = readStaleCache(`earnings_${symbol}`); }
    } catch (e) {
      console.error(`[EARNINGS ERROR] ${symbol}: ${e.message}`);
      raw[symbol] = readStaleCache(`earnings_${symbol}`);
    }
    if (i < toFetch.length - 1) await sleep(FETCH_DELAY);
  }

  const today = new Date().toISOString().slice(0, 10);
  const data  = {};
  // A failed fetch normalizes to the same empty block as a listing without
  // earnings — the frontend renders both as "no date", which is all it can
  // honestly say about either.
  for (const symbol of symbols) data[symbol] = normalizeEarnings(raw[symbol], today);

  console.log(`[EARNINGS] ${Object.values(data).filter(e => e.date).length}/${symbols.length} with a date`);
  res.json({ status: 'ok', data });
});

module.exports = router;
