import { describe, it, expect } from 'vitest';
import { normalizeEarnings } from '../../server/domain/earnings.js';

const TODAY = '2026-08-10';

/** Epoch seconds from a UTC wall-clock, so each fixture reads as a real moment. */
const ts = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h, min) / 1000;

/** A confirmed single-date quote: start === end === the point timestamp. */
const confirmed = (t, extra = {}) => ({
  earningsTimestamp: t,
  earningsTimestampStart: t,
  earningsTimestampEnd: t,
  isEarningsDateEstimate: false,
  exchangeTimezoneName: 'America/New_York',
  ...extra,
});

describe('normalizeEarnings', () => {
  it('reads a confirmed date as a single upcoming day', () => {
    const e = normalizeEarnings(confirmed(ts(2026, 8, 11, 20, 30)), TODAY);
    expect(e.date).toBe('2026-08-11');
    expect(e.endDate).toBeNull();
    expect(e.estimated).toBe(false);
    expect(e.upcoming).toBe(true);
  });

  it('honours the estimate flag even on a single-day window', () => {
    const e = normalizeEarnings(
      confirmed(ts(2026, 8, 11, 20, 30), { isEarningsDateEstimate: true }),
      TODAY,
    );
    expect(e.estimated).toBe(true);
    expect(e.endDate).toBeNull();
  });

  it('treats a multi-day window as an estimate even when the flag is absent', () => {
    const e = normalizeEarnings({
      earningsTimestamp: ts(2026, 8, 11, 20, 30),
      earningsTimestampStart: ts(2026, 8, 11, 20, 30),
      earningsTimestampEnd: ts(2026, 8, 15, 20, 30),
      exchangeTimezoneName: 'America/New_York',
    }, TODAY);
    expect(e.date).toBe('2026-08-11');
    expect(e.endDate).toBe('2026-08-15');
    expect(e.estimated).toBe(true);
    expect(e.upcoming).toBe(true);
  });

  it('dates an after-hours report in the exchange timezone, not UTC', () => {
    // 01:00 UTC on the 12th is 21:00 ET on the 11th — the report is the 11th.
    const e = normalizeEarnings(confirmed(ts(2026, 8, 12, 1, 0)), TODAY);
    expect(e.date).toBe('2026-08-11');
  });

  it('falls back to UTC when the timezone name is missing', () => {
    const e = normalizeEarnings(
      confirmed(ts(2026, 8, 12, 1, 0), { exchangeTimezoneName: undefined }),
      TODAY,
    );
    expect(e.date).toBe('2026-08-12');
  });

  it('marks a past report as not upcoming but still reports its date', () => {
    const e = normalizeEarnings(confirmed(ts(2026, 5, 6, 20, 30)), TODAY);
    expect(e.date).toBe('2026-05-06');
    expect(e.upcoming).toBe(false);
  });

  it('counts a report scheduled for today as upcoming', () => {
    const e = normalizeEarnings(confirmed(ts(2026, 8, 10, 20, 30)), TODAY);
    expect(e.upcoming).toBe(true);
  });

  it('counts a window still open today as upcoming', () => {
    const e = normalizeEarnings({
      earningsTimestampStart: ts(2026, 8, 7, 12, 0),
      earningsTimestampEnd: ts(2026, 8, 13, 12, 0),
      exchangeTimezoneName: 'America/New_York',
    }, TODAY);
    expect(e.upcoming).toBe(true);
  });

  it('uses the point timestamp when only that field is present', () => {
    const e = normalizeEarnings({
      earningsTimestamp: ts(2026, 8, 11, 20, 30),
      exchangeTimezoneName: 'America/New_York',
    }, TODAY);
    expect(e.date).toBe('2026-08-11');
    expect(e.endDate).toBeNull();
    expect(e.estimated).toBe(false);
  });

  it('returns an empty block for ETFs and failed quote calls', () => {
    const empty = { date: null, endDate: null, estimated: false, upcoming: false, timestamp: null };
    expect(normalizeEarnings(null, TODAY)).toEqual(empty);
    expect(normalizeEarnings({}, TODAY)).toEqual(empty);
    expect(normalizeEarnings({ marketCap: 1e9 }, TODAY)).toEqual(empty);
    expect(normalizeEarnings({ earningsTimestamp: 0 }, TODAY)).toEqual(empty);
  });

  it('does not claim a date is upcoming without a usable today', () => {
    const e = normalizeEarnings(confirmed(ts(2026, 8, 11, 20, 30)), '');
    expect(e.date).toBe('2026-08-11');
    expect(e.upcoming).toBe(false);
  });
});
