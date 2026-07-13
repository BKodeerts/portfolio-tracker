const express = require('express');
const router  = express.Router();
const { readCache, readStaleCache, writeCache, QUOTES_CACHE_TTL } = require('../cache.js');
const { fetchCandles, fetchChartStats, fetchQuoteStats, sleep, FETCH_DELAY } = require('../yahoo.js');
const { computePriceReturns } = require('../domain/stats.js');

const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,30}$/;

// Per-ticker reference stats for the stock detail page: 52-week range,
// market cap, volumes, P/E, and the stock's own price returns.
// mktCap / pe come from Yahoo's authenticated quote endpoint and may be null
// when that call fails — the frontend renders those as "—".
router.get('/stats/:symbol', async (req, res) => {
  const { symbol } = req.params;
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) {
    return res.status(400).json({ status: 'error', message: 'Invalid symbol' });
  }

  const cacheKey = `stats_${symbol}`;
  const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
  if (cached) {
    console.log(`[STATS CACHE HIT] ${symbol}`);
    return res.json({ status: 'ok', source: 'cache', data: cached });
  }

  try {
    console.log(`[STATS FETCH] ${symbol}`);
    const chart = await fetchChartStats(symbol);
    if (!chart) throw new Error(`No chart data for ${symbol}`);
    await sleep(FETCH_DELAY);
    const quote = await fetchQuoteStats(symbol); // best-effort, may be null

    // Full listing history for the price returns — reuses the shared candle
    // disk cache the chart endpoints already populate.
    let candles = readCache(symbol);
    if (!candles) {
      await sleep(FETCH_DELAY);
      candles = await fetchCandles(symbol, '2000-01-01');
      if (candles && candles.length > 0) writeCache(symbol, candles);
    }

    const price = chart.price ?? candles?.[candles.length - 1]?.close ?? null;
    const today = new Date().toISOString().slice(0, 10);

    const data = {
      low52w:    chart.low52w,
      high52w:   chart.high52w,
      mktCap:    quote?.marketCap ?? null,
      volume:    quote?.volume ?? chart.volume,
      avgVolume: quote?.avgVolume ?? chart.avgVolume,
      pe:        quote?.trailingPE ?? null,
      returns:   computePriceReturns(candles || [], price, today),
    };
    writeCache(cacheKey, data);
    return res.json({ status: 'ok', source: 'yahoo', data });
  } catch (e) {
    console.error(`[STATS ERROR] ${symbol}: ${e.message}`);
    const stale = readStaleCache(cacheKey);
    if (stale) return res.json({ status: 'ok', source: 'stale_cache', data: stale });
    return res.status(502).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
