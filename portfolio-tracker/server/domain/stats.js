// Pure per-ticker price-return math — no I/O.
// Computes the stock's own price returns (not the user's position) over the
// fixed periods shown in the Stock Detail "Returns" card.

const RETURN_PERIODS = { '1m': 1, '6m': 6, '1y': 12, '3y': 36 };

/** `YYYY-MM-DD` minus n calendar months (UTC, clamps end-of-month overflow). */
function monthsBefore(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - months, d));
  // new Date clamps e.g. Apr 31 → May 1; pull back to the last day of the
  // intended month so "one month before May 31" is Apr 30, not May 1.
  if (t.getUTCDate() !== d) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}

/**
 * Price returns of a stock over 1M / 6M / 1Y / 3Y / all, in percent.
 *
 * @param {Array<{date: string, close: number}>} candles daily candles, ascending by date
 * @param {number} currentPrice current market price (native currency)
 * @param {string} today `YYYY-MM-DD`
 * @returns {{ '1m': number|null, '6m': number|null, '1y': number|null, '3y': number|null, all: number|null }}
 *   A period is null when the listing history doesn't span it ("All" always
 *   uses the first available close, so it can be lower than 3Y).
 */
function computePriceReturns(candles, currentPrice, today) {
  const out = { '1m': null, '6m': null, '1y': null, '3y': null, all: null };
  if (!Array.isArray(candles) || !Number.isFinite(currentPrice) || currentPrice <= 0) return out;

  const valid = candles.filter((c) => c && Number.isFinite(c.close) && c.close > 0 && c.date);
  if (valid.length === 0) return out;

  const pct = (base) => ((currentPrice / base) - 1) * 100;
  const firstDate = valid[0].date;

  for (const [key, months] of Object.entries(RETURN_PERIODS)) {
    const cutoff = monthsBefore(today, months);
    if (firstDate > cutoff) continue; // listed after the period started
    const base = valid.find((c) => c.date >= cutoff);
    if (base) out[key] = pct(base.close);
  }
  out.all = pct(valid[0].close);
  return out;
}

module.exports = { computePriceReturns };
