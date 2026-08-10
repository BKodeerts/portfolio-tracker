import { apiGet } from './client';
import type { EarningsInfo } from '$lib/types/stats';

/**
 * Next earnings date per Yahoo symbol. Symbols Yahoo has no date for come back
 * as an empty `EarningsInfo` rather than being omitted, so a missing key means
 * "not requested", never "no date".
 */
export async function fetchEarnings(symbols: string[]): Promise<Record<string, EarningsInfo>> {
  if (symbols.length === 0) return {};
  return apiGet<Record<string, EarningsInfo>>(`/api/earnings?symbols=${encodeURIComponent(symbols.join(','))}`);
}
