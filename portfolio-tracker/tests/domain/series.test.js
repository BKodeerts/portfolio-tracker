import { describe, it, expect } from 'vitest';
import { buildChartData, buildBenchmarkData } from '../../server/domain/series.js';

const noAdj = (tx) => tx.shares;

describe('buildChartData (smoke)', () => {
  const dates = ['2024-01-02', '2024-01-03', '2024-01-04'];
  const meta = {
    AAA: { yahoo: 'AAA.DE', currency: 'EUR' },
    BBB: { yahoo: 'BBB', currency: 'USD' },
  };
  const transactions = [
    { date: '2024-01-02', ticker: 'AAA', shares: 10, costEur: 100 }, // 10 @ €10
    { date: '2024-01-03', ticker: 'BBB', shares: 5, costEur: 50 },   // 5 @ €10
  ];
  const priceMaps = {
    'AAA.DE': { '2024-01-02': 10, '2024-01-03': 11, '2024-01-04': 12 },
    'BBB':    { '2024-01-02': 11, '2024-01-03': 11, '2024-01-04': 22 },
  };
  const fxMaps = { USD: { '2024-01-02': 1.1, '2024-01-03': 1.1, '2024-01-04': 1.1 } };

  it('produces per-ticker value/cost/shares keys and totals per date', () => {
    const rows = buildChartData(meta, transactions, priceMaps, fxMaps, dates, noAdj);
    expect(rows).toHaveLength(3);

    // Day 1: only AAA held (10 * €10)
    expect(rows[0].date).toBe('2024-01-02');
    expect(rows[0].AAA).toBe(100);
    expect(rows[0].AAA_cost).toBe(100);
    expect(rows[0].AAA_shares).toBe(10);
    expect(rows[0].BBB).toBeUndefined();
    expect(rows[0].total).toBe(100);
    expect(rows[0].totalCost).toBe(100);
    expect(rows[0].profit).toBe(0);

    // Day 2: AAA 10*11=110, BBB 5*11 USD / 1.1 = €50
    expect(rows[1].AAA).toBe(110);
    expect(rows[1].BBB).toBe(50);
    expect(rows[1].BBB_cost).toBe(50);
    expect(rows[1].BBB_shares).toBe(5);
    expect(rows[1].total).toBe(160);
    expect(rows[1].totalCost).toBe(150);

    // Day 3: AAA 120, BBB 5*22/1.1 = €100 → total 220, profit 70
    expect(rows[2].total).toBe(220);
    expect(rows[2].profit).toBe(70);
    expect(rows[2].pctReturn).toBe(((220 - 150) / 150 * 100).toFixed(1));
    expect(rows[2].AAA_pct).toBe('20.0');
  });

  it('skips dates where nothing is held', () => {
    const rows = buildChartData(meta, transactions, priceMaps, fxMaps, ['2023-12-29', ...dates], noAdj);
    expect(rows).toHaveLength(3); // pre-purchase date filtered out
  });
});

describe('buildBenchmarkData', () => {
  it('indexes the benchmark to 100 at the first chart date', () => {
    const chartData = [
      { date: '2024-01-02', total: 100 },
      { date: '2024-01-03', total: 110 },
    ];
    const priceMaps = { 'VWCE.DE': { '2024-01-02': 50, '2024-01-03': 55 } };
    const bench = buildBenchmarkData(priceMaps, chartData, 'VWCE.DE');
    expect(bench).toEqual([
      { date: '2024-01-02', value: 100 },
      { date: '2024-01-03', value: 110 },
    ]);
  });

  it('returns empty array when the symbol has no prices', () => {
    expect(buildBenchmarkData({}, [{ date: '2024-01-02', total: 1 }], 'NOPE')).toEqual([]);
  });
});
