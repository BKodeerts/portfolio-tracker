/**
 * Positions domain — shares, price/FX maps, splits, FIFO cost basis, dividends, realized P&L.
 * Pure module: no fs, no network. All data injected as arguments.
 */

const { FX_DEFS } = require('./fx.js');

const SPLIT_CANDIDATES = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100];

/**
 * Build per-ticker metadata from transactions + injected ticker_meta contents.
 */
function buildMeta(transactions, tickerMeta = {}) {
  const meta = {};
  for (const tx of transactions) {
    if (!meta[tx.ticker]) {
      const extra = tickerMeta[tx.ticker] || {};
      meta[tx.ticker] = {
        yahoo:           tx.yahoo,
        currency:        extra.manualPriceEur ? 'EUR' : (tx.currency || 'EUR'),
        label:           tx.label || tx.ticker,
        quoteType:       extra.quoteType       || null,
        sector:          extra.sector          || null,
        industry:        extra.industry        || null,
        geo:             extra.geo             || null,
        manualPriceEur:  extra.manualPriceEur  || null,
        manualPriceAsOf: extra.manualPriceAsOf || null,
      };
    }
  }
  return meta;
}

function buildManualPricesMap(meta) {
  const map = {};
  for (const m of Object.values(meta)) {
    if (m.manualPriceEur && m.manualPriceAsOf) {
      map[m.yahoo] = { eur: m.manualPriceEur, asOf: m.manualPriceAsOf };
    }
  }
  return map;
}

function findEarliestDate(transactions) {
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
}

/**
 * Forward-fill price maps for all symbols over sortedDates.
 * manualPrices: { [yahooSymbol]: { eur, asOf } } — overrides from asOf date onward.
 */
function buildPriceMaps(rawCandles, sortedDates, manualPrices = {}) {
  const priceMaps = {};
  for (const [sym, candles] of Object.entries(rawCandles)) {
    const m = {};
    for (const c of candles) m[c.date] = c.close;
    const filled = {};
    let last = null;
    const manual = manualPrices[sym];
    for (const d of sortedDates) {
      if (manual && d >= manual.asOf) {
        last = manual.eur;
      } else if (m[d] != null) {
        last = m[d];
      }
      if (last != null) filled[d] = last;
    }
    priceMaps[sym] = filled;
  }
  return priceMaps;
}

/**
 * Build per-currency forward-filled FX rate maps over sortedDates.
 * Returns { [currency]: { [date]: rate } } where rate = EUR-per-unit.
 */
function buildFxRateMaps(rawCandles, sortedDates, currencies) {
  const maps = {};
  const today = new Date().toISOString().slice(0, 10);
  for (const ccy of currencies) {
    const def = FX_DEFS[ccy];
    if (!def) continue;
    const raw = {};
    let latestFxDate = null;
    for (const c of (rawCandles[def.symbol] || [])) {
      raw[c.date] = c.close;
      if (!latestFxDate || c.date > latestFxDate) latestFxDate = c.date;
    }
    // Warn if FX data is more than 2 trading days stale (accounts for weekends)
    if (latestFxDate) {
      const ageDays = (new Date(today) - new Date(latestFxDate)) / 86400000;
      if (ageDays > 4) {
        console.warn(`[FX] ${ccy} (${def.symbol}) rate is ${Math.round(ageDays)} days stale — valuations may be inaccurate`);
      }
    }
    const map = {};
    let last = def.fallback;
    for (const d of sortedDates) {
      if (raw[d] != null) last = raw[d];
      map[d] = last;
    }
    maps[ccy] = map;
  }
  return maps;
}

// ── Split detection & share adjustment ───────────────────────────────────────

function detectSplitFactors(meta, transactions, priceMaps, fxMaps) {
  const splitFactors = {};
  for (const ticker of Object.keys(meta)) {
    const m = meta[ticker];
    if (m.manualPriceEur) { splitFactors[ticker] = 1; continue; }
    const firstBuy = transactions
      .filter(t => t.ticker === ticker && t.shares > 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!firstBuy) { splitFactors[ticker] = 1; continue; }
    const yahooPrice = priceMaps[m.yahoo]?.[firstBuy.date];
    if (!yahooPrice) { splitFactors[ticker] = 1; continue; }
    // txPrice: convert EUR cost to the stock's native currency for ratio comparison
    const def = FX_DEFS[m.currency];
    const rate  = def ? (fxMaps[m.currency]?.[firstBuy.date] || def.fallback) : 1;
    const scale = def?.scale || 1;
    const txPrice = (m.currency && m.currency !== 'EUR' && def)
      ? (firstBuy.costEur / firstBuy.shares) * rate * scale
      : firstBuy.costEur / firstBuy.shares;
    const ratio = yahooPrice / txPrice;
    splitFactors[ticker] = ratio > 2
      ? SPLIT_CANDIDATES.reduce((best, f) => (Math.abs(f - ratio) < Math.abs(best - ratio) ? f : best), 1)
      : 1;
  }
  return splitFactors;
}

function makeAdjShares(meta, priceMaps, splitFactors, fxMaps) {
  return function adjShares(tx, ticker) {
    const factor = splitFactors[ticker] || 1;
    if (factor === 1) return tx.shares;
    const m = meta[ticker];
    const yahooPrice = priceMaps[m.yahoo]?.[tx.date];
    if (!yahooPrice) return tx.shares;
    const def = FX_DEFS[m.currency];
    const rate  = def ? (fxMaps[m.currency]?.[tx.date] || def.fallback) : 1;
    const scale = def?.scale || 1;
    const txPrice = (m.currency && m.currency !== 'EUR' && def)
      ? (Math.abs(tx.costEur) / Math.abs(tx.shares)) * rate * scale
      : Math.abs(tx.costEur) / Math.abs(tx.shares);
    return yahooPrice / txPrice > 2 ? tx.shares / factor : tx.shares;
  };
}

function computeNetShares(meta, transactions, adjSharesFn) {
  const netShares = {}, buyInvested = {};
  for (const ticker of Object.keys(meta)) {
    let net = 0, invested = 0;
    for (const tx of transactions.filter(t => t.ticker === ticker && !isDividend(t))) {
      net += adjSharesFn(tx, ticker);
      if (tx.shares > 0) invested += tx.costEur;
    }
    netShares[ticker]   = net;
    buyInvested[ticker] = invested;
  }
  return { netShares, buyInvested };
}

// ── Dividend helpers ──────────────────────────────────────────────────────────

/** True when a transaction represents a dividend (cash income, no shares). */
function isDividend(tx) {
  return tx.type === 'dividend';
}

/**
 * Compute dividend income per ticker and total.
 */
function computeDividends(txsByTicker) {
  const perTicker = {};
  let total = 0;
  for (const [ticker, txs] of Object.entries(txsByTicker)) {
    // costEur must be positive for a dividend; guard against accidental negative entries
    const sum = txs.filter(isDividend).reduce((s, tx) => s + Math.max(0, tx.costEur), 0);
    if (sum > 0) perTicker[ticker] = Math.round(sum * 100) / 100;
    total += sum;
  }
  return { perTicker, total: Math.round(total * 100) / 100 };
}

// ── FIFO cost basis & realized P&L ───────────────────────────────────────────

/**
 * FIFO open lots with their native-currency cost per share (unscaled: GBX lots
 * are in GBP here — apply FX_DEFS scale for display in pence).
 * Returns null when the currency has no FX definition/rates.
 */
function fifoOpenLotsNative(txs, ticker, adjSharesFn, fxMaps, ccy) {
  const def = FX_DEFS[ccy];
  if (!def || !fxMaps[ccy]) return null;
  const lots = [];
  for (const tx of txs.filter(t => !isDividend(t)).sort((a, b) => a.date.localeCompare(b.date))) {
    const sh = adjSharesFn(tx, ticker);
    if (tx.shares > 0) {
      const fxTx = fxMaps[ccy]?.[tx.date] || def.fallback;
      lots.push({ shares: sh, costNativePerShare: (tx.costEur / sh) * fxTx });
    } else {
      let toSell = -sh;
      for (const lot of lots) {
        const sold = Math.min(lot.shares, toSell);
        lot.shares -= sold;
        toSell -= sold;
        if (toSell <= 0) break;
      }
    }
  }
  return lots.filter(l => l.shares > 0);
}

/**
 * FIFO native-currency cost basis for open lots, converted to EUR at the latest FX rate.
 * Returns the EUR value the open position would have if prices hadn't moved but FX did.
 * Subtracting pos.cost from this gives the pure FX P&L.
 */
function fifoCostNativeEur(txs, ticker, adjSharesFn, fxMaps, ccy, latestDate) {
  const lots = fifoOpenLotsNative(txs, ticker, adjSharesFn, fxMaps, ccy);
  if (lots == null) return null;
  const def = FX_DEFS[ccy];
  const fxRate1 = fxMaps[ccy]?.[latestDate] || def.fallback;
  const totalNative = lots.reduce((s, l) => s + l.shares * l.costNativePerShare, 0);
  return totalNative / fxRate1;
}

/**
 * Average cost per share in the trading currency (in the units Yahoo quotes,
 * i.e. GBX averages are in pence). EUR positions average costEur directly.
 * Returns null when no open shares or FX data is missing for the currency.
 */
function fifoAvgCostNative(txs, ticker, adjSharesFn, fxMaps, ccy) {
  const nonDiv = txs.filter(t => !isDividend(t));
  if (!ccy || ccy === 'EUR' || !FX_DEFS[ccy]) {
    // EUR (or unknown currency): FIFO EUR cost of open shares / open shares
    let net = 0;
    for (const tx of nonDiv) net += adjSharesFn(tx, ticker);
    if (net <= 0) return null;
    const today = '9999-12-31';
    return fifoCostBasis(txs, ticker, today, adjSharesFn) / net;
  }
  const lots = fifoOpenLotsNative(txs, ticker, adjSharesFn, fxMaps, ccy);
  if (!lots || !lots.length) return null;
  const totalShares = lots.reduce((s, l) => s + l.shares, 0);
  if (totalShares <= 0) return null;
  const totalNative = lots.reduce((s, l) => s + l.shares * l.costNativePerShare, 0);
  const scale = FX_DEFS[ccy].scale || 1;
  return (totalNative / totalShares) * scale;
}

/**
 * FIFO cost basis for a ticker up to a specific date.
 */
function fifoCostBasis(txs, ticker, upToDate, adjSharesFn) {
  const lots = [];
  for (const tx of txs.filter(t => t.date <= upToDate && !isDividend(t)).sort((a, b) => a.date.localeCompare(b.date))) {
    const sh = adjSharesFn(tx, ticker);
    if (tx.shares > 0) {
      lots.push({ shares: sh, costPerShare: tx.costEur / sh });
    } else {
      let toSell = -sh;
      for (const lot of lots) {
        const sold = Math.min(lot.shares, toSell);
        lot.shares -= sold;
        toSell -= sold;
        if (toSell <= 0) break;
      }
    }
  }
  return lots.filter(l => l.shares > 0).reduce((s, l) => s + l.shares * l.costPerShare, 0);
}

/**
 * Compute realized P&L per ticker using FIFO.
 * Sells: proceeds = tx.costEur (always absolute EUR value from DeGiro).
 */
function computeRealizedPl(txsByTicker, adjSharesFn) {
  const perTicker = {};
  let total = 0;
  for (const [ticker, txs] of Object.entries(txsByTicker)) {
    const sorted = [...txs].filter(tx => !isDividend(tx)).sort((a, b) => a.date.localeCompare(b.date));
    const lots = [];
    let realized = 0;
    for (const tx of sorted) {
      const adjSh = adjSharesFn(tx, ticker);
      if (tx.shares > 0) {
        lots.push({ shares: adjSh, costPerShare: tx.costEur / adjSh });
      } else {
        const salePricePerShare = tx.costEur / Math.abs(adjSh);
        let toSell = Math.abs(adjSh);
        for (const lot of lots) {
          const sold = Math.min(lot.shares, toSell);
          realized += sold * (salePricePerShare - lot.costPerShare);
          lot.shares -= sold;
          toSell -= sold;
          if (toSell <= 0) break;
        }
      }
    }
    perTicker[ticker] = Math.round(realized * 100) / 100;
    total += realized;
  }
  return { perTicker, total: Math.round(total * 100) / 100 };
}

module.exports = {
  SPLIT_CANDIDATES,
  buildMeta,
  buildManualPricesMap,
  findEarliestDate,
  buildPriceMaps,
  buildFxRateMaps,
  detectSplitFactors,
  makeAdjShares,
  computeNetShares,
  isDividend,
  computeDividends,
  fifoOpenLotsNative,
  fifoCostNativeEur,
  fifoAvgCostNative,
  fifoCostBasis,
  computeRealizedPl,
};
