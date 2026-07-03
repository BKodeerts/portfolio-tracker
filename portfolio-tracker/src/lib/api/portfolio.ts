import { apiFetch, apiGet } from './client';
import type { PortfolioResponse } from '$lib/types/portfolio';
import type { Transaction } from '$lib/types/transaction';

/**
 * Runtime sanity check for the /api/portfolio contract: verifies the
 * top-level keys and that chartData rows carry the explicit
 * { date, value, invested, positions } shape (no legacy magic keys).
 * Throws a descriptive error so a server/client contract drift fails
 * loudly instead of rendering garbage.
 */
function assertPortfolioShape(p: unknown): asserts p is PortfolioResponse {
  if (p == null || typeof p !== 'object') {
    throw new Error('/api/portfolio: response is not an object');
  }
  const obj = p as Record<string, unknown>;
  for (const key of ['chartData', 'benchmarkData', 'meta', 'currentTickers', 'positions'] as const) {
    if (!(key in obj)) throw new Error(`/api/portfolio: missing top-level key "${key}"`);
  }
  if (!Array.isArray(obj['chartData'])) throw new Error('/api/portfolio: chartData is not an array');
  const row = (obj['chartData'] as unknown[])[0] as Record<string, unknown> | undefined;
  if (row !== undefined) {
    if (typeof row['date'] !== 'string' || typeof row['value'] !== 'number' || typeof row['invested'] !== 'number') {
      throw new Error('/api/portfolio: chartData row missing date/value/invested');
    }
    if (row['positions'] == null || typeof row['positions'] !== 'object' || Array.isArray(row['positions'])) {
      throw new Error('/api/portfolio: chartData row missing "positions" object — server/client contract mismatch');
    }
  }
}

export async function fetchPortfolio(): Promise<PortfolioResponse> {
  const p = await apiGet<unknown>('/api/portfolio');
  assertPortfolioShape(p);
  return p;
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const body = await apiFetch<{ status: string; data: Transaction[] }>('/api/transactions');
  return body.data;
}

export async function saveTransactions(
  mode: 'replace' | 'merge',
  transactions: Transaction[],
): Promise<{ status: string; count: number }> {
  return apiFetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, transactions }),
  });
}
