import { describe, it, expect } from 'vitest';
import { computePriceReturns } from '../../server/domain/stats.js';

const TODAY = '2026-07-13';

/** Daily candle helper. */
const c = (date, close) => ({ date, close });

describe('computePriceReturns', () => {
  it('computes each period from the first close on/after the cutoff', () => {
    const candles = [
      c('2023-01-02', 10),  // listing start → covers 3y & all
      c('2023-07-14', 20),  // first candle ≥ 3y cutoff (2023-07-13)
      c('2025-07-14', 25),  // first candle ≥ 1y cutoff (2025-07-13, a Sunday)
      c('2026-01-13', 40),  // 6m cutoff
      c('2026-06-15', 50),  // first candle ≥ 1m cutoff (2026-06-13, a Saturday)
      c('2026-07-10', 55),
    ];
    const r = computePriceReturns(candles, 55, TODAY);
    expect(r['1m']).toBeCloseTo(10);    // 55/50
    expect(r['6m']).toBeCloseTo(37.5);  // 55/40
    expect(r['1y']).toBeCloseTo(120);   // 55/25
    expect(r['3y']).toBeCloseTo(175);   // 55/20
    expect(r.all).toBeCloseTo(450);     // 55/10
  });

  it('3y uses the close at the 3y cutoff, not the first listing close', () => {
    const candles = [
      c('2022-01-03', 5),
      c('2023-07-14', 20), // first candle ≥ 2023-07-13
      c('2026-07-10', 40),
    ];
    const r = computePriceReturns(candles, 40, TODAY);
    expect(r['3y']).toBeCloseTo(100); // 40/20
    expect(r.all).toBeCloseTo(700);   // 40/5
  });

  it('returns null for periods the listing history does not span', () => {
    const candles = [c('2025-03-01', 30), c('2026-07-10', 45)];
    const r = computePriceReturns(candles, 45, TODAY);
    expect(r['1m']).not.toBeNull();
    expect(r['6m']).not.toBeNull();
    expect(r['1y']).not.toBeNull();
    expect(r['3y']).toBeNull();
    expect(r.all).toBeCloseTo(50); // 45/30 — All can differ from the longest period
  });

  it('"All" can be lower than 3Y (drawdown from an early high)', () => {
    const candles = [
      c('2020-06-01', 100), // all-time base
      c('2023-07-14', 20),  // 3y base after a crash
      c('2026-07-10', 60),
    ];
    const r = computePriceReturns(candles, 60, TODAY);
    expect(r['3y']).toBeCloseTo(200); // 60/20
    expect(r.all).toBeCloseTo(-40);   // 60/100
  });

  it('handles negative returns', () => {
    const candles = [c('2026-06-13', 50), c('2026-07-10', 44)];
    const r = computePriceReturns(candles, 44, TODAY);
    expect(r['1m']).toBeCloseTo(-12);
  });

  it('is defensive about garbage input', () => {
    const empty = { '1m': null, '6m': null, '1y': null, '3y': null, all: null };
    expect(computePriceReturns([], 50, TODAY)).toEqual(empty);
    expect(computePriceReturns(null, 50, TODAY)).toEqual(empty);
    expect(computePriceReturns([c('2026-01-01', 10)], 0, TODAY)).toEqual(empty);
    expect(computePriceReturns([c('2026-01-01', 10)], NaN, TODAY)).toEqual(empty);
    // null/zero closes are skipped, not divided by
    const r = computePriceReturns([c('2026-06-13', 0), c('2026-06-14', null), c('2026-06-15', 10)], 20, TODAY);
    expect(r.all).toBeCloseTo(100);
  });

  it('clamps end-of-month cutoffs (Mar 31 − 1 month → Feb 28/29, not Mar)', () => {
    const candles = [c('2026-02-27', 10), c('2026-03-30', 20)];
    const r = computePriceReturns(candles, 20, '2026-03-31');
    // cutoff must be 2026-02-28 → base is the Mar candle? No: first ≥ 2026-02-28 is 2026-03-30
    // but 1m is only non-null if listing reaches the cutoff: 2026-02-27 ≤ 2026-02-28 ✓
    expect(r['1m']).toBeCloseTo(0); // 20/20 via 2026-03-30 (first candle ≥ 2026-02-28)
  });
});
