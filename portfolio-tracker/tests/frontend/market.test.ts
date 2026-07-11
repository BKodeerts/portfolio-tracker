import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextSessionOpen, fmtOpenAt, sessionBounds } from '../../src/lib/market';

// Weekend hint captions: on a Saturday the next open is Monday's, and the
// label must carry the day ("Mon 15:30"), not read as if it opens today.

const SATURDAY = new Date('2026-07-11T14:00:00Z'); // Sat 16:00 Brussels

describe('nextSessionOpen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SATURDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('skips the weekend to Monday for a US symbol', () => {
    const open = nextSessionOpen('AAPL');
    expect(open).toBe(sessionBounds('AAPL', '2026-07-13')!.open); // Mon 09:30 ET
  });

  it('skips the weekend to Monday for an EU symbol', () => {
    const open = nextSessionOpen('ASML.AS');
    expect(open).toBe(sessionBounds('ASML.AS', '2026-07-13')!.open); // Mon 09:00 CET
  });

  it("returns today's open on a weekday morning before the bell", () => {
    vi.setSystemTime(new Date('2026-07-13T06:00:00Z')); // Mon 08:00 Brussels
    const open = nextSessionOpen('ASML.AS');
    expect(open).toBe(sessionBounds('ASML.AS', '2026-07-13')!.open);
  });

  it("returns tomorrow's open after today's close", () => {
    vi.setSystemTime(new Date('2026-07-13T20:00:00Z')); // Mon 22:00 Brussels
    const open = nextSessionOpen('ASML.AS');
    expect(open).toBe(sessionBounds('ASML.AS', '2026-07-14')!.open);
  });
});

describe('fmtOpenAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SATURDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('adds the weekday when the open is not today', () => {
    expect(fmtOpenAt(sessionBounds('AAPL', '2026-07-13')!.open)).toBe('Mon 15:30');
    expect(fmtOpenAt(sessionBounds('ASML.AS', '2026-07-13')!.open)).toBe('Mon 09:00');
  });

  it('stays time-only when the open falls today', () => {
    vi.setSystemTime(new Date('2026-07-13T06:00:00Z')); // Mon morning
    expect(fmtOpenAt(sessionBounds('AAPL', '2026-07-13')!.open)).toBe('15:30');
  });
});
