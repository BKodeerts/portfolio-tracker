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

const DAY_S = 86400;

/**
 * Predicate: does `ts` fall inside the exchange's regular trading window?
 * Judged by time-of-day, so it applies to every day in the payload rather than
 * only the one `periods` describes. Null when there is no regular period.
 *
 * Every "previous close" lookup must go through this. With includePrePost=true
 * the payload interleaves pre/post ticks, and an extended-hours tick is NOT a
 * close — scanning raw points backwards lands on the previous day's
 * post-market price (post runs hours past the bell), not its closing price.
 */
function makeInRegularTod(regular) {
  if (!regular) return null;
  const startTod = ((regular.start % DAY_S) + DAY_S) % DAY_S;
  const endTod   = ((regular.end   % DAY_S) + DAY_S) % DAY_S;
  return (ts) => {
    const tod = ((ts % DAY_S) + DAY_S) % DAY_S;
    return endTod > startTod
      ? (tod >= startTod && tod < endTod)
      : (tod >= startTod || tod < endTod);
  };
}

function derivePreviousClose(points, periods, lastDate, meta) {
  // Last close of the prior REGULAR session. Two sets of extended-hours points
  // have to be skipped: today's (by looking before today's pre-market start)
  // AND the previous day's post-market run (by requiring a regular-hours
  // time-of-day). Without the second filter this returns yesterday's
  // post-market price, so every day-change % is measured off after-hours drift
  // instead of the official close.
  const inRegularTod = makeInRegularTod(periods?.regular);
  const isRegular = (ts) => !inRegularTod || inRegularTod(ts);
  const cutoff = periods?.pre?.start ?? periods?.regular?.start ?? null;
  if (cutoff) {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].ts < cutoff && isRegular(points[i].ts)) return points[i].close;
    }
  }
  // Fallback: last regular-hours point on a different calendar date.
  for (let i = points.length - 1; i >= 0; i--) {
    if (new Date(points[i].ts * 1000).toISOString().slice(0, 10) !== lastDate
        && isRegular(points[i].ts)) return points[i].close;
  }
  return metaPrevClose(meta) ?? meta.chartPreviousClose ?? null;
}

/**
 * Yahoo's chart meta calls this `previousClose`. An earlier version of this
 * file read `regularMarketPreviousClose`, which is a *quote*-endpoint field and
 * is absent here — so the fallback silently evaluated to undefined and dropped
 * through to `chartPreviousClose`, the close before the whole fetched range
 * (five sessions stale at range=5d). Read both, correct name first.
 */
function metaPrevClose(meta) {
  return meta?.previousClose ?? meta?.regularMarketPreviousClose ?? null;
}

/**
 * Replace bar-derived closes with the session's official ones.
 *
 * A 5-minute bar's close is not a closing price: the last regular bar spans
 * 15:55–16:00 ET, while the official close is set by the closing cross that
 * prints at 16:00:01 and lands in the 20:00 UTC (post-market) bar. Every day is
 * affected — ASTS 2026-07-31 closed at 58.98 but its last bar read 58.93, and
 * the day before, 58.44 vs 58.455. Those errors compound in a change %:
 * 58.93/58.455 gives +0.81% where Yahoo and NASDAQ both report +0.92%.
 *
 * Chart meta carries the authoritative pair for the session it describes:
 *   regularMarketPrice — that session's official close (or the live price)
 *   previousClose      — the official close of the session before it
 *
 * `regularMarketTime` dates that pair, and it is only trusted when it matches
 * the drawn session, so a meta that has already rolled over to the next session
 * (or is stale) can never leak the wrong day's prices in.
 *
 * The drawn session's final point is pinned to the official close too: the card
 * number and the sparkline must not disagree, which is the whole reason the
 * baseline work in 0.13.4–0.13.6 existed.
 */
function applyOfficialCloses(session, meta, sessionDate, todayStr) {
  const metaDate = meta?.regularMarketTime != null
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : null;
  if (metaDate == null || metaDate !== sessionDate) return session;

  const officialClose = meta.regularMarketPrice ?? null;
  const officialPrev  = metaPrevClose(meta);
  const { sessionPoints, previousClose, sessionPreviousClose } = session;

  const points = (officialClose != null && sessionPoints.length > 0)
    ? [...sessionPoints.slice(0, -1),
       { ...sessionPoints[sessionPoints.length - 1], close: officialClose }]
    : sessionPoints;

  // When the drawn session is a past one (pre-market, weekend), `previousClose`
  // is what the card renders as that session's price, so it takes the drawn
  // session's official close. Once the drawn session is today, `previousClose`
  // is the day-change baseline and takes the preceding session's close.
  const drawnIsPastSession = sessionDate !== todayStr;
  return {
    sessionPoints: points,
    previousClose: drawnIsPastSession
      ? (officialClose ?? previousClose)
      : (officialPrev ?? previousClose),
    sessionPreviousClose: officialPrev ?? sessionPreviousClose,
  };
}

// Returns { sessionPoints, previousClose, sessionPreviousClose } for the most
// relevant trading session.
// When today's regular session has data, use it with the standard previousClose.
// When it's pre-market (some today points exist but regular hasn't started), use
// the fallback window with the standard previousClose (last close before today's pre/regular start).
// When the market is fully closed with no today points at all (showing yesterday's stale
// session), anchor previousClose to the last close BEFORE yesterday's session — otherwise
// the baseline equals yesterday's close and every % reads 0.
//
// `sessionPreviousClose` is the baseline of the DRAWN session (the close before
// the day sessionPoints belong to) — what charts must measure the drawn line
// against. It equals previousClose in every state except pre-market, where
// previousClose is the drawn (previous) session's own close: previousClose
// stays the day-change/market-price anchor, while drawing yesterday's session
// against its own close would pin the line's end onto the baseline and flip
// how the day reads.
function deriveSession(points, periods, lastDate, meta) {
  const regular = periods?.regular;
  if (!regular) {
    const pc = derivePreviousClose(points, periods, lastDate, meta);
    return { sessionPoints: points, previousClose: pc, sessionPreviousClose: pc };
  }

  const inRegularTod = makeInRegularTod(regular);
  // Last regular-hours close strictly before calendar day `dateStr` — the baseline
  // for a fully-closed session, so its move isn't measured against its own close
  // (which would make every % read 0).
  //
  // Returns null when the payload doesn't reach back that far. Callers must NOT
  // fall back to meta's previousClose here: when the drawn session is
  // the previous session (pre-market, weekend), that field IS the drawn
  // session's own close, which is the very thing this lookup exists to avoid.
  const closeBeforeDay = (dateStr) => {
    if (dateStr == null) return null;
    const dayStartTs = Date.parse(dateStr + 'T00:00:00Z') / 1000;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].ts < dayStartTs && inRegularTod(points[i].ts)) return points[i].close;
    }
    return null;
  };
  // Last-resort baseline for a drawn session whose prior close isn't in the
  // payload: the session's own open, so the line still shows that session's
  // real move (matching the "prev session" card label) instead of being pinned
  // flat onto its own close.
  const sessionOpenOr = (pts, fallback) => pts.length > 0 ? pts[0].close : fallback;

  const serverToday = new Date().toISOString().slice(0, 10);
  const todayPts = points.filter(p => p.ts >= regular.start && p.ts < regular.end);
  if (todayPts.length > 0) {
    // Guard: only trust these if they're actually from today's calendar date.
    // Yahoo sometimes serves a stale currentTradingPeriod pointing to yesterday's
    // session window while today's candles are already in the data array.
    if (todayPts.some(p => new Date(p.ts * 1000).toISOString().slice(0, 10) === serverToday)) {
      const pc = derivePreviousClose(points, periods, lastDate, meta);
      return { sessionPoints: todayPts, previousClose: pc, sessionPreviousClose: pc };
    }
    // Weekend / holiday: currentTradingPeriod describes the last *completed*
    // session (e.g. Friday's when fetched on Saturday) and no newer candles
    // exist. Those points ARE the last session — keep them, with the baseline
    // anchored before their day. Without this the guard above discards them and
    // every fallback below (all `ts < regular.start`) misses them too, leaving
    // sessionPoints empty all weekend.
    if (Date.now() / 1000 >= regular.end && lastDate !== serverToday) {
      const pc = closeBeforeDay(lastDate) ?? sessionOpenOr(todayPts, metaPrevClose(meta));
      return { sessionPoints: todayPts, previousClose: pc, sessionPreviousClose: pc };
    }
    // currentTradingPeriod.regular is stale — fall through to date-based heuristics
  }

  // todayPts is empty: either the market hasn't opened yet, or Yahoo's
  // currentTradingPeriod doesn't align with the actual data (stale CDN, period
  // pointing to next session, etc.).  Before falling back to yesterday, check
  // whether any points from today's calendar date fall inside the regular-hours
  // window defined by time-of-day.  This handles the common case of Yahoo
  // returning the next-session's regular.start even when today's candles exist.
  if (lastDate === serverToday) {
    const todayByDatePts = points.filter(p =>
      new Date(p.ts * 1000).toISOString().slice(0, 10) === serverToday && inRegularTod(p.ts),
    );
    if (todayByDatePts.length > 0) {
      const pc = derivePreviousClose(points, periods, lastDate, meta);
      return { sessionPoints: todayByDatePts, previousClose: pc, sessionPreviousClose: pc };
    }
  }

  // No regular-session data today — fall back to the last calendar day that has
  // regular-hours data, narrowed to that day's regular-hours window (by time-of-day).
  // This excludes pre/post points so the dashboard shows the actual market move, not
  // the extended move. The day cannot come from lastDate: once today's pre-market
  // candles arrive, lastDate IS today — which has no regular-hours data yet — and
  // keying on it would leave the fallback empty until the regular open.
  let staleDate = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].ts < regular.start && inRegularTod(points[i].ts)) {
      staleDate = new Date(points[i].ts * 1000).toISOString().slice(0, 10);
      break;
    }
  }
  const stalePts = staleDate == null ? [] : points.filter(p =>
    p.ts < regular.start &&
    new Date(p.ts * 1000).toISOString().slice(0, 10) === staleDate &&
    inRegularTod(p.ts),
  );
  const preStart  = periods?.pre?.start;
  const inPreToday = preStart && points.some(p => p.ts >= preStart);

  if (inPreToday) {
    // PRE state: standard previousClose (last close before today's pre/regular
    // start — i.e. the drawn session's own close), but charts drawing the stale
    // session need the close before THAT day as their baseline.
    const pc = derivePreviousClose(points, periods, lastDate, meta);
    return {
      sessionPoints: stalePts,
      previousClose: pc,
      sessionPreviousClose: closeBeforeDay(staleDate) ?? sessionOpenOr(stalePts, pc),
    };
  }

  // Fully closed — anchor previousClose to the last regular close BEFORE the stale
  // day (not just before stalePts[0], which would pick up that day's own pre-market).
  if (stalePts.length > 0) {
    const pc = closeBeforeDay(staleDate)
      ?? sessionOpenOr(stalePts, metaPrevClose(meta));
    return { sessionPoints: stalePts, previousClose: pc, sessionPreviousClose: pc };
  }

  const pc = derivePreviousClose(points, periods, lastDate, meta);
  return { sessionPoints: stalePts, previousClose: pc, sessionPreviousClose: pc };
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
  // range=5d, not 2d. We need the previous session available when a market just
  // opened (range=1d returns only the new, sparse session) AND the session
  // before THAT one, because during pre-market the drawn session is the
  // previous session and its baseline is the close preceding it. With 2d the
  // payload holds exactly [previous session, today], so that lookup found
  // nothing and fell through to Yahoo's meta — whose previousClose during
  // pre-market is the drawn session's own close, pinning the line onto its
  // baseline. 5d also survives long weekends and holidays.
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=5d&includePrePost=true`;
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

  const derived = deriveSession(points, periods, lastDate, meta);

  // Use the date of the session points themselves, not the last raw candle date.
  // lastDate may be today (due to pre-market candles) while sessionPoints are from
  // yesterday, which would fool the frontend's freshness/stale-detection logic.
  const sessionDate = derived.sessionPoints.length > 0
    ? new Date(derived.sessionPoints[derived.sessionPoints.length - 1].ts * 1000).toISOString().slice(0, 10)
    : lastDate;

  // Bar closes are not closing prices — swap in the official ones where meta
  // describes this very session.
  const { sessionPoints, previousClose, sessionPreviousClose } = applyOfficialCloses(
    derived, meta, sessionDate, new Date().toISOString().slice(0, 10),
  );

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
    sessionPreviousClose,
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

// ── Ticker reference stats (52w range, volumes, mkt cap, P/E) ────────────────

// Generic GET that exposes status + response headers (fetchYahooRaw only
// returns the body), needed for the cookie/crumb handshake below.
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, ...headers }, timeout: 15000 }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Yahoo's quote endpoints (marketCap / trailingPE / avg volume) require a
// session cookie + crumb since 2023. Cache the pair per process; drop it on
// 401 so the next call re-authenticates. Everything here is best-effort —
// callers must treat a null result as "fields unavailable".
let _yahooAuth = null;
async function getYahooAuth() {
  if (_yahooAuth) return _yahooAuth;
  try {
    // fc.yahoo.com 404s, but sets the session cookie we need.
    const r1 = await httpsGet('https://fc.yahoo.com/');
    const cookie = (r1.headers['set-cookie'] || [])
      .map(c => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
    if (!cookie) return null;
    const r2 = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', { Cookie: cookie });
    const crumb = (r2.body || '').trim();
    if (r2.status !== 200 || !crumb || crumb.includes('{')) return null;
    _yahooAuth = { cookie, crumb };
    return _yahooAuth;
  } catch (e) {
    console.warn(`[Yahoo] crumb handshake failed: ${e.message}`);
    return null;
  }
}

// Best-effort v7 quote: marketCap, trailingPE, 3-month average volume.
// Returns null when the crumb dance or the quote call fails.
async function fetchQuoteStats(yahooSymbol) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await getYahooAuth();
    if (!auth) return null;
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}&crumb=${encodeURIComponent(auth.crumb)}`;
    try {
      const r = await httpsGet(url, { Cookie: auth.cookie });
      if (r.status === 401 || r.status === 403) { _yahooAuth = null; continue; } // stale crumb — one retry
      if (r.status !== 200) return null;
      const q = JSON.parse(r.body)?.quoteResponse?.result?.[0];
      if (!q) return null;
      return {
        marketCap:  q.marketCap ?? null,
        trailingPE: q.trailingPE ?? null,
        avgVolume:  q.averageDailyVolume3Month ?? null,
        volume:     q.regularMarketVolume ?? null,
      };
    } catch (e) {
      console.warn(`[Yahoo] quote stats failed for ${yahooSymbol}: ${e.message}`);
      return null;
    }
  }
  return null;
}

// Reference stats from the (unauthenticated) chart endpoint: 52-week range,
// current price, last volume, and a 3-month average volume from the candles.
// Fields missing from the response come back null.
async function fetchChartStats(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=3mo&includePrePost=false`;
  const text = await fetchYahoo(url);
  const result = JSON.parse(text)?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const volumes = (result.indicators?.quote?.[0]?.volume || []).filter(v => v != null && v > 0);
  const avgVolume = volumes.length ? Math.round(volumes.reduce((s, v) => s + v, 0) / volumes.length) : null;
  return {
    low52w:    meta.fiftyTwoWeekLow  ?? null,
    high52w:   meta.fiftyTwoWeekHigh ?? null,
    price:     meta.regularMarketPrice ?? null,
    volume:    meta.regularMarketVolume ?? volumes[volumes.length - 1] ?? null,
    avgVolume,
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

module.exports = { fetchCandles, fetchDailyQuote, fetchIntraday, fetchQuoteSummary, fetchChartStats, fetchQuoteStats, fetchYahoo, sleep, FETCH_DELAY, deriveSession, applyOfficialCloses, makeInRegularTod };
