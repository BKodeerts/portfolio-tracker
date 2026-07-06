import { describe, it, expect } from 'vitest';
import { buildChartData, buildBenchmarkData, buildSnapshotPositions } from '../../server/domain/series.js';

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

  it('produces per-ticker position slices and totals per date', () => {
    const rows = buildChartData(meta, transactions, priceMaps, fxMaps, dates, noAdj);
    expect(rows).toHaveLength(3);

    // Day 1: only AAA held (10 * €10)
    expect(rows[0].date).toBe('2024-01-02');
    expect(rows[0].positions.AAA).toEqual({ value: 100, cost: 100, shares: 10 });
    expect(rows[0].positions.BBB).toBeUndefined();
    expect(rows[0].value).toBe(100);
    expect(rows[0].invested).toBe(100);

    // Day 2: AAA 10*11=110, BBB 5*11 USD / 1.1 = €50
    expect(rows[1].positions.AAA.value).toBe(110);
    expect(rows[1].positions.BBB).toEqual({ value: 50, cost: 50, shares: 5 });
    expect(rows[1].value).toBe(160);
    expect(rows[1].invested).toBe(150);

    // Day 3: AAA 120, BBB 5*22/1.1 = €100 → total 220
    expect(rows[2].value).toBe(220);
    expect(rows[2].invested).toBe(150);
    expect(rows[2].positions.AAA.value).toBe(120);
  });

  it('rows carry exactly the explicit contract shape (no magic per-ticker keys)', () => {
    const rows = buildChartData(meta, transactions, priceMaps, fxMaps, dates, noAdj);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['date', 'invested', 'positions', 'value']);
      expect(typeof row.date).toBe('string');
      expect(typeof row.value).toBe('number');
      expect(typeof row.invested).toBe('number');
      for (const slice of Object.values(row.positions)) {
        expect(Object.keys(slice).sort()).toEqual(['cost', 'shares', 'value']);
      }
    }
  });

  it('skips dates where nothing is held', () => {
    const rows = buildChartData(meta, transactions, priceMaps, fxMaps, ['2023-12-29', ...dates], noAdj);
    expect(rows).toHaveLength(3); // pre-purchase date filtered out
  });
});

describe('buildBenchmarkData', () => {
  it('indexes the benchmark to 100 at the first chart date', () => {
    const chartData = [
      { date: '2024-01-02', value: 100 },
      { date: '2024-01-03', value: 110 },
    ];
    const priceMaps = { 'VWCE.DE': { '2024-01-02': 50, '2024-01-03': 55 } };
    const bench = buildBenchmarkData(priceMaps, chartData, 'VWCE.DE');
    expect(bench).toEqual([
      { date: '2024-01-02', value: 100 },
      { date: '2024-01-03', value: 110 },
    ]);
  });

  it('returns empty array when the symbol has no prices', () => {
    expect(buildBenchmarkData({}, [{ date: '2024-01-02', value: 1 }], 'NOPE')).toEqual([]);
  });
});

describe('buildSnapshotPositions', () => {
  it('computes unrealized P&L from the FIFO cost basis of open shares', () => {
    // Bought 10 @ €10 (€100), sold 5 → open basis is €50, not the €100 gross buys
    const meta      = { AAA: { yahoo: 'AAA.DE', currency: 'EUR', label: 'AAA' } };
    const prices    = { 'AAA.DE': 12 };
    const netShares = { AAA: 5 };
    const costBasis = { AAA: 50 };
    const { totalValue, totalCost, positions } = buildSnapshotPositions(
      ['AAA'], meta, prices, netShares, costBasis, {},
    );
    expect(totalValue).toBe(60);
    expect(totalCost).toBe(50);
    expect(positions[0].pl).toBe(10);
    expect(positions[0].plPct).toBeCloseTo(20, 10);
  });
});
