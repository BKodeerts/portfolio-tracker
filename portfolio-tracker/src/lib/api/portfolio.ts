import { apiFetch } from './client';
import type { PortfolioResponse } from '$lib/types/portfolio';
import type { Transaction } from '$lib/types/transaction';

export async function fetchPortfolio(): Promise<PortfolioResponse> {
  return apiFetch<PortfolioResponse>('/api/portfolio');
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
