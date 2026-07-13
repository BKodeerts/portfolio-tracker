import { apiFetch } from './client';
import type { TickerStats } from '$lib/types/stats';

export async function fetchTickerStats(symbol: string): Promise<TickerStats> {
  const body = await apiFetch<{ status: string; data: TickerStats }>(
    `/api/stats/${encodeURIComponent(symbol)}`,
  );
  return body.data;
}
