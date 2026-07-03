/**
 * FX domain — single source of truth for currency definitions and EUR conversion.
 * Pure module: no fs, no network. All data injected as arguments.
 */

const FX_FALLBACK = 1.09; // backward compat (EURUSD)

// FX definitions: stock currency → { Yahoo FX symbol (EUR-base), fallback rate, optional /scale }
const FX_DEFS = {
  USD: { symbol: 'EURUSD=X', fallback: 1.09  },
  GBP: { symbol: 'EURGBP=X', fallback: 0.86  },
  GBX: { symbol: 'EURGBP=X', fallback: 0.86, scale: 100 }, // pence sterling
  CLP: { symbol: 'EURCLP=X', fallback: 1000  },
  CHF: { symbol: 'EURCHF=X', fallback: 0.95  },
  SEK: { symbol: 'EURSEK=X', fallback: 11.5  },
  DKK: { symbol: 'EURDKK=X', fallback: 7.46  },
  NOK: { symbol: 'EURNOK=X', fallback: 11.5  },
  CAD: { symbol: 'EURCAD=X', fallback: 1.5   },
  AUD: { symbol: 'EURAUD=X', fallback: 1.65  },
  JPY: { symbol: 'EURJPY=X', fallback: 160   },
  MXN: { symbol: 'EURMXN=X', fallback: 20    },
  BRL: { symbol: 'EURBRL=X', fallback: 5.5   },
};

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
