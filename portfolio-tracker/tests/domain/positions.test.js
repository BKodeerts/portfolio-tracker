import { describe, it, expect } from 'vitest';
import {
  fifoCostBasis,
  fifoAvgCostNative,
  fifoCostNativeEur,
  computeRealizedPl,
  computeDividends,
  detectSplitFactors,
  makeAdjShares,
  computeNetShares,
  buildMeta,
  findEarliestDate,
} from '../../server/domain/positions.js';

// Identity share adjustment (no splits) for fixtures
const noAdj = (tx) => tx.shares;

describe('fifoCostBasis', () => {
  const txs = [
    { date: '2024-01-02', ticker: 'AAA', shares: 10, costEur: 100 },  // 10 @ €10
    { date: '2024-02-01', ticker: 'AAA', shares: 10, costEur: 200 },  // 10 @ €20
    { date: '2024-03-01', ticker: 'AAA', shares: -5, costEur: 150 },  // sell 5 (FIFO: from first lot)
  ];

  it('sums all lots before any sale', () => {
    expect(fifoCostBasis(txs, 'AAA', '2024-02-15', noAdj)).toBe(300);
  });

  it('removes sold shares from the earliest lot first (partial sale)', () => {
    // After selling 5: first lot has 5 @ €10 (=50) + second lot 10 @ €20 (=200)
    expect(fifoCostBasis(txs, 'AAA', '2024-03-31', noAdj)).toBe(250);
  });

  it('a sale spanning two lots leaves only the remainder of the second lot', () => {
    const spanning = [
      ...txs.slice(0, 2),
      { date: '2024-03-01', ticker: 'AAA', shares: -15, costEur: 450 },
    ];
    // Sold all 10 of lot 1 and 5 of lot 2 → 5 @ €20 remain
    expect(fifoCostBasis(spanning, 'AAA', '2024-03-31', noAdj)).toBe(100);
  });

  it('respects upToDate (ignores later transactions)', () => {
    expect(fifoCostBasis(txs, 'AAA', '2024-01-15', noAdj)).toBe(100);
  });

  it('ignores dividend rows', () => {
    const withDiv = [...txs, { date: '2024-02-10', ticker: 'AAA', shares: 0, costEur: 12, type: 'dividend' }];
    expect(fifoCostBasis(withDiv, 'AAA', '2024-03-31', noAdj)).toBe(250);
  });
});

describe('computeRealizedPl', () => {
  it('computes FIFO realized P&L for a sold-out position', () => {
    const txsByTicker = {
      BBB: [
        { date: '2024-01-02', ticker: 'BBB', shares: 10, costEur: 100 },  // buy 10 @ €10
        { date: '2024-06-01', ticker: 'BBB', shares: -10, costEur: 150 }, // sell all for €150
      ],
    };
    const { perTicker, total } = computeRealizedPl(txsByTicker, noAdj);
    expect(perTicker.BBB).toBe(50);
    expect(total).toBe(50);
  });

  it('handles partial sales across multiple lots', () => {
    const txsByTicker = {
      CCC: [
        { date: '2024-01-02', ticker: 'CCC', shares: 10, costEur: 100 }, // 10 @ €10
        { date: '2024-02-01', ticker: 'CCC', shares: 10, costEur: 200 }, // 10 @ €20
        { date: '2024-03-01', ticker: 'CCC', shares: -15, costEur: 450 }, // sell 15 @ €30
      ],
    };
    // Realized: 10*(30-10) + 5*(30-20) = 200 + 50 = 250
    const { perTicker } = computeRealizedPl(txsByTicker, noAdj);
    expect(perTicker.CCC).toBe(250);
  });

  it('reports zero for a buy-only position', () => {
    const { perTicker } = computeRealizedPl({ DDD: [{ date: '2024-01-02', ticker: 'DDD', shares: 5, costEur: 50 }] }, noAdj);
    expect(perTicker.DDD).toBe(0);
  });
});

describe('computeDividends', () => {
  it('sums dividend rows (shares === 0) per ticker and total', () => {
    const txsByTicker = {
      AAA: [
        { date: '2024-01-02', ticker: 'AAA', shares: 10, costEur: 100 },
        { date: '2024-03-01', ticker: 'AAA', shares: 0, costEur: 12.5, type: 'dividend' },
        { date: '2024-06-01', ticker: 'AAA', shares: 0, costEur: 7.5, type: 'dividend' },
      ],
      BBB: [{ date: '2024-01-02', ticker: 'BBB', shares: 5, costEur: 50 }],
    };
    const { perTicker, total } = computeDividends(txsByTicker);
    expect(perTicker.AAA).toBe(20);
    expect(perTicker.BBB).toBeUndefined();
    expect(total).toBe(20);
  });

  it('clamps accidental negative dividend entries to zero', () => {
    const { perTicker, total } = computeDividends({
      AAA: [{ date: '2024-01-02', ticker: 'AAA', shares: 0, costEur: -5, type: 'dividend' }],
    });
    expect(perTicker.AAA).toBeUndefined();
    expect(total).toBe(0);
  });
});

describe('detectSplitFactors', () => {
  it('detects an obvious 10:1 split (Yahoo price 10x transaction price)', () => {
    const meta = { SPL: { yahoo: 'SPL.DE', currency: 'EUR' } };
    const transactions = [{ date: '2024-01-02', ticker: 'SPL', shares: 10, costEur: 100 }]; // €10/share
    const priceMaps = { 'SPL.DE': { '2024-01-02': 100 } }; // Yahoo says €100 (pre-split scale)
    expect(detectSplitFactors(meta, transactions, priceMaps, {})).toEqual({ SPL: 10 });
  });

  it('returns 1 when prices agree', () => {
    const meta = { NOR: { yahoo: 'NOR.DE', currency: 'EUR' } };
    const transactions = [{ date: '2024-01-02', ticker: 'NOR', shares: 10, costEur: 100 }];
    const priceMaps = { 'NOR.DE': { '2024-01-02': 10.5 } };
    expect(detectSplitFactors(meta, transactions, priceMaps, {})).toEqual({ NOR: 1 });
  });

  it('adjusts pre-split share counts via makeAdjShares', () => {
    const meta = { SPL: { yahoo: 'SPL.DE', currency: 'EUR' } };
    const transactions = [{ date: '2024-01-02', ticker: 'SPL', shares: 10, costEur: 100 }];
    const priceMaps = { 'SPL.DE': { '2024-01-02': 100 } };
    const factors = detectSplitFactors(meta, transactions, priceMaps, {});
    const adj = makeAdjShares(meta, priceMaps, factors, {});
    expect(adj(transactions[0], 'SPL')).toBe(1); // 10 shares / factor 10
  });
});

describe('computeNetShares / buildMeta / findEarliestDate', () => {
  const transactions = [
    { date: '2024-02-01', ticker: 'AAA', yahoo: 'AAA.DE', currency: 'EUR', shares: 10, costEur: 100 },
    { date: '2024-01-02', ticker: 'AAA', yahoo: 'AAA.DE', currency: 'EUR', shares: 5, costEur: 40 },
    { date: '2024-03-01', ticker: 'AAA', yahoo: 'AAA.DE', currency: 'EUR', shares: -3, costEur: 45 },
    { date: '2024-04-01', ticker: 'AAA', yahoo: 'AAA.DE', currency: 'EUR', shares: 0, costEur: 5, type: 'dividend' },
  ];

  it('nets buys and sells, ignoring dividend rows', () => {
    const meta = buildMeta(transactions);
    const { netShares } = computeNetShares(meta, transactions, noAdj);
    expect(netShares.AAA).toBe(12);
  });

  it('buildMeta forces EUR currency for manually-priced tickers', () => {
    const txs = [{ date: '2024-01-02', ticker: 'MAN', yahoo: 'MAN.L', currency: 'GBX', shares: 1, costEur: 10 }];
    const meta = buildMeta(txs, { MAN: { manualPriceEur: 12, manualPriceAsOf: '2024-01-02' } });
    expect(meta.MAN.currency).toBe('EUR');
    expect(meta.MAN.manualPriceEur).toBe(12);
  });

  it('findEarliestDate returns the minimum date', () => {
    expect(findEarliestDate(transactions)).toBe('2024-01-02');
  });
});

describe('fifoAvgCostNative', () => {
  it('averages FIFO EUR cost per open share for EUR positions', () => {
    const txs = [
      { date: '2024-01-02', ticker: 'AAA', shares: 10, costEur: 100 }, // €10
      { date: '2024-02-01', ticker: 'AAA', shares: 10, costEur: 200 }, // €20
      { date: '2024-03-01', ticker: 'AAA', shares: -5, costEur: 150 }, // sell 5 from lot 1
    ];
    // Open: 5 @ €10 + 10 @ €20 = €250 / 15 shares
    expect(fifoAvgCostNative(txs, 'AAA', noAdj, {}, 'EUR')).toBeCloseTo(250 / 15, 10);
  });

  it('converts to the trading currency at each buy-date FX rate (USD)', () => {
    const fxMaps = { USD: { '2024-01-02': 1.10, '2024-02-01': 1.05 } };
    const txs = [
      { date: '2024-01-02', ticker: 'USD1', shares: 10, costEur: 1000 }, // $110/share
      { date: '2024-02-01', ticker: 'USD1', shares: 10, costEur: 1000 }, // $105/share
    ];
    expect(fifoAvgCostNative(txs, 'USD1', noAdj, fxMaps, 'USD')).toBeCloseTo(107.5, 10);
  });

  it('returns GBX average in pence (scale 100)', () => {
    const fxMaps = { GBX: { '2024-01-02': 0.85 } };
    const txs = [{ date: '2024-01-02', ticker: 'GBX1', shares: 4, costEur: 400 }]; // €100/share = £85 = 8500p
    expect(fifoAvgCostNative(txs, 'GBX1', noAdj, fxMaps, 'GBX')).toBeCloseTo(8500, 8);
  });

  it('returns null when the position is fully sold', () => {
    const txs = [
      { date: '2024-01-02', ticker: 'AAA', shares: 10, costEur: 100 },
      { date: '2024-03-01', ticker: 'AAA', shares: -10, costEur: 150 },
    ];
    expect(fifoAvgCostNative(txs, 'AAA', noAdj, {}, 'EUR')).toBeNull();
    const fxMaps = { USD: { '2024-01-02': 1.1 } };
    expect(fifoAvgCostNative(txs, 'AAA', noAdj, fxMaps, 'USD')).toBeNull();
  });

  it('stays consistent with fifoCostNativeEur (same lots, no scale in EUR total)', () => {
    const fxMaps = { GBX: { '2024-01-02': 0.85, '2024-06-01': 0.90 } };
    const txs = [{ date: '2024-01-02', ticker: 'GBX1', shares: 4, costEur: 400 }];
    // Native total = 4 * £85 = £340 → at latest 0.90: €377.78
    expect(fifoCostNativeEur(txs, 'GBX1', noAdj, fxMaps, 'GBX', '2024-06-01')).toBeCloseTo(340 / 0.9, 8);
  });
});
