import { describe, it, expect } from 'vitest';
import { applyOfficialCloses } from '../../server/yahoo.js';

// Real ASTS data, 2026-08-03 pre-market. Yahoo Finance and NASDAQ both report
// Friday 07-31 closing at 58.98, +0.54 (+0.92%) against Thursday's 58.44.
//
// The 5-minute bars disagree: the last regular bar spans 15:55–16:00 ET and so
// excludes the 16:00:01 closing cross, giving 58.93 for Friday and 58.455 for
// Thursday. Those errors compound — 58.93 vs 58.455 is +0.81%, not +0.92%.

const FRI = '2026-07-31';
const FRI_BAR_CLOSE = 58.93000030517578;   // last 5-min bar, 19:55 UTC
const FRI_OFFICIAL   = 58.98;              // meta.regularMarketPrice
const THU_BAR_CLOSE = 58.45500183105469;   // last 5-min bar, 19:55 UTC
const THU_OFFICIAL   = 58.44;              // meta.previousClose
const FRI_CLOSE_TS   = 1785528001;         // 2026-07-31T20:00:01Z = 16:00:01 EDT

/** Friday's regular session, ending on the 19:55 UTC bar. */
function friSession() {
  const base = Date.parse(FRI + 'T13:30:00Z') / 1000;
  const pts = [];
  for (let i = 0; i < 78; i++) pts.push({ ts: base + i * 300, close: 57 + i * 0.02 });
  pts[pts.length - 1] = { ts: base + 77 * 300, close: FRI_BAR_CLOSE };
  return pts;
}

const META = {
  regularMarketPrice: FRI_OFFICIAL,
  previousClose: THU_OFFICIAL,
  regularMarketTime: FRI_CLOSE_TS,
  chartPreviousClose: 58.29,
  // Note: regularMarketPreviousClose is absent from chart meta — it is a
  // quote-endpoint field. Code must not depend on it.
};

const derived = () => ({
  sessionPoints: friSession(),
  previousClose: FRI_BAR_CLOSE,
  sessionPreviousClose: THU_BAR_CLOSE,
});

describe('applyOfficialCloses — pre-market, drawn session is last Friday', () => {
  const out = () => applyOfficialCloses(derived(), META, FRI, '2026-08-03');

  it("uses the session's official close as its price, not the last bar", () => {
    expect(out().previousClose).toBe(FRI_OFFICIAL);
    expect(out().previousClose).not.toBe(FRI_BAR_CLOSE);
  });

  it('uses the official previous close as the baseline', () => {
    expect(out().sessionPreviousClose).toBe(THU_OFFICIAL);
    expect(out().sessionPreviousClose).not.toBe(THU_BAR_CLOSE);
  });

  it('reproduces the +0.92% that Yahoo and NASDAQ report', () => {
    const { previousClose, sessionPreviousClose } = out();
    const pct = ((previousClose - sessionPreviousClose) / sessionPreviousClose) * 100;
    expect(pct).toBeCloseTo(0.92, 2);
    // The bar-derived pair gives the wrong answer the app was showing.
    const barPct = ((FRI_BAR_CLOSE - THU_BAR_CLOSE) / THU_BAR_CLOSE) * 100;
    expect(barPct).toBeCloseTo(0.81, 2);
  });

  it("pins the drawn session's last point so the line matches the number", () => {
    const pts = out().sessionPoints;
    expect(pts[pts.length - 1].close).toBe(FRI_OFFICIAL);
    // Only the final point moves; the rest of the shape is untouched.
    expect(pts.length).toBe(78);
    expect(pts.slice(0, -1)).toEqual(friSession().slice(0, -1));
    // Timestamp preserved — pinning changes the price, not the x-axis.
    expect(pts[pts.length - 1].ts).toBe(friSession()[77].ts);
  });
});

describe('applyOfficialCloses — guards', () => {
  it('ignores meta describing a different session than the one drawn', () => {
    // Meta has rolled over to Monday while the drawn session is still Friday:
    // its prices belong to another day and must not be substituted in.
    const rolled = { ...META, regularMarketTime: Date.parse('2026-08-03T20:00:01Z') / 1000 };
    expect(applyOfficialCloses(derived(), rolled, FRI, '2026-08-03')).toEqual(derived());
  });

  it('ignores meta with no regularMarketTime to date it', () => {
    const undated = { ...META, regularMarketTime: undefined };
    expect(applyOfficialCloses(derived(), undated, FRI, '2026-08-03')).toEqual(derived());
  });

  it('falls back to regularMarketPreviousClose when previousClose is absent', () => {
    const quoteShaped = { ...META, previousClose: undefined, regularMarketPreviousClose: THU_OFFICIAL };
    expect(applyOfficialCloses(derived(), quoteShaped, FRI, '2026-08-03').sessionPreviousClose)
      .toBe(THU_OFFICIAL);
  });

  it('keeps derived values when meta carries no prices at all', () => {
    const bare = { regularMarketTime: FRI_CLOSE_TS };
    const out = applyOfficialCloses(derived(), bare, FRI, '2026-08-03');
    expect(out.previousClose).toBe(FRI_BAR_CLOSE);
    expect(out.sessionPreviousClose).toBe(THU_BAR_CLOSE);
  });
});

describe('applyOfficialCloses — drawn session is today', () => {
  it('takes the preceding official close as the day-change baseline', () => {
    // Live/post on Friday: previousClose is the baseline, not a price to show.
    const out = applyOfficialCloses(derived(), META, FRI, FRI);
    expect(out.previousClose).toBe(THU_OFFICIAL);
    expect(out.sessionPreviousClose).toBe(THU_OFFICIAL);
  });
});
