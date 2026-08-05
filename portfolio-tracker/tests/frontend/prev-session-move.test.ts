import { describe, it, expect } from 'vitest';
import { prevSessionMove, type TickerSpark } from '../../src/lib/derived/dashboard';

// The pre-open card's day number must be the drawn session's close measured
// against the close BEFORE that session (standard daily-change convention),
// using the same baseline IntradaySparkline draws its zero line at. Measuring
// the session's own open-to-close instead makes the card disagree with its own
// sparkline — the card reads one move while the line sits at another.

function spark(prevClose: number, closes: number[]): TickerSpark {
  return {
    phase: 'pre',
    points: closes.map((close, i) => ({ ts: 1_700_000_000 + i * 300, close })),
    prevClose,
    sessionStart: 1_700_000_000,
    sessionEnd: 1_700_020_000,
    hint: null,
  };
}

describe('prevSessionMove', () => {
  it("measures the session's close against the close before it", () => {
    // Opened at 105 (gap up from a 100 baseline), closed at 95.
    const mv = prevSessionMove(spark(100, [105, 110, 95]));
    expect(mv).not.toBeNull();
    expect(mv!.native).toBeCloseTo(-5, 10);
    expect(mv!.pct).toBeCloseTo(-5, 10);
  });

  it('does not report the open-to-close move', () => {
    // open 105 → close 95 is -9.52%; close-to-close vs 100 is -5%.
    const mv = prevSessionMove(spark(100, [105, 110, 95]));
    expect(mv!.pct).not.toBeCloseTo(((95 - 105) / 105) * 100, 6);
  });

  it('agrees with the sparkline, which plots the same baseline', () => {
    // IntradaySparkline computes each point as (close - prevClose) / prevClose.
    const s = spark(212.5, [210, 208, 202.8]);
    const mv = prevSessionMove(s)!;
    const lastPlottedPct =
      ((s.points[s.points.length - 1]!.close - s.prevClose) / s.prevClose) * 100;
    expect(mv.pct).toBeCloseTo(lastPlottedPct, 10);
  });

  it('returns null without a usable baseline', () => {
    expect(prevSessionMove(spark(0, [100, 101]))).toBeNull();
    expect(prevSessionMove(spark(100, []))).toBeNull();
  });
});
