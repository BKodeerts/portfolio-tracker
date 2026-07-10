const https = require('node:https');

const FETCH_DELAY = 100;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Custom error class that carries the HTTP status code so callers can
// distinguish rate-limit (429) responses from genuine failures.
class YahooHttpError extends Error {
  constructor(statusCode, body) {
    super(`HTTP ${statusCode}: ${body.slice(0, 200)}`);
    this.statusCode = statusCode;
  }
}

function fetchYahooRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
    }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(body);
        else reject(new YahooHttpError(res.statusCode, body));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * Fetch a Yahoo Finance URL with automatic exponential backoff on HTTP 429.
 * Retries up to 3 times with 2s / 4s / 8s delays before giving up.
 */
async function fetchYahoo(url) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchYahooRaw(url);
    } catch (err) {
      if (err instanceof YahooHttpError && err.statusCode === 429) {
        if (attempt < MAX_RETRIES) {
          const wait = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          console.warn(`[Yahoo] Rate limited (429), retrying in ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        console.warn('[Yahoo] Rate limited (429) — max retries reached');
      } else if (err instanceof YahooHttpError && err.statusCode === 404) {
        // Symbol not found — don't retry
        console.warn(`[Yahoo] Symbol not found (404): ${url.split('?')[0].split('/').at(-1)}`);
      }
      throw err;
    }
  }
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

function deriveMarketState(periods) {
  const now = Date.now() / 1000;
  const { regular, pre, post } = periods || {};
  if (regular && now >= regular.start && now < regular.end) return 'REGULAR';
  if (pre     && now >= pre.start     && now < pre.end)     return 'PRE';
  if (post    && now >= post.start    && now < post.end)    return 'POST';
  return 'CLOSED';
}

function derivePreviousClose(points, periods, lastDate, meta) {
  // Find the last close of the prior regular session.
  // With includePrePost=true, we must skip today's extended-hours points by looking
  // before today's pre-market start (if available), else before regular start.
  const cutoff = periods?.pre?.start ?? periods?.regular?.start ?? null;
  if (cutoff) {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].ts < cutoff) return points[i].close;
    }
  }
  // Fallback: last point on a different calendar date
  for (let i = points.length - 1; i >= 0; i--) {
    if (new Date(points[i].ts * 1000).toISOString().slice(0, 10) !== lastDate) return points[i].close;
  }
  return meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? null;
}

// Returns { sessionPoints, previousClose } for the most relevant trading session.
// When today's regular session has data, use it with the standard previousClose.
// When it's pre-market (some today points exist but regular hasn't started), use
// the fallback window with the standard previousClose (last close before today's pre/regular start).
// When the market is fully closed with no today points at all (showing yesterday's stale
// session), anchor previousClose to the last close BEFORE yesterday's session — otherwise
// the baseline equals yesterday's close and every % reads 0.
function deriveSession(points, periods, lastDate, meta) {
  const regular = periods?.regular;
  if (!regular) {
    return { sessionPoints: points, previousClose: derivePreviousClose(points, periods, lastDate, meta) };
  }

  const todayPts = points.filter(p => p.ts >= regular.start && p.ts < regular.end);
  if (todayPts.length > 0) {
    // Guard: only trust these if they're actually from today's calendar date.
    // Yahoo sometimes serves a stale currentTradingPeriod pointing to yesterday's
    // session window while today's candles are already in the data array.
    const serverNow = new Date().toISOString().slice(0, 10);
    if (todayPts.some(p => new Date(p.ts * 1000).toISOString().slice(0, 10) === serverNow)) {
      return {
        sessionPoints: todayPts,
        previousClose: derivePreviousClose(points, periods, lastDate, meta),
      };
    }
    // currentTradingPeriod.regular is stale — fall through to date-based heuristics
  }

  // todayPts is empty: either the market hasn't opened yet, or Yahoo's
  // currentTradingPeriod doesn't align with the actual data (stale CDN, period
  // pointing to next session, etc.).  Before falling back to yesterday, check
  // whether any points from today's calendar date fall inside the regular-hours
  // window defined by time-of-day.  This handles the common case of Yahoo
  // returning the next-session's regular.start even when today's candles exist.
  const serverToday = new Date().toISOString().slice(0, 10);
  if (lastDate === serverToday) {
    const DAY_S_EARLY = 86400;
    const regStartTodE = ((regular.start % DAY_S_EARLY) + DAY_S_EARLY) % DAY_S_EARLY;
    const regEndTodE   = ((regular.end   % DAY_S_EARLY) + DAY_S_EARLY) % DAY_S_EARLY;
    const inRegTodE    = (ts) => {
      const tod = ((ts % DAY_S_EARLY) + DAY_S_EARLY) % DAY_S_EARLY;
      return regEndTodE > regStartTodE
        ? (tod >= regStartTodE && tod < regEndTodE)
        : (tod >= regStartTodE || tod < regEndTodE);
    };
    const todayByDatePts = points.filter(p =>
      new Date(p.ts * 1000).toISOString().slice(0, 10) === serverToday && inRegTodE(p.ts),
    );
    if (todayByDatePts.length > 0) {
      return {
        sessionPoints: todayByDatePts,
        previousClose: derivePreviousClose(points, periods, lastDate, meta),
      };
    }
  }

  // No regular-session data today — fall back to the last calendar day that has data,
  // narrowed to that day's regular-hours window (by time-of-day). This excludes pre /
  // post points so the dashboard shows the actual market move, not the extended move.
  const DAY_S = 86400;
  const regStartTod = ((regular.start % DAY_S) + DAY_S) % DAY_S;
  const regEndTod   = ((regular.end   % DAY_S) + DAY_S) % DAY_S;
  const inRegularTod = (ts) => {
    const tod = ((ts % DAY_S) + DAY_S) % DAY_S;
    return regEndTod > regStartTod
      ? (tod >= regStartTod && tod < regEndTod)
      : (tod >= regStartTod || tod < regEndTod);
  };
  const stalePts = points.filter(p =>
    p.ts < regular.start &&
    new Date(p.ts * 1000).toISOString().slice(0, 10) === lastDate &&
    inRegularTod(p.ts),
  );
  const preStart  = periods?.pre?.start;
  const inPreToday = preStart && points.some(p => p.ts >= preStart);

  if (inPreToday) {
    // PRE state: standard previousClose (last close before today's pre/regular start)
    return { sessionPoints: stalePts, previousClose: derivePreviousClose(points, periods, lastDate, meta) };
  }

  // Fully closed — anchor previousClose to the last regular close BEFORE lastDate
  // (not just before stalePts[0], which would pick up lastDate's own pre-market).
  if (stalePts.length > 0) {
    const lastDayStart = Date.parse(lastDate + 'T00:00:00Z') / 1000;
    let found = null;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].ts < lastDayStart && inRegularTod(points[i].ts)) { found = points[i].close; break; }
    }
    const previousClose = found ?? meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? null;
    return { sessionPoints: stalePts, previousClose };
  }

  return { sessionPoints: stalePts, previousClose: derivePreviousClose(points, periods, lastDate, meta) };
}

function deriveExtendedPrices(points, pre, post) {
  if (!pre || !post) return { preMarketPrice: null, postMarketPrice: null };
  const last = (pts) => pts.length ? pts[pts.length - 1].close : null;
  return {
    preMarketPrice:  last(points.filter(p => p.ts >= pre.start  && p.ts < pre.end)),
    postMarketPrice: last(points.filter(p => p.ts >= post.start && p.ts < post.end)),
  };
}

async function fetchIntraday(yahooSymbol) {
  // Use range=2d so we always have the previous session available when a market just
  // opened and range=1d would only return the new (sparse) session.
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=2d&includePrePost=true`;
  const text = await fetchYahoo(url);
  const result = JSON.parse(text)?.chart?.result?.[0];
  if (!result) return null;
  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  const meta       = result.meta || {};
  const points     = timestamps.map((ts, i) => ({ ts, close: closes[i] ?? null })).filter(d => d.close !== null);
  if (points.length === 0) return null;

  const periods  = meta.currentTradingPeriod;
  const lastDate = new Date(points[points.length - 1].ts * 1000).toISOString().slice(0, 10);

  const { sessionPoints, previousClose } = deriveSession(points, periods, lastDate, meta);

  // Use the date of the session points themselves, not the last raw candle date.
  // lastDate may be today (due to pre-market candles) while sessionPoints are from
  // yesterday, which would fool the frontend's freshness/stale-detection logic.
  const sessionDate = sessionPoints.length > 0
    ? new Date(sessionPoints[sessionPoints.length - 1].ts * 1000).toISOString().slice(0, 10)
    : lastDate;

  // All points spanning today's full extended session (pre + regular + post).
  // When currentTradingPeriod is a future session (market closed, data is stale),
  // dayStart is tomorrow — filtering by it yields nothing. Fall back to lastDate so
  // yesterday's pre-market data is preserved in allPoints.
  const dayStart = periods?.pre?.start ?? periods?.regular?.start;
  const dayEnd   = periods?.post?.end  ?? periods?.regular?.end;
  const futureSession = dayStart && points[points.length - 1].ts < dayStart;
  const allPoints = (dayStart && dayEnd && !futureSession)
    ? points.filter(p => p.ts >= dayStart && p.ts < dayEnd)
    : points.filter(p => new Date(p.ts * 1000).toISOString().slice(0, 10) === lastDate);

  return {
    date:          sessionDate,
    previousClose,
    currency:      meta.currency || null,
    shortName:     meta.shortName || meta.longName || null,
    marketState:   deriveMarketState(periods),
    exchange:      meta.exchangeName || null,
    ...deriveExtendedPrices(points, periods?.pre, periods?.post),
    points:        sessionPoints,
    allPoints,
    tradingPeriods: periods || null,
  };
}

// Uses v1/finance/search — no auth required, returns sector/industry/quoteType.
async function fetchQuoteSummary(yahooSymbol) {
  const url  = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yahooSymbol)}&quotesCount=5&newsCount=0&enableFuzzyQuery=false`;
  const text = await fetchYahoo(url);
  const quotes = JSON.parse(text)?.quotes || [];
  const match  = quotes.find(q => q.symbol === yahooSymbol) || quotes[0];
  if (!match) return null;
  return {
    sector:    match.sector   ?? null,
    industry:  match.industry ?? null,
    quoteType: match.quoteType ?? null,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { fetchCandles, fetchDailyQuote, fetchIntraday, fetchQuoteSummary, fetchYahoo, sleep, FETCH_DELAY };
