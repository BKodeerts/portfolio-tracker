import { describe, it, expect } from 'vitest';
import {
  computeXIRR,
  computeServerTWR,
  computeAnnualPl,
  computeRiskMetrics,
  computeRollingReturns,
} from '../../server/domain/performance.js';

const noAdj = (tx) => tx.shares;

/** n daily chart rows from 2024-01-01, values from valueFn(i). */
function makeChartData(n, valueFn) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
    return { date: d, value: valueFn(i) };
  });
}
const dateAt = (i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);

describe('computeXIRR', () => {
  it('recovers the rate for a hand-computable 2-cashflow case (~1 year, +10%)', () => {
    // Buy €1000 roughly one year ago, worth €1100 today
    const d = new Date(Date.now() - 365.25 * 86400000).toISOString().slice(0, 10);
    const transactions = [{ date: d, ticker: 'AAA', shares: 10, costEur: 1000 }];
    const result = computeXIRR(transactions, 1100);

    // Expected rate from the same year-fraction convention the function uses
    const years = (Date.now() - new Date(d).getTime()) / (365.25 * 86400000);
    const expected = (Math.pow(1100 / 1000, 1 / years) - 1) * 100;
    expect(result).toBeCloseTo(expected, 1);
    expect(result).toBeGreaterThan(9);
    expect(result).toBeLessThan(11);
  });

  it('returns a negative rate for a losing position', () => {
    const d = new Date(Date.now() - 365.25 * 86400000).toISOString().slice(0, 10);
    const result = computeXIRR([{ date: d, ticker: 'AAA', shares: 10, costEur: 1000 }], 900);
    expect(result).toBeLessThan(0);
    expect(result).toBeGreaterThan(-100);
  });

  it('is independent of transaction order (transactions.json is not guaranteed sorted)', () => {
    const d1 = new Date(Date.now() - 2 * 365.25 * 86400000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() - 365.25 * 86400000).toISOString().slice(0, 10);
    const sorted   = [
      { date: d1, ticker: 'AAA', shares: 10, costEur: 1000 },
      { date: d2, ticker: 'AAA', shares: 10, costEur: 1000 },
    ];
    const unsorted = [sorted[1], sorted[0]];
    expect(computeXIRR(unsorted, 2400)).toBeCloseTo(computeXIRR(sorted, 2400), 4);
  });
});

describe('computeServerTWR', () => {
  it('chains sub-period returns around a deposit', () => {
    const chartData = [
      { date: '2024-01-02', value: 1000 },
      { date: '2024-02-01', value: 2100 }, // €1000 deposited this day; grew 10% before the deposit
      { date: '2024-03-01', value: 2310 }, // +10% after the deposit
    ];
    const transactions = [
      { date: '2024-01-02', ticker: 'AAA', shares: 10, costEur: 1000 },
      { date: '2024-02-01', ticker: 'AAA', shares: 10, costEur: 1000 },
    ];
    // Note: the first transaction date equals chartData[0], so only the 2024-02-01
    // deposit splits sub-periods: (2100-1000)/1000 = 1.1, then 2310/2100 = 1.1 → 21%
    expect(computeServerTWR(chartData, transactions)).toBeCloseTo(21, 6);
  });

  it('returns null for fewer than 2 points', () => {
    expect(computeServerTWR([{ date: '2024-01-02', value: 100 }], [])).toBeNull();
  });
});

describe('computeAnnualPl', () => {
  it('groups realized P&L and dividends by calendar year', () => {
    const txsByTicker = {
      AAA: [
        { date: '2023-01-10', ticker: 'AAA', shares: 10, costEur: 100 },
        { date: '2023-06-01', ticker: 'AAA', shares: 0, costEur: 5, type: 'dividend' },
        { date: '2024-02-01', ticker: 'AAA', shares: -10, costEur: 150 },
      ],
    };
    const rows = computeAnnualPl(txsByTicker, noAdj);
    expect(rows).toEqual([
      { year: '2024', realizedPl: 50, dividends: 0, total: 50 },
      { year: '2023', realizedPl: 0, dividends: 5, total: 5 },
    ]);
  });

  it('clamps accidental negative dividend entries to zero (same as computeDividends)', () => {
    const txsByTicker = {
      AAA: [
        { date: '2023-06-01', ticker: 'AAA', shares: 0, costEur: -5, type: 'dividend' },
        { date: '2023-07-01', ticker: 'AAA', shares: 0, costEur: 8, type: 'dividend' },
      ],
    };
    expect(computeAnnualPl(txsByTicker, noAdj)).toEqual([
      { year: '2023', realizedPl: 0, dividends: 8, total: 8 },
    ]);
  });
});

describe('computeRiskMetrics', () => {
  it('does not count a deposit as a return (flat prices → zero vol/return/drawdown)', () => {
    // €1000 flat for 20 days, then a €1000 deposit doubles the value — no price moved
    const chartData = makeChartData(40, (i) => (i < 20 ? 1000 : 2000));
    const transactions = [
      { date: dateAt(0),  ticker: 'AAA', shares: 10, costEur: 1000 },
      { date: dateAt(20), ticker: 'AAA', shares: 10, costEur: 1000 },
    ];
    const rm = computeRiskMetrics(chartData, [], transactions);
    expect(rm.volatility).toBe(0);
    expect(rm.annualReturn).toBe(0);
    expect(rm.maxDrawdownPct).toBe(0);
  });

  it('does not count a withdrawal as a drawdown', () => {
    // €1000 flat, then half is sold (€500 proceeds leave the portfolio)
    const chartData = makeChartData(40, (i) => (i < 20 ? 1000 : 500));
    const transactions = [
      { date: dateAt(0),  ticker: 'AAA', shares: 10, costEur: 1000 },
      { date: dateAt(20), ticker: 'AAA', shares: -5, costEur: 500 },
    ];
    const rm = computeRiskMetrics(chartData, [], transactions);
    expect(rm.maxDrawdownPct).toBe(0);
    expect(rm.annualReturn).toBe(0);
  });

  it('still measures genuine price moves (incl. sortino and drawdown)', () => {
    // Alternating +2% / −1% days: positive drift with real downside days
    const values = [1000];
    for (let i = 1; i < 40; i++) values.push(values[i - 1] * (i % 2 ? 1.02 : 0.99));
    const chartData = makeChartData(40, (i) => values[i]);
    const rm = computeRiskMetrics(chartData, [], [{ date: dateAt(0), ticker: 'AAA', shares: 1, costEur: 1000 }]);
    expect(rm.volatility).toBeGreaterThan(0);
    expect(rm.annualReturn).toBeGreaterThan(0);
    expect(rm.sortino).not.toBeNull();
    expect(rm.maxDrawdownPct).toBeCloseTo(1, 5); // worst single −1% day
  });

  it('returns null for fewer than 30 chart points', () => {
    expect(computeRiskMetrics(makeChartData(10, () => 1000), [], [])).toBeNull();
  });
});

describe('computeRollingReturns', () => {
  it('does not count a mid-window deposit as portfolio return', () => {
    // Flat €1000, then a €1000 deposit 10 days before the end
    const chartData = makeChartData(60, (i) => (i < 50 ? 1000 : 2000));
    const transactions = [
      { date: dateAt(0),  ticker: 'AAA', shares: 10, costEur: 1000 },
      { date: dateAt(50), ticker: 'AAA', shares: 10, costEur: 1000 },
    ];
    const rr = computeRollingReturns(chartData, [], [], transactions, 0);
    expect(rr['1m'].portfolio).toBeCloseTo(0, 6);
    expect(rr['1w'].portfolio).toBeCloseTo(0, 6);
  });

  it('measures genuine growth over the window', () => {
    // +10% price move in the last 10 days, no cash flows in the window
    const chartData = makeChartData(60, (i) => (i < 50 ? 1000 : 1100));
    const transactions = [{ date: dateAt(0), ticker: 'AAA', shares: 10, costEur: 1000 }];
    const rr = computeRollingReturns(chartData, [], [], transactions, 10);
    expect(rr['1m'].portfolio).toBeCloseTo(10, 6);
    expect(rr.inception.portfolio).toBe(10); // passed-through full-history TWR
  });

  it('emits a flow-adjusted 3y window (dashboard 3Y pill)', () => {
    // 4 years flat at €1000, then a €1000 deposit late in the 3y window
    const chartData = makeChartData(1500, (i) => (i < 1400 ? 1000 : 2000));
    const transactions = [
      { date: dateAt(0),    ticker: 'AAA', shares: 10, costEur: 1000 },
      { date: dateAt(1400), ticker: 'AAA', shares: 10, costEur: 1000 },
    ];
    const rr = computeRollingReturns(chartData, [], [], transactions, 0);
    expect(rr['3y'].portfolio).toBeCloseTo(0, 6);
  });
});
