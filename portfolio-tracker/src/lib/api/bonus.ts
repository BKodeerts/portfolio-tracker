import { apiFetch } from './client';
import type { BonusItem, BonusHistoryPoint } from '$lib/types/bonus';

export async function fetchBonus(): Promise<BonusItem[]> {
  const body = await apiFetch<{ status: string; data: BonusItem[] }>('/api/bonus');
  return body.data;
}

export async function fetchBonusHistory(id: string): Promise<BonusHistoryPoint[]> {
  const body = await apiFetch<{ status: string; data: BonusHistoryPoint[] }>(
    `/api/bonus/${encodeURIComponent(id)}/history`,
  );
  return body.data;
}

export async function saveBonus(entry: Partial<BonusItem>): Promise<BonusItem> {
  const body = await apiFetch<{ status: string; data: BonusItem }>('/api/bonus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return body.data;
}

export async function deleteBonus(id: string): Promise<void> {
  await apiFetch(`/api/bonus/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
