/**
 * FX domain — single source of truth for currency definitions and EUR conversion.
 * Pure module: no fs, no network. All data injected as arguments.
 */

const FX_FALLBACK = 1.09; // backward compat (EURUSD)

// FX definitions: stock currency → { Yahoo FX symbol (EUR-base), fallback rate, optional /scale }
// Shared with the frontend (src/lib/constants.ts) via shared/fx-defs.json.
const FX_DEFS = require('../../shared/fx-defs.json');

/**
 * Convert a price in any currency to EUR using a date-keyed fxMaps object.
 * fxMaps: { [currency]: { [date]: rate } } where rate = EUR-per-unit (e.g. EURUSD=1.09 means 1 EUR = 1.09 USD).
 */
function toEur(currency, price, date, fxMaps) {
  if (!currency || currency === 'EUR') return price;
  const def = FX_DEFS[currency];
  if (!def) return price;
  const rate = fxMaps[currency]?.[date] || def.fallback;
  return price / rate / (def.scale || 1);
}

/**
 * Convert a price to EUR using a flat live-rates object { [currency]: rate }.
 */
function toEurAtRate(currency, price, liveRates) {
  if (!currency || currency === 'EUR') return price;
  const def = FX_DEFS[currency];
  if (!def) return price;
  const rate = liveRates[currency] || def.fallback;
  return price / rate / (def.scale || 1);
}

/** Collect all unique non-EUR currencies that need FX data. */
function nonEurCurrencies(meta) {
  return [...new Set(Object.values(meta).map(m => m.currency).filter(c => c && c !== 'EUR' && FX_DEFS[c]))];
}

/** Return deduped Yahoo FX symbols needed for a set of currencies. */
function fxSymbolsFor(currencies) {
  return [...new Set(currencies.map(c => FX_DEFS[c]?.symbol).filter(Boolean))];
}

module.exports = { FX_DEFS, FX_FALLBACK, toEur, toEurAtRate, nonEurCurrencies, fxSymbolsFor };
