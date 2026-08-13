import { describe, it, expect } from 'vitest';
import {
  MIN_SPAN_FRAC,
  MIN_SPAN_PCT,
  intradayBounds,
  minIntradaySpan,
  withMinSpan,
} from '../../src/lib/utils/scale';

// Intraday plots autoscale to the session's own range. Early in the session
// that range is tiny — a portfolio up 0,02% would fill the full plot height and
// read as a big move. The axis floor is what keeps a flat session looking flat;
// sessions wider than the floor must still scale exactly as they did before.

/** Fraction of the plot height the move occupies, 0..1. */
function fill(values: number[], prevClose: number, minSpan: number | null = null): number {
  const { lo, hi } = intradayBounds(values, prevClose, minSpan);
  return (Math.max(...values) - Math.min(prevClose, ...values)) / (hi - lo);
}

describe('withMinSpan', () => {
  it('widens a narrow range around its midpoint', () => {
    const { lo, hi } = withMinSpan(99.98, 100.02, 1);
    expect(hi - lo).toBeCloseTo(1, 10);
    expect((lo + hi) / 2).toBeCloseTo(100, 10);
  });

  it('leaves a range wider than the floor untouched', () => {
    expect(withMinSpan(90, 110, 1)).toEqual({ lo: 90, hi: 110 });
  });

  it('leaves a range exactly at the floor untouched', () => {
    expect(withMinSpan(99.5, 100.5, 1)).toEqual({ lo: 99.5, hi: 100.5 });
  });

  it('is a no-op without a usable floor', () => {
    expect(withMinSpan(99.98, 100.02, 0)).toEqual({ lo: 99.98, hi: 100.02 });
    expect(withMinSpan(99.98, 100.02, -1)).toEqual({ lo: 99.98, hi: 100.02 });
  });
});

describe('minIntradaySpan', () => {
  it('scales with the prev close', () => {
    expect(minIntradaySpan(200)).toBeCloseTo(200 * MIN_SPAN_FRAC, 10);
    expect(minIntradaySpan(-200)).toBeCloseTo(200 * MIN_SPAN_FRAC, 10);
  });

  it('has no floor to offer without a prev close', () => {
    expect(minIntradaySpan(null)).toBe(0);
    expect(minIntradaySpan(undefined)).toBe(0);
    expect(minIntradaySpan(NaN)).toBe(0);
    expect(minIntradaySpan(0)).toBe(0);
  });
});

describe('intradayBounds', () => {
  it('draws a 0,02% move as near-flat', () => {
    // Pre-floor this filled ~87% of the plot (range + 15% headroom either side).
    expect(fill([100.01, 100.02], 100)).toBeLessThan(0.1);
  });

  it('keeps a real move filling the plot', () => {
    // 1,5% is well past the floor: range + 2×15% headroom ≈ 77% of the height.
    expect(fill([101, 101.5], 100)).toBeCloseTo(1 / 1.3, 6);
  });

  it('scales a move proportionally to its size, up to the floor', () => {
    const tiny = fill([100.02], 100);
    const small = fill([100.1], 100);
    const big = fill([101], 100);
    expect(tiny).toBeLessThan(small);
    expect(small).toBeLessThan(big);
    expect(small / tiny).toBeCloseTo(5, 6); // still linear under the floor
  });

  it('floors % -unit plots on the given span, not on the zero prev close', () => {
    // Dashboard % mode passes prevClose 0, which carries no scale of its own.
    const { lo, hi } = intradayBounds([0.02], 0, MIN_SPAN_PCT);
    expect(hi - lo).toBeCloseTo(MIN_SPAN_PCT, 10);
    expect(fill([0.02], 0, MIN_SPAN_PCT)).toBeLessThan(0.1);
  });

  it('keeps the session and its baseline inside the bounds', () => {
    for (const vals of [[100.02], [99.98], [99.9, 100.3], [100, 100]]) {
      const { lo, hi } = intradayBounds(vals, 100);
      expect(lo).toBeLessThanOrEqual(Math.min(100, ...vals));
      expect(hi).toBeGreaterThanOrEqual(Math.max(100, ...vals));
    }
  });

  it('never returns a degenerate axis', () => {
    for (const [vals, pc] of [[[0], 0], [[100], 100], [[], 0]] as [number[], number][]) {
      const { lo, hi } = intradayBounds(vals, pc);
      expect(hi).toBeGreaterThan(lo);
    }
  });
});
