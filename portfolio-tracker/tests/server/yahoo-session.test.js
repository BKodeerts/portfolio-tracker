import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deriveSession } from '../../server/yahoo.js';

// Weekend regression: with no candles from "today", deriveSession must still
// return the last completed session's points regardless of whether Yahoo's
// currentTradingPeriod points at that finished session (Friday) or at the
// next one (Monday). A bug here empties every sparkline and flattens the 1D
// chart onto its baseline all weekend.

const dayStart = (dateStr) => Date.parse(dateStr + 'T00:00:00Z') / 1000;

/**
 * 5-min regular-session candles (13:30–20:00 UTC, US-style) rising from `base`.
 * The ramp keeps every open, close and day distinct, so a test asserting "the
 * baseline is Thursday's close" can't pass by coincidence.
 */
function sessionDay(dateStr, base) {
  const pts = [];
  const s = dayStart(dateStr) + 13.5 * 3600;
  const e = dayStart(dateStr) + 20 * 3600;
  for (let ts = s, i = 0; ts < e; ts += 300, i++) pts.push({ ts, close: base + i * 0.1 });
  return pts;
}

/**
 * 5-min post-market candles (20:00–24:00 UTC) at a deliberately distinct price.
 * These are what a naive "last tick before today's pre-market start" scan lands
 * on — they are NOT a close, and no baseline may ever come from them.
 */
function postDay(dateStr, price) {
  const pts = [];
  const s = dayStart(dateStr) + 20 * 3600;
  const e = dayStart(dateStr) + 24 * 3600;
  for (let ts = s; ts < e; ts += 300) pts.push({ ts, close: price });
  return pts;
}

function periodsFor(dateStr) {
  const d = dayStart(dateStr);
  return {
    pre:     { start: d + 8 * 3600,    end: d + 13.5 * 3600 },
    regular: { start: d + 13.5 * 3600, end: d + 20 * 3600 },
    post:    { start: d + 20 * 3600,   end: d + 24 * 3600 },
  };
}

// Saturday 2026-07-11 14:00 UTC; last sessions were Fri 07-10 and Thu 07-09.
const SATURDAY = new Date('2026-07-11T14:00:00Z');
const thu = sessionDay('2026-07-09', 210);
const fri = sessionDay('2026-07-10', 212);
const points = [...thu, ...fri];
const lastDate = '2026-07-10';
const meta = { regularMarketPreviousClose: 999 };

describe('deriveSession on a weekend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SATURDAY);
  });
  afterEach(() => vi.useRealTimers());

  it("keeps Friday's session when currentTradingPeriod still describes Friday", () => {
    const { sessionPoints, previousClose, sessionPreviousClose } = deriveSession(points, periodsFor('2026-07-10'), lastDate, meta);
    expect(sessionPoints).toEqual(fri);
    // Baseline anchored to Thursday's close, not Friday's own close (% would read 0).
    expect(previousClose).toBe(thu[thu.length - 1].close);
    expect(sessionPreviousClose).toBe(thu[thu.length - 1].close);
  });

  it("keeps Friday's session when currentTradingPeriod points at Monday", () => {
    const { sessionPoints, previousClose, sessionPreviousClose } = deriveSession(points, periodsFor('2026-07-13'), lastDate, meta);
    expect(sessionPoints).toEqual(fri);
    expect(previousClose).toBe(thu[thu.length - 1].close);
    expect(sessionPreviousClose).toBe(thu[thu.length - 1].close);
  });

  it('excludes pre/post-market candles from the fallback session', () => {
    const friPre = [{ ts: dayStart('2026-07-10') + 9 * 3600, close: 205 }];
    const withPre = [...thu, ...friPre, ...fri];
    const { sessionPoints } = deriveSession(withPre, periodsFor('2026-07-10'), lastDate, meta);
    expect(sessionPoints).toEqual(fri);
  });
});

describe('deriveSession during pre-market', () => {
  // Monday 2026-07-13 08:30 UTC (10:30 Brussels): EU markets are open, the US
  // session isn't — but US pre-market candles have started arriving, so the
  // last raw candle date is *today*. The fallback must still return Friday's
  // regular session, not come back empty (which blanks every US sparkline
  // between US pre-market open and the regular open).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T08:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const monPre = [
    { ts: dayStart('2026-07-13') + 8 * 3600, close: 214 },
    { ts: dayStart('2026-07-13') + 8.25 * 3600, close: 215 },
  ];

  it("keeps Friday's session once today's pre-market candles exist", () => {
    const withMonPre = [...thu, ...fri, ...monPre];
    const { sessionPoints, previousClose, sessionPreviousClose } = deriveSession(
      withMonPre, periodsFor('2026-07-13'), '2026-07-13', meta,
    );
    expect(sessionPoints).toEqual(fri);
    expect(previousClose).toBe(fri[fri.length - 1].close);
    // The drawn session is Friday's, so charts must measure it against
    // Thursday's close — measuring against previousClose (Friday's own close)
    // pins the drawn line's end onto the baseline and flips how the day reads.
    expect(sessionPreviousClose).toBe(thu[thu.length - 1].close);
  });

  it('ignores extended-hours ticks when picking either baseline', () => {
    // Both prior days carry post-market runs at prices far from their closes.
    // A backwards scan without a regular-hours filter lands on those instead of
    // the actual closes — the bug that made the baseline track after-hours drift.
    const withPost = [
      ...thu, ...postDay('2026-07-09', 500),
      ...fri, ...postDay('2026-07-10', 600),
      ...monPre,
    ];
    const { previousClose, sessionPreviousClose } = deriveSession(
      withPost, periodsFor('2026-07-13'), '2026-07-13', meta,
    );
    expect(previousClose).toBe(fri[fri.length - 1].close);
    expect(sessionPreviousClose).toBe(thu[thu.length - 1].close);
    for (const v of [previousClose, sessionPreviousClose]) {
      expect(v).not.toBe(500);
      expect(v).not.toBe(600);
    }
  });

  it("falls back to the drawn session's open when the prior close isn't in range", () => {
    // A short payload (what range=2d returned) holds only [Friday, Monday-pre],
    // so there is no Thursday close to anchor to. The baseline must NOT collapse
    // onto Friday's own close (which would read 0% / flip the sign) — it degrades
    // to Friday's open so the drawn session still shows its real move.
    const { sessionPreviousClose } = deriveSession(
      [...fri, ...monPre], periodsFor('2026-07-13'), '2026-07-13', meta,
    );
    expect(sessionPreviousClose).toBe(fri[0].close);
    expect(sessionPreviousClose).not.toBe(fri[fri.length - 1].close);
    expect(sessionPreviousClose).not.toBe(meta.regularMarketPreviousClose);
  });
});

describe('deriveSession on a trading day', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Friday during the session, 15:00 UTC.
    vi.setSystemTime(new Date('2026-07-10T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it("uses today's regular-session candles with the standard previousClose", () => {
    const { sessionPoints, previousClose, sessionPreviousClose } = deriveSession(points, periodsFor('2026-07-10'), lastDate, meta);
    expect(sessionPoints).toEqual(fri);
    expect(previousClose).toBe(thu[thu.length - 1].close);
    expect(sessionPreviousClose).toBe(thu[thu.length - 1].close);
  });

  it("measures today's session against yesterday's close, not its post-market", () => {
    // Live-session regression: previousClose feeds the day-change % shown all
    // day. Thursday's post-market run must not become the baseline.
    const withPost = [...thu, ...postDay('2026-07-09', 500), ...fri];
    const { sessionPoints, previousClose, sessionPreviousClose } = deriveSession(
      withPost, periodsFor('2026-07-10'), lastDate, meta,
    );
    expect(sessionPoints).toEqual(fri);
    expect(previousClose).toBe(thu[thu.length - 1].close);
    expect(sessionPreviousClose).toBe(thu[thu.length - 1].close);
    expect(previousClose).not.toBe(500);
  });

  it("still rejects a stale currentTradingPeriod pointing at yesterday when today's candles exist", () => {
    // Period says Thursday (stale), but Friday (= today) candles are in the data:
    // the date-based heuristic must pick today's, not Thursday's.
    const { sessionPoints } = deriveSession(points, periodsFor('2026-07-09'), lastDate, meta);
    expect(sessionPoints).toEqual(fri);
  });
});
