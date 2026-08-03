import { describe, it, expect } from 'vitest';
import { applyOfficialCloses, makeInRegularTod } from '../../server/yahoo.js';
import fixture from '../fixtures/yahoo/chart-meta-2026-08-03.json';

// Contract tests over REAL captured chart-meta (see the fixture's _comment for
// provenance and its limits). These pin the payload assumptions the parser
// depends on, in executable form rather than prose — every bug in the
// 0.13.4–0.13.7 chain came from an assumption about this object that was never
// checked against an actual response.

const samples = fixture.samples;
const entries = Object.entries(samples);
const dayOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

describe('chart meta contract', () => {
  it('captures every instrument type the app fetches', () => {
    // Equities, an ETF, an index and an FX pair all go through one code path.
    const types = new Set(entries.map(([, m]) => m.instrumentType).filter(Boolean));
    expect(types).toEqual(new Set(['EQUITY', 'ETF', 'INDEX', 'CURRENCY']));
  });

  it.each(entries)('%s carries previousClose, not regularMarketPreviousClose', (_sym, m) => {
    // The bug that survived three releases: regularMarketPreviousClose is a
    // quote-endpoint field. Reading it here silently yields undefined.
    expect(typeof m.previousClose).toBe('number');
    expect(m.regularMarketPreviousClose).toBeUndefined();
  });

  it.each(entries)('%s carries regularMarketPrice and a dating regularMarketTime', (_sym, m) => {
    expect(typeof m.regularMarketPrice).toBe('number');
    expect(typeof m.regularMarketTime).toBe('number');
  });

  it('never lets chartPreviousClose stand in for previousClose', () => {
    // chartPreviousClose is the close before the whole fetched range, so at
    // range=5d it is ~5 sessions stale — it is not a previous close.
    for (const [, m] of entries) expect(m.chartPreviousClose).not.toBe(m.previousClose);
  });
});

describe('the official close prints AFTER the session window ends', () => {
  // This is the premise of applyOfficialCloses: a 5-minute bar cannot contain
  // the closing auction, because the auction lands past regular.end.
  it('holds on NASDAQ (ASTS, +1s)', () => {
    const m = samples.ASTS;
    expect(m.regularMarketTime).toBeGreaterThan(m._regularEndThatDay);
    expect(m.regularMarketTime - m._regularEndThatDay).toBe(1);
  });

  it('holds on the ASX too (BHP.AX, +304s) — not a US quirk', () => {
    const m = samples['BHP.AX'];
    const end = m.currentTradingPeriod.regular.end;
    expect(m.regularMarketTime).toBeGreaterThan(end);
    expect(m.regularMarketTime - end).toBe(304);
  });

  it('is why bar closes are wrong: ASTS official vs last bar, every day', () => {
    const { _officialDailyCloses: official, _lastBarCloses: bars } = samples.ASTS;
    for (const [day, bar] of Object.entries(bars)) {
      expect(bar).not.toBe(official[day]);
    }
    // And the error compounds across a change %: 58.98/58.44 is +0.92% (as
    // Yahoo and NASDAQ both report), while the bars give +0.81%.
    const pctFrom = (a, b) => ((a - b) / b) * 100;
    expect(pctFrom(official['2026-07-31'], official['2026-07-30'])).toBeCloseTo(0.92, 2);
    expect(pctFrom(bars['2026-07-31'], bars['2026-07-30'])).toBeCloseTo(0.81, 2);
  });
});

describe('trading period shapes the parser must tolerate', () => {
  it('Euronext reports zero-length pre and post windows', () => {
    const p = samples['ASML.AS'].currentTradingPeriod;
    expect(p.pre.start).toBe(p.pre.end);
    expect(p.post.start).toBe(p.post.end);
    // derivePreviousClose falls back pre.start -> regular.start; here they are
    // equal, so the cutoff stays correct rather than collapsing to zero.
    expect(p.pre.start).toBe(p.regular.start);
  });

  it('Xetra declares pre/post windows while reporting no extended-hours data', () => {
    const m = samples['VWCE.DE'];
    expect(m.hasPrePostMarketData).toBe(false);
    expect(m.currentTradingPeriod.pre.start).toBeLessThan(m.currentTradingPeriod.regular.start);
  });

  it('only the US equity reports extended-hours data at all', () => {
    const withPrePost = entries.filter(([, m]) => m.hasPrePostMarketData).map(([s]) => s);
    expect(withPrePost).toEqual(['ASTS']);
  });

  it('FX is a ~24h window that wraps past UTC midnight', () => {
    const r = samples['EURUSD=X'].currentTradingPeriod.regular;
    expect((r.end - r.start) / 3600).toBeCloseTo(23.98, 1);
    const inRegular = makeInRegularTod(r);
    // The wrap branch must classify the whole day as regular, or FX rates —
    // which every EUR conversion depends on — would be discarded as
    // "extended hours".
    for (const hour of [0, 6, 12, 18, 22]) {
      expect(inRegular(Date.parse(`2026-08-03T${String(hour).padStart(2, '0')}:30:00Z`) / 1000)).toBe(true);
    }
  });

  it('keeps GBp exactly, the spelling the pence scaling keys on', () => {
    expect(samples['BP.L'].currency).toBe('GBp');
  });
});

describe('applyOfficialCloses across every captured instrument', () => {
  /** A one-point session dated to the day meta describes. */
  const sessionFor = (m) => {
    const ts = m.regularMarketTime - 300;
    return {
      sessionPoints: [{ ts, close: 1 }],
      previousClose: 2,
      sessionPreviousClose: 3,
    };
  };

  it.each(entries)('%s substitutes the official pair and pins the last point', (_sym, m) => {
    const sessionDate = dayOf(m.regularMarketTime);
    const out = applyOfficialCloses(sessionFor(m), m, sessionDate, sessionDate);
    // Drawn session is "today" here, so previousClose is the baseline.
    expect(out.previousClose).toBe(m.previousClose);
    expect(out.sessionPreviousClose).toBe(m.previousClose);
    expect(out.sessionPoints[out.sessionPoints.length - 1].close).toBe(m.regularMarketPrice);
  });

  it('FX substitution keeps the live rate that liveRates reads', () => {
    // liveRates takes points.at(-1).close ?? previousClose, so a wrong value
    // here would mis-convert every position in the portfolio.
    const m = samples['EURUSD=X'];
    const sessionDate = dayOf(m.regularMarketTime);
    const out = applyOfficialCloses(sessionFor(m), m, sessionDate, sessionDate);
    expect(out.sessionPoints.at(-1).close).toBe(1.1526);
    expect(out.previousClose).toBe(1.1527);
  });

  it('leaves a past drawn session showing its own official close', () => {
    // ASTS pre-market: the card renders previousClose as Friday's price.
    const m = samples.ASTS;
    const out = applyOfficialCloses(sessionFor(m), m, '2026-07-31', '2026-08-03');
    expect(out.previousClose).toBe(58.98);
    expect(out.sessionPreviousClose).toBe(58.44);
    expect(((58.98 - 58.44) / 58.44) * 100).toBeCloseTo(0.92, 2);
  });
});
