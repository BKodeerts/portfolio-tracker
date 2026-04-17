import { apiFetch } from './client';
import type { Candle, IntradayData } from '$lib/types/candle';

export async function fetchCandles(symbol: string, from: string): Promise<Candle[]> {
  const body = await apiFetch<{ status: string; data: Candle[] }>(
    `/api/candles/${encodeURIComponent(symbol)}?from=${from}`,
  );
  return body.data;
}

export async function fetchBatch(
  symbols: string[],
  froms: string[],
): Promise<Record<string, Candle[]>> {
  const body = await apiFetch<{ status: string; data: Record<string, Candle[]> }>(
    `/api/batch?symbols=${symbols.join(',')}&froms=${froms.join(',')}`,
  );
  return body.data;
}

export async function fetchQuotes(
  symbols: string[],
): Promise<Record<string, { date: string; close: number }>> {
  const body = await apiFetch<{ status: string; data: Record<string, { date: string; close: number }> }>(
    `/api/quotes?symbols=${symbols.join(',')}`,
  );
  return body.data;
}

export async function fetchIntraday(
  symbols: string[],
  force = false,
): Promise<Record<string, IntradayData | null>> {
  const qs = force ? '&force=1' : '';
  const body = await apiFetch<{ status: string; data: Record<string, IntradayData | null> }>(
    `/api/intraday?symbols=${symbols.join(',')}${qs}`,
  );
  return body.data;
}
