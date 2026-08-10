import type { EarningsInfo } from '$lib/types/stats';
import { fetchEarnings } from '$lib/api/earnings';

/**
 * Earnings dates for the dashboard, keyed by Yahoo symbol. State + fetch only.
 *
 * The server caches quotes for 15 minutes and the dates themselves move at
 * most once a quarter, so this loads once per ticker set and never polls. A
 * failed load leaves the map empty, which every consumer renders as "no date".
 */
function createEarningsStore() {
  let data = $state<Record<string, EarningsInfo>>({});
  let loaded = $state(false);
  let _key = '';

  async function load(symbols: string[]) {
    const unique = [...new Set(symbols.filter(Boolean))].sort();
    const key = unique.join(',');
    if (!key || key === _key) return;
    _key = key;
    try {
      data = { ...data, ...(await fetchEarnings(unique)) };
      loaded = true;
    } catch (e) {
      console.error('[earnings] load failed:', e);
      _key = ''; // let the next ticker-set change retry
    }
  }

  return {
    get data() { return data; },
    get loaded() { return loaded; },
    load,
  };
}

export const earningsStore = createEarningsStore();
