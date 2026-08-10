import { describe, it, expect } from 'vitest';
import {
  relLabel, monoDate, dayMonth, rangeLabel, sentenceDate,
  earningsBadge, buildEarningsList, earningsBanner,
  type EarningsEntry,
} from '../../src/lib/derived/earnings';
import type { EarningsInfo } from '../../src/lib/types/stats';

// The service hands the UI one date per ticker — the next report *or* the most
// recent one — with an optional multi-day window when it isn't confirmed. These
// tests pin the three things that follow from that: a past date is never shown
// as upcoming, an estimate is never shown as a hard date, and a missing date
// reads the same whether the listing has no earnings or the fetch failed.

const TODAY = '2026-08-10';

const info = (over: Partial<EarningsInfo> = {}): EarningsInfo => ({
  date: null, endDate: null, estimated: false, upcoming: false, timestamp: null, ...over,
});
const confirmed = (date: string) => info({ date, upcoming: true });
const window_ = (date: string, endDate: string) =>
  info({ date, endDate, estimated: true, upcoming: true });
const reported = (date: string) => info({ date });

const entry = (ticker: string, e: EarningsInfo | null, held = true): EarningsEntry => ({
  ticker, color: '#6366f1', held, href: `/stock/${ticker}`, info: e,
});

describe('date labels', () => {
  it('renders the row/banner formats the design asks for', () => {
    expect(monoDate('2026-08-11')).toBe('TUE 11 AUG');
    expect(dayMonth('2026-08-11')).toBe('11 Aug');
    expect(rangeLabel('2026-08-14', '2026-08-18')).toBe('14–18 Aug');
    expect(sentenceDate('2026-08-11')).toBe('Tue 11 aug');
  });

  it('counts days in both directions', () => {
    expect(relLabel(TODAY, '2026-08-10')).toBe('today');
    expect(relLabel(TODAY, '2026-08-11')).toBe('tomorrow');
    expect(relLabel(TODAY, '2026-08-14')).toBe('in 4d');
    expect(relLabel(TODAY, '2026-08-09')).toBe('yesterday');
    expect(relLabel(TODAY, '2026-08-07')).toBe('3d ago');
  });
});

describe('earningsBadge', () => {
  it('degrades to an em dash without a date', () => {
    expect(earningsBadge(info(), TODAY)).toMatchObject({ text: '—', tone: 'faint', dashed: false });
    // A failed fetch arrives as the same empty block — same rendering.
    expect(earningsBadge(null, TODAY)).toMatchObject({ text: '—', tone: 'faint' });
  });

  it('inks a date within the week and mutes one further out', () => {
    expect(earningsBadge(confirmed('2026-08-11'), TODAY)).toMatchObject({ text: '11 Aug', tone: 'ink' });
    expect(earningsBadge(confirmed('2026-08-25'), TODAY)).toMatchObject({ text: '25 Aug', tone: 'muted' });
  });

  it('shows an unconfirmed window as a dashed range, never a single day', () => {
    const badge = earningsBadge(window_('2026-08-14', '2026-08-18'), TODAY);
    expect(badge.text).toBe('14–18 Aug');
    expect(badge.dashed).toBe(true);
  });

  it('marks an already-reported date as past', () => {
    expect(earningsBadge(reported('2026-08-06'), TODAY)).toMatchObject({
      text: 'reported 6 Aug', tone: 'faint', dashed: false,
    });
  });
});

describe('buildEarningsList', () => {
  const entries = [
    entry('ASTS', confirmed('2026-08-11')),
    entry('RKLB', confirmed('2026-08-13')),
    entry('LUNR', window_('2026-08-14', '2026-08-18')),
    entry('SMR', confirmed('2026-08-25')),
    entry('OKLO', confirmed('2026-09-30')),          // beyond the 4-week horizon
    entry('SXRT', info()),                            // ETF: no date at all
    entry('RDW', confirmed('2026-08-12'), false),     // watchlist
    entry('RHM', reported('2026-08-06')),
  ];

  it('lists upcoming reports soonest first, inside the horizon only', () => {
    const { upcoming } = buildEarningsList(entries, TODAY);
    expect(upcoming.map((r) => r.ticker)).toEqual(['ASTS', 'RDW', 'RKLB', 'LUNR', 'SMR']);
  });

  it('caps the upcoming rows and keeps exactly one reported row', () => {
    const { upcoming, reported: past } = buildEarningsList(entries, TODAY, { maxUpcoming: 2 });
    expect(upcoming).toHaveLength(2);
    expect(past?.ticker).toBe('RHM');
    expect(past?.upcoming).toBe(false);
  });

  it('keeps the most recent report, not the oldest one still in window', () => {
    const two = [entry('AAA', reported('2026-08-04')), entry('BBB', reported('2026-08-08'))];
    expect(buildEarningsList(two, TODAY).reported?.ticker).toBe('BBB');
  });

  it('drops a report old enough that Yahoo has likely rolled over', () => {
    const stale = [entry('AAA', reported('2026-06-01'))];
    expect(buildEarningsList(stale, TODAY).reported).toBeNull();
  });

  it('labels watchlist rows and can exclude them entirely', () => {
    const withWatch = buildEarningsList(entries, TODAY).upcoming.find((r) => r.ticker === 'RDW');
    expect(withWatch?.statusStr).toBe('Confirmed date · watchlist');
    expect(withWatch?.held).toBe(false);

    const holdingsOnly = buildEarningsList(entries, TODAY, { showWatchlist: false });
    expect(holdingsOnly.upcoming.some((r) => r.ticker === 'RDW')).toBe(false);
  });

  it('renders an estimated row as a range and says so', () => {
    const row = buildEarningsList(entries, TODAY).upcoming.find((r) => r.ticker === 'LUNR');
    expect(row?.dateStr).toBe('14–18 AUG');
    expect(row?.statusStr).toBe('Estimated window');
  });

  it('marks only the next few days as urgent', () => {
    const rows = buildEarningsList(entries, TODAY).upcoming;
    expect(rows.find((r) => r.ticker === 'ASTS')?.soon).toBe(true);
    expect(rows.find((r) => r.ticker === 'SMR')?.soon).toBe(false);
  });
});

describe('earningsBanner', () => {
  it('is absent when there is nothing timely to say', () => {
    expect(earningsBanner(info(), TODAY)).toBeNull();                       // no date
    expect(earningsBanner(null, TODAY)).toBeNull();                         // failed fetch
    expect(earningsBanner(confirmed('2026-10-01'), TODAY)).toBeNull();      // past the horizon
    expect(earningsBanner(reported('2026-05-06'), TODAY)).toBeNull();       // long since reported
  });

  it('counts down to a confirmed date and admits it has no clock time', () => {
    const b = earningsBanner(confirmed('2026-08-14'), TODAY)!;
    expect(b.title).toBe('Reports in 4 days');
    expect(b.sub).toBe('Fri 14 aug · no time of day published');
    expect(b.dateStr).toBe('FRI 14 AUG');
    expect(b.flag).toBe('confirmed');
    expect(b.estimated).toBe(false);
  });

  it('says tomorrow and today rather than counting one day', () => {
    expect(earningsBanner(confirmed('2026-08-11'), TODAY)!.title).toBe('Reports tomorrow');
    expect(earningsBanner(confirmed('2026-08-10'), TODAY)!.title).toBe('Reports today');
  });

  it('counts an estimated window from its start and flags it unconfirmed', () => {
    const b = earningsBanner(window_('2026-08-14', '2026-08-18'), TODAY)!;
    expect(b.title).toBe('Reports in 4 days');
    expect(b.sub).toBe('Estimated window · 14 Aug – 18 Aug · not confirmed by the company');
    expect(b.dateStr).toBe('14–18 AUG');
    expect(b.flag).toBe('estimated');
    expect(b.estimated).toBe(true);
  });

  it('reports a past date as past, without promising a next one', () => {
    const b = earningsBanner(reported('2026-08-06'), TODAY)!;
    expect(b.title).toBe('Last reported 4d ago');
    expect(b.sub).toBe('Thu 06 aug · next date not published yet');
    expect(b.dateStr).toBe('THU 06 AUG');
    expect(b.upcoming).toBe(false);
  });
});
