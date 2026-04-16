/**
 * Bonus tracker — store warrants/grants that track an index.
 * Data stored in data/bonus.json as an array of entries.
 */
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const router = express.Router();
const {
  fetchCandles,
  fetchDailyQuote,
  sleep,
  FETCH_DELAY,
} = require("../yahoo.js");
const { readCache, writeCache } = require("../cache.js");

const DATA_DIR =
  process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const BONUS_FILE = path.join(DATA_DIR, "bonus.json");


// ── Black-Scholes pricing ────────────────────────────────────────────────────
function normalCDF(x) {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** European call price via Black-Scholes */
function bsCallPrice(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, S - K); // expired → intrinsic only
  const d1 =
    (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}


/**
 * Annualized realized (historical) volatility from log returns over
 * the last `window` trading days strictly before `targetDate`.
 */
function historicalVol(candles, targetDate, window = 30) {
  const before = candles.filter((c) => c.date < targetDate);
  const slice = before.slice(-(window + 1));
  if (slice.length < 2) return null;
  const returns = [];
  for (let i = 1; i < slice.length; i++)
    returns.push(Math.log(slice[i].close / slice[i - 1].close));
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252);
}


function loadBonus() {
  try {
    return JSON.parse(fs.readFileSync(BONUS_FILE, "utf8"));
  } catch {
    return [];
  }
}
function saveBonus(items) {
  fs.writeFileSync(BONUS_FILE, JSON.stringify(items, null, 2));
}

async function getPriceAtDate(symbol, date) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `candles_bonus_${symbol}_${today}`;
  let candles = readCache(cacheKey, 24 * 60 * 60 * 1000);
  if (!candles) {
    candles = await fetchCandles(symbol, date);
    if (candles?.length) writeCache(cacheKey, candles);
    await sleep(FETCH_DELAY);
  }
  if (!candles?.length) return null;
  // Use the last trading day close before the grant date (platforms typically use prev-day close)
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const prev = [...sorted].reverse().find((c) => c.date < date);
  return prev?.close ?? sorted[0]?.close ?? null;
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

function computeCallPrice(item, grantIndexPrice, currentIndexPrice) {
  const r     = item.riskFreeRate ?? 0.02;
  const sigma = item.volatility ? item.volatility / 100 : 0.2;
  const isOtm = !currentIndexPrice || currentIndexPrice <= item.strikePrice;

  if (!item.expiryDate || !currentIndexPrice) {
    return { price: item.grantPrice, totalValue: item.quantity * item.grantPrice, isOutOfMoney: isOtm };
  }

  const T      = (new Date(item.expiryDate) - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
  const Tgrant = (new Date(item.expiryDate) - new Date(item.grantDate)) / (365.25 * 24 * 60 * 60 * 1000);

  // effectiveRatio anchors the BS price at grant to the actual grant price.
  // This ensures the chart starts at grantPrice on grant date regardless of σ/r.
  const bsAtGrant = grantIndexPrice ? bsCallPrice(grantIndexPrice, item.strikePrice, Tgrant, r, sigma) : 0;
  const effectiveRatio = bsAtGrant > 0 ? item.grantPrice / bsAtGrant : 1;
  const price = bsCallPrice(currentIndexPrice, item.strikePrice, T, r, sigma) * effectiveRatio;
  return { price, totalValue: item.quantity * price, isOutOfMoney: isOtm, sigmaUsed: sigma };
}

/**
 * Resolves pricing mode for an item given grant-time index price.
 * Returns { pricingMode, sigma, effectiveRatio }.
 */
function resolvePricing(item, grantIndexPrice) {
  const hasBs = item.type === 'call_option' && item.expiryDate && item.strikePrice;
  if (!hasBs) return { pricingMode: 'warrant', sigma: null, effectiveRatio: 1, r: 0 };

  const r     = item.riskFreeRate ?? 0.02;
  const sigma = item.volatility ? item.volatility / 100 : 0.2;
  const Tgrant = (new Date(item.expiryDate) - new Date(item.grantDate)) / (365.25 * 24 * 60 * 60 * 1000);
  const bsAtGrant = grantIndexPrice
    ? bsCallPrice(grantIndexPrice, item.strikePrice, Tgrant, r, sigma) : 0;
  const effectiveRatio = bsAtGrant > 0 ? item.grantPrice / bsAtGrant : 1;
  return { pricingMode: 'bs_ratio', sigma, effectiveRatio, r };
}

/**
 * Returns a per-candle value function for the history chart.
 * pricingMode: 'bs_ratio' | 'bs_direct' | 'warrant'
 */
function makeValueOf(item, { pricingMode, sigma, effectiveRatio, grantIndexPrice, r }) {
  const hasBs = item.type === 'call_option' && item.expiryDate && item.strikePrice;
  return (close, date) => {
    if (hasBs && pricingMode === 'bs_ratio') {
      const T = (new Date(item.expiryDate) - new Date(date)) / (365.25 * 24 * 60 * 60 * 1000);
      return item.quantity * bsCallPrice(close, item.strikePrice, T, r, sigma) * effectiveRatio;
    }
    if (hasBs && pricingMode === 'bs_direct') {
      const T = (new Date(item.expiryDate) - new Date(date)) / (365.25 * 24 * 60 * 60 * 1000);
      return item.quantity * bsCallPrice(close, item.strikePrice, T, r, sigma);
    }
    return grantIndexPrice ? item.quantity * item.grantPrice * (close / grantIndexPrice) : 0;
  };
}

function computeWarrantPrice(item, grantIndexPrice, currentIndexPrice) {
  const price = (grantIndexPrice && currentIndexPrice)
    ? item.grantPrice * (currentIndexPrice / grantIndexPrice)
    : item.grantPrice;
  return { price, totalValue: item.quantity * price };
}

// GET /api/bonus — return all bonus entries with computed current values
router.get('/bonus', async (_req, res) => {
  const items  = loadBonus();
  const result = [];

  for (const item of items) {
    const rawGrantIndexPrice = item.grantIndexPriceOverride ?? await getPriceAtDate(item.symbol, item.grantDate);
    const rawCurrentPrice    = await getCurrentPrice(item.symbol);
    // Apply NAV correction factor: Yahoo market price → estimated NAV
    // Needed for ETFs where Yahoo shows exchange price (with premium) but the option platform uses official NAV.
    // e.g. SC0D.DE trades ~0.9% above NAV; set navCorrectionFactor=0.991 to correct.
    // Override comes from the offering letter (already NAV-correct) → never apply navFactor to it.
    // Auto-fetched Yahoo price at grant has the same premium → apply navFactor for consistency.
    const navFactor          = item.navCorrectionFactor ?? 1;
    const grantIndexPrice = (item.grantIndexPriceOverride == null && rawGrantIndexPrice != null)
      ? rawGrantIndexPrice * navFactor
      : rawGrantIndexPrice;
    const currentIndexPrice  = rawCurrentPrice == null ? null : rawCurrentPrice * navFactor;
    const pct = (grantIndexPrice && currentIndexPrice)
      ? (currentIndexPrice - grantIndexPrice) / grantIndexPrice * 100 : 0;

    const computed = (item.type === 'call_option' && item.strikePrice)
      ? computeCallPrice(item, grantIndexPrice, currentIndexPrice)
      : computeWarrantPrice(item, grantIndexPrice, currentIndexPrice);
    const { price, totalValue, isOutOfMoney } = computed;
    // sigmaUsed is set by computeCallPrice: a number if BS was used, null if warrant fallback
    const sigmaUsedPct = computed.sigmaUsed == null
      ? null
      : Math.round(computed.sigmaUsed * 10000) / 100;

    // Belgian tax: VAA = N × slotkoers (= option grant price per unit, not the underlying)
    // Taxable on day 60 after offer date; exempt from social security if accepted within 10 days
    const taxExtras = {};
    if (item.type === 'call_option' && item.grantPrice) {
      const taxRate  = item.taxRate ?? 53.5;
      const vatGross = item.quantity * item.grantPrice;
      const vatTax   = vatGross * taxRate / 100;
      const taxDate  = new Date(item.grantDate);
      taxDate.setDate(taxDate.getDate() + 60);
      Object.assign(taxExtras, {
        vatGross:    Math.round(vatGross * 100) / 100,
        vatTax:      Math.round(vatTax * 100) / 100,
        taxableDate: taxDate.toISOString().slice(0, 10),
        netValue:    Math.round((totalValue - vatTax) * 100) / 100,
      });
    }

    result.push({
      ...item,
      grantIndexPrice,
      currentIndexPrice,
      rawCurrentIndexPrice: rawCurrentPrice,
      currentWarrantPrice:  Math.round(price * 100) / 100,
      totalValue:           Math.round(totalValue * 100) / 100,
      changeSinceGrantPct:  Math.round(pct * 100) / 100,
      ...(item.type === 'call_option' && { isOutOfMoney, sigmaUsed: sigmaUsedPct }),
      ...taxExtras,
    });
  }
  res.json({ status: 'ok', data: result });
});

// POST /api/bonus — add or update a bonus entry
router.post("/bonus", (req, res) => {
  const {
    id,
    label,
    symbol,
    quantity,
    grantDate,
    grantPrice,
    grantIndexPriceOverride,
    type,
    strikePrice,
    ratio,
    expiryDate,
    volatility,
    riskFreeRate,
    taxRate,
    navCorrectionFactor,
  } = req.body;
  if (!symbol || !quantity || !grantDate || !grantPrice) {
    return res.status(400).json({
      status: 'error', message: 'symbol, quantity, grantDate en grantPrice zijn verplicht',
    });
  }
  const entry = {
    id: id || crypto.randomUUID(),
    label: label || symbol,
    symbol,
    quantity: Number(quantity),
    grantDate,
    grantPrice: Number(grantPrice),
    ...(grantIndexPriceOverride && { grantIndexPriceOverride: Number(grantIndexPriceOverride) }),
    ...(navCorrectionFactor && { navCorrectionFactor: Number(navCorrectionFactor) }),
    ...(type === "call_option" && {
      type,
      strikePrice: Number(strikePrice),
      ratio: Number(ratio) || 1,
      ...(expiryDate && { expiryDate }),
      ...(volatility && { volatility: Number(volatility) }),
      ...(riskFreeRate != null && { riskFreeRate: Number(riskFreeRate) }),
      taxRate: taxRate == null ? 53.5 : Number(taxRate),
    }),
  };
  const items = loadBonus();
  const idx = items.findIndex((i) => i.id === entry.id);
  if (idx >= 0) items[idx] = entry;
  else items.push(entry);
  saveBonus(items);
  res.json({ status: "ok", data: entry });
});

// GET /api/bonus/:id/history — historical option values for charting
router.get("/bonus/:id/history", async (req, res) => {
  const item = loadBonus().find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ status: 'error', message: 'not found' });

  const yearAgoGrant = (() => {
    const d = new Date(item.grantDate);
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const today = new Date().toISOString().slice(0, 10);

  const fetchCached = async (symbol, from) => {
    const cacheKey = `candles_bonus_${symbol}_${today}`;
    let c = readCache(cacheKey, 24 * 60 * 60 * 1000);
    if (!c) {
      c = await fetchCandles(symbol, from);
      if (c?.length) writeCache(cacheKey, c);
      await sleep(FETCH_DELAY);
    }
    return c || [];
  };

  const rawCandles = await fetchCached(item.symbol, yearAgoGrant);
  const navFactor = item.navCorrectionFactor ?? 1;

  // Apply NAV correction factor to every candle close (same correction as live price).
  // Override comes from the offering letter (already NAV-correct) → use as-is.
  // Auto-fetched Yahoo price at grant has the same premium as the candles → apply navFactor.
  const rawGrantIndexPrice = item.grantIndexPriceOverride ?? await getPriceAtDate(item.symbol, item.grantDate);
  const grantIndexPrice = (item.grantIndexPriceOverride == null && rawGrantIndexPrice != null)
    ? rawGrantIndexPrice * navFactor
    : rawGrantIndexPrice;

  const candles = navFactor === 1
    ? rawCandles
    : rawCandles.map((c) => ({ ...c, close: c.close * navFactor }));

  const { pricingMode, sigma, effectiveRatio, r } = resolvePricing(item, grantIndexPrice);

  const valueOf = makeValueOf(item, { pricingMode, sigma, effectiveRatio, grantIndexPrice, r });

  const points = candles
    .filter((c) => c.date >= item.grantDate)
    .map((c) => ({
      date: c.date,
      value: Math.round((valueOf(c.close, c.date) / item.quantity) * 100) / 100,
    }));

  // Prior-year series: only for warrant/proportional pricing (different T makes BS comparison meaningless)
  let priorPoints = [];
  if (pricingMode === 'warrant') {
    const yearAgoToday = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })();
    const currentFirst = candles.find((c) => c.date >= item.grantDate);
    const priorFirst = candles.find((c) => c.date >= yearAgoGrant);
    if (currentFirst && priorFirst) {
      const startY = valueOf(currentFirst.close, currentFirst.date);
      priorPoints = candles
        .filter((c) => c.date >= yearAgoGrant && c.date <= yearAgoToday)
        .map((c) => {
          const d = new Date(c.date);
          d.setFullYear(d.getFullYear() + 1);
          return {
            date: d.toISOString().slice(0, 10),
            value:
              Math.round(startY * (c.close / priorFirst.close) * 100) / 100,
          };
        });
    }
  }

  const histVolAtGrant = historicalVol(candles, item.grantDate, 30);
  const volDebug = {
    pricingMode,
    sigmaUsed:            sigma == null ? null : Math.round(sigma * 10000) / 100,
    historicalVolAtGrant: histVolAtGrant == null ? null : Math.round(histVolAtGrant * 10000) / 100,
  };

  res.json({ status: "ok", data: { points, priorPoints, volDebug } });
});

// DELETE /api/bonus/:id
router.delete("/bonus/:id", (req, res) => {
  const items = loadBonus().filter((i) => i.id !== req.params.id);
  saveBonus(items);
  res.json({ status: "ok" });
});

module.exports = router;
