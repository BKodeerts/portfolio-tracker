const https = require('node:https');

const FETCH_DELAY = 100;

// Browser-like UA needed for crumb endpoint
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function fetchYahoo(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, ...extraHeaders },
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

// ── Yahoo crumb auth (required for v10/quoteSummary) ─────────────────────────

let _crumb = null;

// Collect cookies by following redirects; handles EU GDPR consent automatically.
async function collectYahooCookies() {
  const jar = {};
  const addCookies = hdrs => {
    for (const c of (hdrs['set-cookie'] || [])) {
      const m = c.match(/^([^=]+)=([^;]*)/);
      if (m) jar[m[1].trim()] = m[2].trim();
    }
  };
  const jarStr = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

  const getStep = url => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get({
      hostname: parsed.hostname, path: parsed.pathname + (parsed.search || ''),
      headers: { 'User-Agent': UA, 'Cookie': jarStr(), 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 15000, maxHeaderSize: 65536,
    }, res => {
      addCookies(res.headers);
      res.resume();
      resolve({ code: res.statusCode, location: res.headers['location'] });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });

  const postConsent = (url, sessionId) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body   = `agree=agree&consentId=${encodeURIComponent(sessionId)}&sessionId=${encodeURIComponent(sessionId)}&inline=false&locale=en-US&lang=en-US&done=`;
    const req = https.request({
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST',
      headers: { 'User-Agent': UA, 'Cookie': jarStr(), 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000, maxHeaderSize: 65536,
    }, res => { addCookies(res.headers); res.resume(); resolve(res.headers['location']); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Consent timeout')); });
    req.write(body); req.end();
  });

  let url = 'https://finance.yahoo.com';
  for (let i = 0; i < 8; i++) {
    const { code, location } = await getStep(url);
    if (code >= 300 && code < 400 && location) {
      const next = location.startsWith('http') ? location : new URL(location, url).href;
      if (next.includes('consent.yahoo.com')) {
        const sessionId = new URL(next).searchParams.get('sessionId') || '';
        await postConsent(next, sessionId);
        url = 'https://finance.yahoo.com'; // re-visit after consent
      } else {
        url = next;
      }
    } else {
      break;
    }
  }

  return jarStr();
}

async function getYahooCrumb() {
  if (_crumb && Date.now() - _crumb.fetchedAt < 6 * 60 * 60 * 1000) return _crumb;

  const cookies = await collectYahooCookies();
  const crumb   = await fetchYahoo('https://query1.finance.yahoo.com/v1/test/getcrumb', { Cookie: cookies });

  _crumb = { crumb: crumb.trim(), cookies, fetchedAt: Date.now() };
  return _crumb;
}

// ── Market data fetchers ──────────────────────────────────────────────────────

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
  const meta = result.meta || {};
  let lastClose = null, prevClose = null;
  let lastI = -1;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (closes[i] != null) {
      if (lastClose == null) { lastClose = closes[i]; lastI = i; }
      else { prevClose = closes[i]; break; }
    }
  }
  if (lastClose == null) return null;
  return {
    date:              new Date(timestamps[lastI] * 1000).toISOString().slice(0, 10),
    close:             lastClose,
    previousClose:     prevClose ?? null,
    change1dPct:       prevClose ? Number.parseFloat(((lastClose - prevClose) / prevClose * 100).toFixed(2)) : null,
    fiftyTwoWeekHigh:  meta.fiftyTwoWeekHigh     ?? null,
    fiftyTwoWeekLow:   meta.fiftyTwoWeekLow      ?? null,
    trailingPE:        meta.trailingPE            ?? null,
    dayHigh:           meta.regularMarketDayHigh ?? null,
    dayLow:            meta.regularMarketDayLow  ?? null,
    exchangeName:      meta.fullExchangeName      ?? null,
    exchangeTimezone:  meta.exchangeTimezoneName  ?? null,
    instrumentType:    meta.instrumentType        || null,
  };
}

async function fetchIntraday(yahooSymbol) {
  const isFx = yahooSymbol.endsWith('=X');
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=1d&includePrePost=${isFx}`;
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

async function fetchQuoteSummary(yahooSymbol) {
  const { crumb, cookieHeader } = await getYahooCrumb();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile%2CfundProfile&crumb=${encodeURIComponent(crumb)}`;
  const text = await fetchYahoo(url, { Cookie: cookieHeader });
  const result = JSON.parse(text)?.quoteSummary?.result?.[0];
  if (!result) return null;
  return {
    sector:   result.assetProfile?.sector       ?? result.fundProfile?.categoryName ?? null,
    industry: result.assetProfile?.industry     ?? null,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { fetchCandles, fetchDailyQuote, fetchIntraday, fetchQuoteSummary, fetchYahoo, sleep, FETCH_DELAY };
