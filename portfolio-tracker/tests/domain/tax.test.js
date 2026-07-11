import { describe, it, expect } from 'vitest';
import {
  exemptionBaseFor,
  exemptionFor,
  computeTaxSales,
  applyWithholding,
  summarizeTaxYear,
  computeSimPositions,
  computeTaxReport,
} from '../../server/domain/tax.js';

// Identity share adjustment (no splits) for fixtures
const noAdj = (tx) => tx.shares;

describe('exemption', () => {
  it('uses the indexed base per year', () => {
    expect(exemptionBaseFor(2026)).toBe(10000);
    expect(exemptionBaseFor(2027)).toBe(10300);
    expect(exemptionBaseFor(2028)).toBe(10600);
  });

  it('reuses the last known indexation for later years', () => {
    expect(exemptionBaseFor(2031)).toBe(10600);
  });

  it('doubles for couples', () => {
    expect(exemptionFor(2026, 'couple')).toBe(20000);
    expect(exemptionFor(2026, 'individual')).toBe(10000);
  });
});

describe('computeTaxSales — basis rules', () => {
  it('uses the foto value for pre-2026 lots when higher than cost', () => {
    const txs = {
      AAA: [
        { date: '2024-03-01', ticker: 'AAA', shares: 10, costEur: 100 },  // 10 @ €10
        { date: '2026-02-01', ticker: 'AAA', shares: -10, costEur: 400 }, // sell all for €400
      ],
    };
    // foto €25/share > cost €10/share → basis 250, gain 150
    const sales = computeTaxSales(txs, noAdj, { AAA: 25 });
    expect(sales).toHaveLength(1);
    expect(sales[0].basis).toBe(250);
    expect(sales[0].gain).toBe(150);
    expect(sales[0].basisType).toBe('foto');
    expect(sales[0].costAboveFoto).toBe(false);
  });

  it('uses the actual purchase price when higher than the foto (until end 2030)', () => {
    const txs = {
      BBB: [
        { date: '2024-03-01', ticker: 'BBB', shares: 10, costEur: 300 },  // 10 @ €30
        { date: '2026-02-01', ticker: 'BBB', shares: -10, costEur: 250 }, // sell for €250
      ],
    };
    // foto €20 < cost €30 → basis 300, loss −50
    const sales = computeTaxSales(txs, noAdj, { BBB: 20 });
    expect(sales[0].basis).toBe(300);
    expect(sales[0].gain).toBe(-50);
    expect(sales[0].basisType).toBe('aankoop');
    expect(sales[0].costAboveFoto).toBe(true);
  });

  it('ignores the higher purchase price after 2030', () => {
    const txs = {
      CCC: [
        { date: '2024-03-01', ticker: 'CCC', shares: 10, costEur: 300 },  // 10 @ €30
        { date: '2031-02-01', ticker: 'CCC', shares: -10, costEur: 250 },
      ],
    };
    // dual-basis window closed → foto €20 applies: basis 200, gain 50
    const sales = computeTaxSales(txs, noAdj, { CCC: 20 });
    expect(sales[0].basis).toBe(200);
    expect(sales[0].gain).toBe(50);
  });

  it('uses purchase price for lots bought after the foto date', () => {
    const txs = {
      DDD: [
        { date: '2026-01-10', ticker: 'DDD', shares: 10, costEur: 200 },  // 10 @ €20
        { date: '2026-05-01', ticker: 'DDD', shares: -10, costEur: 350 },
      ],
    };
    const sales = computeTaxSales(txs, noAdj, { DDD: 99 }); // foto irrelevant
    expect(sales[0].basis).toBe(200);
    expect(sales[0].gain).toBe(150);
    expect(sales[0].basisType).toBe('aankoop');
    expect(sales[0].costAboveFoto).toBe(false);
  });

  it('falls back to cost when no foto price is known', () => {
    const txs = {
      EEE: [
        { date: '2024-01-01', ticker: 'EEE', shares: 5, costEur: 100 },
        { date: '2026-03-01', ticker: 'EEE', shares: -5, costEur: 160 },
      ],
    };
    const sales = computeTaxSales(txs, noAdj, {});
    expect(sales[0].basis).toBe(100);
    expect(sales[0].gain).toBe(60);
  });

  it('spans FIFO lots across the foto date within one sale', () => {
    const txs = {
      FFF: [
        { date: '2024-01-01', ticker: 'FFF', shares: 10, costEur: 100 },  // pre-foto, €10
        { date: '2026-01-15', ticker: 'FFF', shares: 10, costEur: 300 },  // post-foto, €30
        { date: '2026-06-15', ticker: 'FFF', shares: -15, costEur: 600 }, // sell 15 @ €40
      ],
    };
    // foto €20: first 10 shares basis 10×20=200 (foto), next 5 basis 5×30=150 (cost)
    const sales = computeTaxSales(txs, noAdj, { FFF: 20 });
    expect(sales[0].basis).toBe(350);
    expect(sales[0].gain).toBe(250);
    expect(sales[0].basisType).toBe('foto'); // 10 of 15 shares foto-based
  });

  it('excludes sales before 2026 but still consumes their lots', () => {
    const txs = {
      GGG: [
        { date: '2024-01-01', ticker: 'GGG', shares: 10, costEur: 100 },  // €10
        { date: '2025-06-01', ticker: 'GGG', shares: -5, costEur: 90 },   // pre-2026 sale
        { date: '2026-02-01', ticker: 'GGG', shares: 10, costEur: 400 },  // €40
        { date: '2026-07-01', ticker: 'GGG', shares: -10, costEur: 500 }, // sell 10 @ €50
      ],
    };
    // Remaining pre-foto lot: 5 @ €10 → foto €20 basis 100; then 5 @ €40 = 200
    const sales = computeTaxSales(txs, noAdj, { GGG: 20 });
    expect(sales).toHaveLength(1);
    expect(sales[0].basis).toBe(300);
    expect(sales[0].gain).toBe(200);
  });

  it('ignores dividend rows', () => {
    const txs = {
      HHH: [
        { date: '2026-01-05', ticker: 'HHH', shares: 10, costEur: 100 },
        { date: '2026-02-01', ticker: 'HHH', shares: 0, costEur: 12, type: 'dividend' },
        { date: '2026-03-01', ticker: 'HHH', shares: -10, costEur: 150 },
      ],
    };
    const sales = computeTaxSales(txs, noAdj, {});
    expect(sales).toHaveLength(1);
    expect(sales[0].gain).toBe(50);
  });
});

describe('applyWithholding', () => {
  const sale = (date, gain) => ({ date, year: Number(date.slice(0, 4)), ticker: 'X', shares: 1, proceeds: 0, basis: 0, basisType: 'foto', costAboveFoto: false, gain });

  it('withholds 10% of positive gains from 1 Jun 2026', () => {
    const [s] = applyWithholding([sale('2026-06-24', 1950)], true);
    expect(s.withheld).toBe(195);
  });

  it('does not withhold before 1 Jun 2026 (transition)', () => {
    const [s] = applyWithholding([sale('2026-02-11', 3120)], true);
    expect(s.withheld).toBe(0);
  });

  it('does not withhold on losses', () => {
    const [s] = applyWithholding([sale('2026-07-01', -840)], true);
    expect(s.withheld).toBe(0);
  });

  it('withholds nothing when the broker does not withhold', () => {
    const [s] = applyWithholding([sale('2026-06-24', 1950)], false);
    expect(s.withheld).toBe(0);
  });
});

describe('summarizeTaxYear', () => {
  const sales = [
    { gain: 3120, withheld: 0 },
    { gain: -840, withheld: 0 },
    { gain: 1950, withheld: 195 },
  ];

  it('offsets losses within the year and applies the exemption', () => {
    const y = summarizeTaxYear(sales, 10000);
    expect(y.gains).toBe(5070);
    expect(y.losses).toBe(-840);
    expect(y.net).toBe(4230);
    expect(y.used).toBe(4230);
    expect(y.taxable).toBe(0);
    expect(y.tax).toBe(0);
    expect(y.withheld).toBe(195);
    expect(y.balance).toBe(195); // reclaim everything withheld
    expect(y.headroom).toBe(5770);
  });

  it('taxes 10% above the exemption', () => {
    const y = summarizeTaxYear([{ gain: 14230, withheld: 0 }], 10000);
    expect(y.taxable).toBe(4230);
    expect(y.tax).toBe(423);
    expect(y.balance).toBe(-423); // still due
    expect(y.headroom).toBe(0);
  });

  it('a net loss uses no exemption and leaves full headroom', () => {
    const y = summarizeTaxYear([{ gain: -500, withheld: 0 }], 10000);
    expect(y.net).toBe(-500);
    expect(y.used).toBe(0);
    expect(y.tax).toBe(0);
    expect(y.headroom).toBe(10000);
  });
});

describe('computeSimPositions', () => {
  it('values open lots at max(foto, cost) and flags cost-above-foto', () => {
    const txs = {
      III: [{ date: '2024-01-01', ticker: 'III', shares: 10, costEur: 300 }], // €30 > foto €20
      JJJ: [{ date: '2024-01-01', ticker: 'JJJ', shares: 10, costEur: 100 }], // €10 < foto €20
    };
    const rows = computeSimPositions(
      txs, noAdj, { III: 20, JJJ: 20 }, { III: 400, JJJ: 400 }, '2026-07-01',
    );
    const iii = rows.find(r => r.ticker === 'III');
    const jjj = rows.find(r => r.ticker === 'JJJ');
    expect(iii).toMatchObject({ basis: 300, gain: 100, usesCost: true, basisType: 'aankoop' });
    expect(jjj).toMatchObject({ basis: 200, gain: 200, usesCost: false, basisType: 'foto' });
  });

  it('marks positions bought entirely after the foto date as purchase-price based', () => {
    const txs = {
      NEW: [{ date: '2026-02-01', ticker: 'NEW', shares: 10, costEur: 100 }],
    };
    const rows = computeSimPositions(txs, noAdj, { NEW: 20 }, { NEW: 150 }, '2026-07-01');
    // foto price exists but the lot post-dates it: basis = cost, not flagged as higher-than-foto
    expect(rows[0]).toMatchObject({ basis: 100, gain: 50, usesCost: false, basisType: 'aankoop' });
  });

  it('sorts by simulated gain descending and skips sold-out tickers', () => {
    const txs = {
      KKK: [{ date: '2026-01-01', ticker: 'KKK', shares: 10, costEur: 100 }],
      LLL: [{ date: '2026-01-01', ticker: 'LLL', shares: 10, costEur: 100 }],
      OUT: [
        { date: '2026-01-01', ticker: 'OUT', shares: 10, costEur: 100 },
        { date: '2026-02-01', ticker: 'OUT', shares: -10, costEur: 150 },
      ],
    };
    const rows = computeSimPositions(txs, noAdj, {}, { KKK: 150, LLL: 500 }, '2026-07-01');
    expect(rows.map(r => r.ticker)).toEqual(['LLL', 'KKK']);
  });
});

describe('computeTaxReport', () => {
  const txsByTicker = {
    MMM: [
      { date: '2024-01-01', ticker: 'MMM', shares: 20, costEur: 200 },   // €10, foto €25
      { date: '2026-06-24', ticker: 'MMM', shares: -10, costEur: 450 },  // gain 450−250=200
    ],
  };

  it('builds one summary per tax year with withholding applied', () => {
    const r = computeTaxReport({
      txsByTicker,
      adjSharesFn: noAdj,
      fotoPrices: { MMM: 25 },
      positionValues: { MMM: 500 },
      household: 'individual',
      brokerWithholds: true,
      currentYear: 2027,
    });
    expect(r.years.map(y => y.year)).toEqual([2026, 2027]);
    const y26 = r.years[0];
    expect(y26.exemption).toBe(10000);
    expect(y26.sales).toHaveLength(1);
    expect(y26.sales[0].gain).toBe(200);
    expect(y26.sales[0].withheld).toBe(20);
    expect(y26.withheld).toBe(20);
    expect(y26.balance).toBe(20);
    expect(r.years[1].exemption).toBe(10300);
    expect(r.years[1].sales).toHaveLength(0);
    // Simulator: 10 open shares, basis 10×25 (foto) = 250 → gain 250
    expect(r.simPositions).toEqual([{ ticker: 'MMM', basis: 250, gain: 250, basisType: 'foto', usesCost: false }]);
  });

  it('returns null before the first tax year', () => {
    expect(computeTaxReport({ txsByTicker, adjSharesFn: noAdj, currentYear: 2025 })).toBeNull();
  });
});
