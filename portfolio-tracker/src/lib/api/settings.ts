import { apiFetch, apiGet } from './client';
import type { Settings } from '$lib/types/settings';
import type { TickerMeta } from '$lib/types/portfolio';

export async function fetchSettings(): Promise<Settings> {
  return apiGet<Settings>('/api/settings');
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  return apiFetch<Settings>('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function fetchTickerMeta(): Promise<Record<string, TickerMeta>> {
  return apiGet<Record<string, TickerMeta>>('/api/ticker-meta');
}

export async function saveTickerMeta(meta: Record<string, TickerMeta>): Promise<void> {
  await apiFetch('/api/ticker-meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
}

export async function fetchCacheStatus(): Promise<unknown> {
  return apiFetch('/api/cache/status');
}

export async function clearCache(group?: string): Promise<{ cleared: number }> {
  const qs = group ? `?group=${encodeURIComponent(group)}` : '';
  return apiFetch(`/api/cache/clear${qs}`, { method: 'POST' });
}

export async function pushToHa(): Promise<{ ok: boolean; pushed: number }> {
  return apiFetch('/api/ha/push', { method: 'POST' });
}

export async function lookupIsin(isin: string, exchange: string): Promise<{ status: string; symbol?: string }> {
  return apiFetch(
    `/api/lookup?isin=${encodeURIComponent(isin)}&exchange=${encodeURIComponent(exchange)}`,
  );
}
