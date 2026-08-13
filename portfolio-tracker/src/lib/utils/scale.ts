/**
 * Y-axis floors for intraday plots.
 *
 * An intraday plot autoscales to the session's own range, which is right for a
 * normal day and wrong for a quiet one: at 09:32 a portfolio that has moved
 * 0,02% would otherwise fill the full plot height and read as a big move. The
 * floor below fixes a minimum axis span, so a move only reaches the top of the
 * plot once it is actually worth that much of the height. Anything larger than
 * the floor scales exactly as before.
 */

/** Minimum axis span for price/value plots, as a fraction of the prev close. */
export const MIN_SPAN_FRAC = 0.005;

/** Minimum axis span for plots whose y-unit is already % vs prev close. */
export const MIN_SPAN_PCT = 0.5;

/** Headroom above/below the session range, as a fraction of that range. */
export const PAD_FRAC = 0.15;

/** The value-unit floor for a plot measured against `prevClose`. */
export function minIntradaySpan(prevClose: number | null | undefined): number {
  if (prevClose == null || !Number.isFinite(prevClose)) return 0;
  return Math.abs(prevClose) * MIN_SPAN_FRAC;
}

/**
 * Widen [lo, hi] around its midpoint until it spans at least `minSpan`.
 * Ranges already wider than the floor are returned untouched, so this only
 * ever affects near-flat sessions.
 */
export function withMinSpan(lo: number, hi: number, minSpan: number): { lo: number; hi: number } {
  if (!(minSpan > 0) || hi - lo >= minSpan) return { lo, hi };
  const mid = (lo + hi) / 2;
  return { lo: mid - minSpan / 2, hi: mid + minSpan / 2 };
}

/**
 * Y bounds for an intraday plot: the session range plus headroom, never
 * narrower than the floor. `minSpan` overrides the prev-close-derived floor
 * for plots whose y-unit is % (there `prevClose` is 0 and carries no scale).
 */
export function intradayBounds(
  values: number[],
  prevClose: number,
  minSpan: number | null = null,
): { lo: number; hi: number } {
  const rawLo = Math.min(prevClose, ...values);
  const rawHi = Math.max(prevClose, ...values);
  const pad = (rawHi - rawLo) * PAD_FRAC;
  const { lo, hi } = withMinSpan(rawLo - pad, rawHi + pad, minSpan ?? minIntradaySpan(prevClose));
  return hi > lo ? { lo, hi } : { lo: lo - 1, hi: hi + 1 };
}
