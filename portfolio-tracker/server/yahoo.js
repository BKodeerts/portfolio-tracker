const https = require('https');

const FETCH_DELAY = 100;

function fetchYahoo(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioTracker/1.0)' },
      timeout: 15000,
    }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchCandles(yahooSymbol, fromDate) {
  const period1 = Math.floor(new Date(fromDate).getTime() / 1000) - 7 * 86400;
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;
  const text   = await fetchYahoo(url);
  const result = JSON.parse(text)?.chart?.result?.[0];
  if (!result) return null;
  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  return timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] ?? null }))
    .filter(d => d.close !== null);
}

async function fetchDailyQuote(yahooSymbol) {
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d&includePrePost=false`;
  const text = await fetchYahoo(url);
  const result = JSON.parse(text)?.chart?.result?.[0];
  if (!result) return null;
  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (closes[i] != null) {
      return { date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: closes[i] };
    }
  }
  return null;
}

async function fetchIntraday(yahooSymbol) {
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=1d&includePrePost=false`;
  const text = await fetchYahoo(url);
  const result = JSON.parse(text)?.chart?.result?.[0];
  if (!result) return null;
  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  const meta       = result.meta || {};
  const points     = timestamps.map((ts, i) => ({ ts, close: closes[i] ?? null })).filter(d => d.close !== null);
  if (points.length === 0) return null;
  return {
    date: new Date(points[0].ts * 1000).toISOString().slice(0, 10),
    previousClose: meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? null,
    currency: meta.currency || null,
    points,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { fetchCandles, fetchDailyQuote, fetchIntraday, fetchYahoo, sleep, FETCH_DELAY };
