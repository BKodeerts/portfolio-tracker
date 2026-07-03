import { describe, it, expect } from 'vitest';
import { computeXIRR, computeServerTWR, computeAnnualPl } from '../../server/domain/performance.js';

const noAdj = (tx) => tx.shares;

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
});
