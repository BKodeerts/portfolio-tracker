import { FX_DEFS } from './constants';

/**
 * Live FX conversion helpers. `rates` maps currency code → live EUR-base rate
 * (e.g. USD → 1.09 means 1 EUR = 1.09 USD), as maintained by the intraday store.
 */

/** Live EUR-base rate for a currency: EUR → 1, unknown/missing → null. */
export function liveRateFor(currency: string | undefined, rates: Record<string, number>): number | null {
  if (!currency || currency === 'EUR') return 1;
  if (!FX_DEFS[currency]) return 1; // unknown currency: passthrough, same as server toEurAtRate
  return rates[currency] ?? null;
}

/**
 * Convert an amount in `currency` to EUR using live rates.
 * Returns null when no live rate is available (caller decides the fallback).
 */
export function toEurLive(currency: string | undefined, amount: number, rates: Record<string, number>): number | null {
  const rate = liveRateFor(currency, rates);
  if (rate == null) return null;
  const scale = (currency && FX_DEFS[currency]?.scale) || 1;
  return amount / rate / scale;
}

/**
 * Convert to EUR using live rates, falling back to the static FX_DEFS rate
 * when no live rate is available (mirrors server toEurAtRate semantics).
 */
export function toEurLiveOrFallback(currency: string | undefined, amount: number, rates: Record<string, number>): number {
  const live = toEurLive(currency, amount, rates);
  if (live != null) return live;
  const def = currency ? FX_DEFS[currency] : undefined;
  if (!def) return amount;
  return amount / def.fallback / (def.scale || 1);
}
