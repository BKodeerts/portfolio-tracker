import { describe, it, expect } from 'vitest';
import { toEur, toEurAtRate, nonEurCurrencies, fxSymbolsFor, FX_DEFS } from '../../server/domain/fx.js';

describe('toEur', () => {
  it('returns price unchanged for EUR', () => {
    expect(toEur('EUR', 100, '2024-01-02', {})).toBe(100);
  });

  it('returns price unchanged when currency is missing', () => {
    expect(toEur(null, 100, '2024-01-02', {})).toBe(100);
  });

  it('passes through an unknown currency unconverted', () => {
    expect(toEur('XYZ', 100, '2024-01-02', {})).toBe(100);
  });

  it('converts USD using the date-keyed rate', () => {
    const fxMaps = { USD: { '2024-01-02': 1.1 } };
    expect(toEur('USD', 110, '2024-01-02', fxMaps)).toBeCloseTo(100, 10);
  });

  it('falls back to FX_DEFS fallback when the date has no rate', () => {
    expect(toEur('USD', 109, '2024-01-02', {})).toBeCloseTo(109 / FX_DEFS.USD.fallback, 10);
  });

  it('applies GBX scale of 100 (pence sterling)', () => {
    const fxMaps = { GBX: { '2024-01-02': 0.86 } };
    // 8600 pence = 86 GBP = 100 EUR at EURGBP 0.86
    expect(toEur('GBX', 8600, '2024-01-02', fxMaps)).toBeCloseTo(100, 10);
  });
});

describe('toEurAtRate', () => {
  it('returns price unchanged for EUR', () => {
    expect(toEurAtRate('EUR', 42, {})).toBe(42);
  });

  it('converts with a flat live rate', () => {
    expect(toEurAtRate('USD', 110, { USD: 1.1 })).toBeCloseTo(100, 10);
  });

  it('applies GBX scale with live rates', () => {
    expect(toEurAtRate('GBX', 8600, { GBX: 0.86 })).toBeCloseTo(100, 10);
  });

  it('passes through unknown currencies', () => {
    expect(toEurAtRate('XYZ', 55, { XYZ: 2 })).toBe(55);
  });

  it('uses the fallback rate when no live rate is given', () => {
    expect(toEurAtRate('USD', 109, {})).toBeCloseTo(109 / FX_DEFS.USD.fallback, 10);
  });
});

describe('nonEurCurrencies / fxSymbolsFor', () => {
  it('collects unique known non-EUR currencies', () => {
    const meta = {
      A: { currency: 'USD' },
      B: { currency: 'EUR' },
      C: { currency: 'USD' },
      D: { currency: 'GBX' },
      E: { currency: 'XYZ' }, // unknown → excluded
    };
    expect(nonEurCurrencies(meta).sort()).toEqual(['GBX', 'USD']);
  });

  it('dedupes FX symbols (GBP and GBX share EURGBP=X)', () => {
    expect(fxSymbolsFor(['GBP', 'GBX', 'USD']).sort()).toEqual(['EURGBP=X', 'EURUSD=X']);
  });
});
