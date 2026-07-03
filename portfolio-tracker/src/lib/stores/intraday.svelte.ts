import type { IntradayData } from '$lib/types/candle';
import { fetchIntraday } from '$lib/api/candles';
import { portfolioStore } from './portfolio.svelte';
import { FX_DEFS } from '$lib/constants';

function createIntradayStore() {
  let data       = $state<Record<string, IntradayData | null>>({});
  let loaded     = $state(false);
  let loadError  = $state(false);
  let lastLoaded = $state<number | null>(null);
  // currency code → live EUR-base rate (USD → 1.09 means 1 EUR = 1.09 USD)
  let liveRates  = $state<Record<string, number>>({});
  let _timer: ReturnType<typeof setInterval> | null = null;

  async function load(force = false) {
    const tickers = portfolioStore.currentTickers;
    if (tickers.length === 0) return;

    // Collect all yahoo symbols from portfolio + watchlist
    const yahooSymbols = tickers
      .map((t) => portfolioStore.tickerMeta[t]?.yahoo ?? t)
      .filter(Boolean);

    const watchlistSymbols = portfolioStore.watchlistData.map((w) => w.yahoo).filter(Boolean);

    // FX symbols for every non-EUR currency held (EURUSD=X always, for the
    // top-bar badge and USD-quoted watchlist symbols).
    const heldCurrencies = [...new Set(portfolioStore.positions.map((p) => p.currency).filter((c) => c && c !== 'EUR'))];
    const fxSymbols = [...new Set(['EURUSD=X', ...heldCurrencies.map((c) => FX_DEFS[c]?.symbol).filter((s): s is string => Boolean(s))])];

    const symbols = [...new Set([...yahooSymbols, ...watchlistSymbols, ...fxSymbols])];

    try {
      const result = await fetchIntraday(symbols, force);
      data = { ...data, ...result };

      // Extract live rates per currency (GBP/GBX share one symbol; scale is
      // applied at conversion time in $lib/fx).
      const nextRates = { ...liveRates };
      for (const [ccy, def] of Object.entries(FX_DEFS)) {
        const fxData = result[def.symbol];
        const rate = fxData?.points?.at(-1)?.close ?? fxData?.previousClose;
        if (rate) nextRates[ccy] = rate;
      }
      liveRates = nextRates;

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
    get liveRates()   { return liveRates; },
    // Convenience for the EUR/USD top-bar badge
    get liveEurUsd()  { return liveRates['USD'] ?? null; },
    load,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

export const intradayStore = createIntradayStore();
