import type { IntradayData } from '$lib/types/candle';
import { fetchIntraday } from '$lib/api/candles';
import { portfolioStore } from './portfolio.svelte';

function createIntradayStore() {
  let data       = $state<Record<string, IntradayData | null>>({});
  let loaded     = $state(false);
  let loadError  = $state(false);
  let lastLoaded = $state<number | null>(null);
  let liveEurUsd = $state<number | null>(null);
  let _timer: ReturnType<typeof setInterval> | null = null;

  async function load(force = false) {
    const tickers = portfolioStore.currentTickers;
    if (tickers.length === 0) return;

    // Collect all yahoo symbols from portfolio + watchlist
    const yahooSymbols = tickers
      .map((t) => portfolioStore.tickerMeta[t]?.['yahoo'] as string | undefined ?? t)
      .filter(Boolean);

    const watchlistSymbols = portfolioStore.watchlistData.map((w) => w.yahoo).filter(Boolean);

    // Add FX symbol for live EUR/USD
    const symbols = [...new Set([...yahooSymbols, ...watchlistSymbols, 'EURUSD=X'])];

    try {
      const result = await fetchIntraday(symbols, force);
      data = { ...data, ...result };

      // Extract live EUR/USD rate from intraday
      const fxData = result['EURUSD=X'];
      if (fxData?.points?.length) {
        const last = fxData.points.at(-1);
        if (last) liveEurUsd = last.close;
      }

      loaded     = true;
      loadError  = false;
      lastLoaded = Date.now();

      // If the server returned data from a previous trading day (Yahoo CDN lag at
      // session open, or cached stale data), schedule one immediate force-refresh
      // so the UI updates as soon as fresh candles are available.
      if (!force) {
        const today = new Date().toISOString().slice(0, 10);
        const hasStaleDate = Object.values(result).some((d) => d?.date && d.date < today);
        if (hasStaleDate) {
          setTimeout(() => load(true), 15_000);
        }
      }
    } catch (e) {
      console.error('[intraday] load failed:', e);
      loadError = true;
    }
  }

  function startAutoRefresh(intervalMs = 5 * 60 * 1000) {
    if (_timer) return;
    _timer = setInterval(() => {
      // Only refresh if any held exchange is open (checked in component layer)
      load(true);
    }, intervalMs);
  }

  function stopAutoRefresh() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  return {
    get data()        { return data; },
    get loaded()      { return loaded; },
    get loadError()   { return loadError; },
    get lastLoaded()  { return lastLoaded; },
    get liveEurUsd()  { return liveEurUsd; },
    load,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

export const intradayStore = createIntradayStore();
