const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "10mb" }));
const PORT = process.env.PORT || 3069;

// ============================================================
// CACHE CONFIG
// ============================================================
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, "cache");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const QUOTES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_DELAY = 100; // minimal delay between Yahoo requests
const INTRADAY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// ============================================================
// TRANSACTION DATA STORAGE
// ============================================================
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "transactions.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function getCacheFile(symbol) {
  const safe = symbol.replace(/[^a-zA-Z0-9.-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

function readCache(symbol, ttl) {
  const file = getCacheFile(symbol);
  const maxAge = ttl || CACHE_TTL;
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - raw._timestamp > maxAge) return null;
    return raw.data;
  } catch {
    return null;
  }
}

// Read cache even if expired — used as fallback when Yahoo returns 429
function readStaleCache(symbol) {
  const file = getCacheFile(symbol);
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return raw.data;
  } catch {
    return null;
  }
}

function writeCache(symbol, data) {
  const file = getCacheFile(symbol);
  try {
    fs.writeFileSync(file, JSON.stringify({ _timestamp: Date.now(), data }));
  } catch (e) {
    console.error(`Cache write failed for ${symbol}:`, e.message);
  }
}

// ============================================================
// YAHOO FINANCE FETCHER
// ============================================================
function fetchYahoo(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      headers: { 
        "User-Agent": "Mozilla/5.0 (compatible; PortfolioTracker/1.0)" 
      },
      timeout: 15000 
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function fetchCandles(yahooSymbol, fromDate) {
  const period1 = Math.floor(new Date(fromDate).getTime() / 1000) - 7 * 86400;
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;

  const text = await fetchYahoo(url);
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: closes[i] ?? null,
    }))
    .filter((d) => d.close !== null);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDailyQuote(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d&includePrePost=false`;
  const text = await fetchYahoo(url);
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  // Get the most recent valid close
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (closes[i] != null) {
      return {
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        close: closes[i],
      };
    }
  }
  return null;
}

async function fetchIntraday(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=1d&includePrePost=false`;
  const text = await fetchYahoo(url);
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const meta = result.meta || {};

  const points = timestamps
    .map((ts, i) => ({ ts, close: closes[i] ?? null }))
    .filter(d => d.close !== null);

  if (points.length === 0) return null;

  return {
    date: new Date(points[0].ts * 1000).toISOString().slice(0, 10),
    previousClose: meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? null,
    currency: meta.currency || null,
    points,
  };
}

// ============================================================
// API ROUTES
// ============================================================

// Fetch candles for a single symbol
app.get("/api/candles/:symbol", async (req, res) => {
  const symbol = req.params.symbol;
  const from = req.query.from || "2021-01-01";

  // Check cache first
  const cached = readCache(symbol);
  if (cached) {
    console.log(`[CACHE HIT] ${symbol}`);
    return res.json({ status: "ok", source: "cache", data: cached });
  }

  // Fetch from Yahoo
  try {
    console.log(`[FETCH] ${symbol} from ${from}`);
    const data = await fetchCandles(symbol, from);
    if (data && data.length > 0) {
      writeCache(symbol, data);
      return res.json({ status: "ok", source: "yahoo", data });
    }
    const stale = readStaleCache(symbol);
    if (stale) return res.json({ status: "ok", source: "stale_cache", data: stale });
    return res.json({ status: "error", message: `No data for ${symbol}` });
  } catch (e) {
    console.error(`[ERROR] ${symbol}:`, e.message);
    const stale = readStaleCache(symbol);
    if (stale) return res.json({ status: "ok", source: "stale_cache", data: stale });
    return res.status(502).json({ status: "error", message: e.message });
  }
});

// Batch fetch: get all symbols at once
app.get("/api/batch", async (req, res) => {
  const symbols = (req.query.symbols || "").split(",").filter(Boolean);
  const froms = (req.query.froms || "").split(",");

  if (symbols.length === 0) {
    return res.status(400).json({ status: "error", message: "No symbols provided" });
  }

  const results = {};
  const toFetch = [];

  // Check cache for each symbol
  for (const symbol of symbols) {
    const cached = readCache(symbol);
    if (cached) {
      console.log(`[CACHE HIT] ${symbol}`);
      results[symbol] = cached;
    } else {
      const idx = symbols.indexOf(symbol);
      toFetch.push({ symbol, from: froms[idx] || "2021-01-01" });
    }
  }

  // Fetch missing symbols with delay
  for (let i = 0; i < toFetch.length; i++) {
    const { symbol, from } = toFetch[i];
    try {
      console.log(`[FETCH] ${symbol} (${i + 1}/${toFetch.length})`);
      const data = await fetchCandles(symbol, from);
      if (data && data.length > 0) {
        writeCache(symbol, data);
        results[symbol] = data;
      } else {
        console.warn(`[EMPTY] ${symbol}: no data returned, trying stale cache`);
        results[symbol] = readStaleCache(symbol);
      }
    } catch (e) {
      console.error(`[ERROR] ${symbol}: ${e.message}, trying stale cache`);
      const stale = readStaleCache(symbol);
      if (stale) {
        console.log(`[STALE CACHE] ${symbol}: using expired cache as fallback`);
        results[symbol] = stale;
      } else {
        results[symbol] = null;
      }
    }

    // Rate limit delay between fetches
    if (i < toFetch.length - 1) {
      await sleep(FETCH_DELAY);
    }
  }

  const successCount = Object.values(results).filter(Boolean).length;
  console.log(`[BATCH] ${successCount}/${symbols.length} symbols loaded`);

  res.json({ status: "ok", data: results });
});

// Batch fetch daily quotes (latest close for each symbol)
app.get("/api/quotes", async (req, res) => {
  const symbols = (req.query.symbols || "").split(",").filter(Boolean);
  if (symbols.length === 0) {
    return res.status(400).json({ status: "error", message: "No symbols provided" });
  }

  const results = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const cacheKey = `quote_${symbol}`;
    const cached = readCache(cacheKey, QUOTES_CACHE_TTL);
    if (cached) {
      console.log(`[QUOTE CACHE HIT] ${symbol}`);
      results[symbol] = cached;
    } else {
      toFetch.push(symbol);
    }
  }

  for (let i = 0; i < toFetch.length; i++) {
    const symbol = toFetch[i];
    try {
      console.log(`[QUOTE FETCH] ${symbol} (${i + 1}/${toFetch.length})`);
      const quote = await fetchDailyQuote(symbol);
      if (quote) {
        const cacheKey = `quote_${symbol}`;
        writeCache(cacheKey, quote);
        results[symbol] = quote;
      } else {
        const stale = readStaleCache(`quote_${symbol}`);
        if (stale) console.log(`[QUOTE STALE] ${symbol}: using expired cache`);
        results[symbol] = stale || null;
      }
    } catch (e) {
      console.error(`[QUOTE ERROR] ${symbol}: ${e.message}`);
      const stale = readStaleCache(`quote_${symbol}`);
      if (stale) console.log(`[QUOTE STALE] ${symbol}: using expired cache`);
      results[symbol] = stale || null;
    }
    if (i < toFetch.length - 1) await sleep(FETCH_DELAY);
  }

  const successCount = Object.values(results).filter(Boolean).length;
  console.log(`[QUOTES] ${successCount}/${symbols.length} quotes loaded`);
  res.json({ status: "ok", data: results });
});

// Intraday 5-min candles for today
app.get("/api/intraday", async (req, res) => {
  const symbols = (req.query.symbols || "").split(",").filter(Boolean);
  const force = req.query.force === "1";
  if (symbols.length === 0) {
    return res.status(400).json({ status: "error", message: "No symbols provided" });
  }

  const results = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const cacheKey = `intraday_${symbol}`;
    const cached = !force && readCache(cacheKey, INTRADAY_CACHE_TTL);
    if (cached) {
      console.log(`[INTRADAY CACHE HIT] ${symbol}`);
      results[symbol] = cached;
    } else {
      toFetch.push(symbol);
    }
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

  res.json({ status: "ok", data: results });
});

// ISIN → Yahoo symbol lookup via Yahoo Finance search
const LOOKUP_SUFFIXES = {
  XETRA:".DE",XET:".DE",GER:".DE",XAMS:".AS",AMS:".AS",XPAR:".PA",EPA:".PA",
  XLON:".L",LSE:".L",XMIL:".MI",MIL:".MI",XBRU:".BR",BRU:".BR",XSWX:".SW",SWX:".SW",
  NSQ:"",NYSE:"",XNAS:"",XNYS:"",
};
app.get("/api/lookup", async (req, res) => {
  const { isin, exchange } = req.query;
  if (!isin) return res.status(400).json({ status: "error", message: "isin required" });

  const cacheKey = `lookup_${isin.replaceAll(/[^a-zA-Z0-9]/g, "_")}`;
  const cached = readCache(cacheKey, 30 * 24 * 60 * 60 * 1000);
  if (cached) return res.json({ status: "ok", symbol: cached.symbol });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&enableNavLinks=false`;
    const text = await fetchYahoo(url);
    const json = JSON.parse(text);
    const quotes = (json?.quotes || [])
      .filter(q => ["EQUITY", "ETF", "MUTUALFUND"].includes(q.quoteType));

    const sfx = exchange ? (LOOKUP_SUFFIXES[(exchange || "").toUpperCase()] ?? null) : null;
    let best = null;
    if (sfx !== null && sfx !== "") {
      best = quotes.find(q => q.symbol.endsWith(sfx));
    } else if (sfx === "") {
      best = quotes.find(q => !q.symbol.includes(".")) || quotes[0];
    }
    if (!best) best = quotes[0];
    if (!best) return res.json({ status: "not_found" });

    writeCache(cacheKey, { symbol: best.symbol });
    console.log(`[LOOKUP] ${isin} → ${best.symbol}`);
    return res.json({ status: "ok", symbol: best.symbol });
  } catch (e) {
    console.error(`[LOOKUP] ${isin}: ${e.message}`);
    return res.status(502).json({ status: "error", message: e.message });
  }
});

// Clear cache
app.post("/api/cache/clear", (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    files.forEach((f) => fs.unlinkSync(path.join(CACHE_DIR, f)));
    console.log(`[CACHE] Cleared ${files.length} files`);
    res.json({ status: "ok", cleared: files.length });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// Cache status
app.get("/api/cache/status", (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const entries = files.map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8"));
      const age = Date.now() - raw._timestamp;
      return {
        symbol: f.replace(".json", ""),
        age_minutes: Math.round(age / 60000),
        expired: age > CACHE_TTL,
        points: raw.data?.length || 0,
      };
    });
    res.json({ status: "ok", ttl_hours: CACHE_TTL / 3600000, entries });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// ============================================================
// TRANSACTION ROUTES
// ============================================================

app.get("/api/transactions", (req, res) => {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) return res.json({ status: "ok", data: [] });
    res.json({ status: "ok", data: JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, "utf8")) });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

app.post("/api/transactions", (req, res) => {
  try {
    const { mode, transactions } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ status: "error", message: "transactions must be an array" });
    }

    let final = transactions;
    if (mode === "merge") {
      const existing = fs.existsSync(TRANSACTIONS_FILE)
        ? JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, "utf8"))
        : [];
      const keys = new Set(existing.map(t => `${t.date}|${t.ticker}|${t.shares}`));
      const added = transactions.filter(t => !keys.has(`${t.date}|${t.ticker}|${t.shares}`));
      final = [...existing, ...added].sort((a, b) => a.date.localeCompare(b.date));
    } else {
      final = transactions.sort((a, b) => a.date.localeCompare(b.date));
    }

    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(final, null, 2));
    console.log(`[TRANSACTIONS] Saved ${final.length} (mode: ${mode || "replace"})`);
    res.json({ status: "ok", count: final.length });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// ============================================================
// HOME ASSISTANT SENSOR PUSH
// ============================================================
app.post("/api/ha/push", async (req, res) => {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return res.status(503).json({ error: "No SUPERVISOR_TOKEN — not running as HA addon" });

  const { total_value, daily_pl, positions = [] } = req.body;
  const base    = "http://supervisor/core/api/states";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function pushState(entity, state, attributes) {
    const r = await fetch(`${base}/${entity}`, {
      method: "POST", headers,
      body: JSON.stringify({ state: String(state), attributes }),
    });
    if (!r.ok) throw new Error(`HA API ${entity}: ${r.status} ${await r.text()}`);
  }

  try {
    await pushState("sensor.portfolio_total_value", (total_value || 0).toFixed(2), { unit_of_measurement: "€", friendly_name: "Portfolio Waarde", device_class: "monetary" });
    await pushState("sensor.portfolio_daily_pl",    (daily_pl    || 0).toFixed(2), { unit_of_measurement: "€", friendly_name: "Portfolio Dagresultaat" });
    for (const p of positions) {
      const slug = p.ticker.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await pushState(`sensor.portfolio_${slug}`, (p.value || 0).toFixed(2), {
        unit_of_measurement: "€", friendly_name: `Portfolio ${p.label || p.ticker}`,
        pl_eur: (p.pl || 0).toFixed(2), pl_pct: (p.plPct || 0).toFixed(2),
      });
    }
    console.log(`[HA] Pushed ${positions.length + 2} sensors`);
    res.json({ ok: true, pushed: positions.length + 2 });
  } catch (e) {
    console.error("[HA] Push failed:", e.message);
    res.status(502).json({ error: e.message });
  }
});

// ============================================================
// SERVE STATIC FRONTEND
// ============================================================
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ============================================================
// START
// ============================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Portfolio Tracker running at http://0.0.0.0:${PORT}`);
  console.log(`   Cache dir: ${CACHE_DIR}`);
  console.log(`   Cache TTL: ${CACHE_TTL / 3600000}h`);
  console.log(`   Fetch delay: ${FETCH_DELAY}ms (minimal)\n`);
});
