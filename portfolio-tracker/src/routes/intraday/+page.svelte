<script lang="ts">
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { isExchangeOpen, getTradingMins, normalizeMarketState } from '$lib/market';
  import { toEurLiveOrFallback } from '$lib/fx';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import IntradayCards from '$lib/components/dashboard/IntradayCards.svelte';
  import type { IntradayCardItem } from '$lib/components/dashboard/IntradayCards.svelte';

  const cards = $derived((): IntradayCardItem[] => {
    return portfolioStore.currentTickers.map((ticker) => {
      const meta  = portfolioStore.tickerMeta[ticker];
      const yahoo = (meta?.['yahoo'] as string | undefined) ?? ticker;
      const label = (meta?.['label'] as string | undefined) ?? ticker;
      const pos   = portfolioStore.positions.find((p) => p.ticker === ticker);
      const shares = pos?.shares ?? 0;

      const intra = intradayStore.data[yahoo];
      const prevClose   = intra?.previousClose ?? null;
      const pts         = intra?.points ?? [];
      const lastPt      = pts[pts.length - 1];
      const price       = lastPt?.close ?? null;
      const tradingMins = getTradingMins(yahoo);

      const changePct = price != null && prevClose
        ? ((price - prevClose) / prevClose) * 100
        : null;
      const changeEur = price != null && prevClose && shares
        ? toEurLiveOrFallback(
            pos?.currency ?? (meta?.['currency'] as string | undefined),
            (price - prevClose) * shares,
            intradayStore.liveRates,
          )
        : null;

      const rawState  = intra?.marketState ?? '';
      const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));

      const muted = marketState !== 'REGULAR';

      return {
        ticker, label, shares, price, changePct, changeEur, marketState,
        href: resolve('/stock/[ticker]', { ticker }),
        points: pts, prevClose, tradingMins, muted,
      };
    });
  });

  const watchlistCards = $derived((): IntradayCardItem[] => {
    return portfolioStore.watchlistData.map((w) => {
      const intra = intradayStore.data[w.yahoo];
      const pts   = intra?.points ?? [];
      const prev  = intra?.previousClose ?? null;
      const last  = pts[pts.length - 1];
      const price = last?.close ?? null;
      const pct   = price != null && prev ? ((price - prev) / prev) * 100 : null;
      const rawState = intra?.marketState ?? '';
      const state = normalizeMarketState(w.yahoo, rawState || (isExchangeOpen(w.yahoo) ? 'REGULAR' : 'CLOSED'));
      return {
        ticker: w.ticker, label: w.label ?? '', price, changePct: pct, marketState: state,
        points: pts, prevClose: prev, tradingMins: getTradingMins(w.yahoo), muted: state !== 'REGULAR',
      };
    });
  });

  const totalDayPl = $derived(cards().reduce((s, c) => s + (c.changeEur ?? 0), 0));
  const totalValue = $derived(portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const totalDayPlPct = $derived(totalValue - totalDayPl > 0 ? (totalDayPl / (totalValue - totalDayPl)) * 100 : 0);
</script>

<div class="page-root">
  {#if intradayStore.loaded}
    <!-- Summary row -->
    <div class="day-summary card">
      <div class="day-label">Vandaag</div>
      <div class="day-pl {totalDayPl >= 0 ? 'c-pos' : 'c-neg'}">
        <PrivacyValue value={`${totalDayPl >= 0 ? '+' : ''}${fmt(totalDayPl)}`} />
      </div>
      <div class="day-pct {totalDayPl >= 0 ? 'c-pos' : 'c-neg'}">{fmtPct(totalDayPlPct)}</div>
      {#if intradayStore.liveEurUsd}
        <div class="fx-rate">EUR/USD {intradayStore.liveEurUsd.toFixed(4)}</div>
      {/if}
    </div>

    <!-- Sparkline grid -->
    <IntradayCards items={cards()} />

    <!-- Watchlist -->
    {#if portfolioStore.watchlistData.length > 0}
      <div style="margin-top:20px">
        <h3 style="font-size:13px;font-weight:600;margin:0 0 10px">Watchlist</h3>
        <IntradayCards items={watchlistCards()} />
      </div>
    {/if}
  {:else}
    <div class="loading-state">Intraday data laden…</div>
  {/if}
</div>

<style>
  .day-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .day-label { font-size: 12px; color: var(--fg-muted); }
  .day-pl { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 600; }
  .day-pct { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .fx-rate { margin-left: auto; font-size: 11px; color: var(--fg-muted); font-family: 'JetBrains Mono', monospace; }

  .loading-state { color: var(--fg-muted); font-size: 13px; padding: 24px 0; }
</style>
