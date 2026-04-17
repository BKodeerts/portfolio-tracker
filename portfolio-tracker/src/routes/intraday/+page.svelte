<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { sparklineSVG, isExchangeOpen, getTradingMins, normalizeMarketState, EU_EXCHANGE_RE } from '$lib/utils/exchange';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';

  interface SparkCard {
    ticker: string;
    yahoo: string;
    label: string;
    shares: number;
    prevClose: number | null;
    price: number | null;
    changePct: number | null;
    changeEur: number | null;
    marketState: string;
    sparkHtml: string;
  }

  const cards = $derived((): SparkCard[] => {
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
        ? ((price - prevClose) * shares) / (EU_EXCHANGE_RE.test(yahoo) ? 1 : (intradayStore.liveEurUsd ?? 1.1))
        : null;

      const rawState  = intra?.marketState ?? '';
      const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));

      const muted   = marketState !== 'REGULAR';
      const sparkHtml = pts.length >= 2 && prevClose
        ? sparklineSVG(pts, prevClose, tradingMins, muted)
        : '';

      return { ticker, yahoo, label, shares, prevClose, price, changePct, changeEur, marketState, sparkHtml };
    });
  });

  function stateLabel(s: string) {
    if (s === 'REGULAR') return 'Open';
    if (s === 'PRE')     return 'Pre';
    if (s === 'POST')    return 'Post';
    return 'Gesloten';
  }
  function stateClass(s: string) {
    if (s === 'REGULAR') return 'badge-open';
    if (s === 'PRE' || s === 'POST') return 'badge-ext';
    return 'badge-closed';
  }

  const totalDayPl = $derived(portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0));
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
    <div class="spark-grid">
      {#each cards() as card}
        <a class="spark-card card" href="/stock/{card.ticker}">
          <div class="spark-header">
            <div class="spark-ticker">{card.ticker}</div>
            <span class="badge {stateClass(card.marketState)}">{stateLabel(card.marketState)}</span>
          </div>
          {#if card.label !== card.ticker}
            <div class="spark-label">{card.label}</div>
          {/if}
          <div class="spark-price">
            {#if card.price != null}
              <span class="price-val">{card.price.toFixed(2)}</span>
              {#if card.changePct != null}
                <span class="price-chg {card.changePct >= 0 ? 'c-pos' : 'c-neg'}">
                  {card.changePct >= 0 ? '+' : ''}{card.changePct.toFixed(2)}%
                </span>
              {/if}
            {:else}
              <span class="c-muted">—</span>
            {/if}
          </div>
          {#if card.changeEur != null && card.shares}
            <div class="spark-eur {card.changeEur >= 0 ? 'c-pos' : 'c-neg'}">
              <PrivacyValue value={`${card.changeEur >= 0 ? '+' : ''}${fmt(card.changeEur)}`} />
            </div>
          {/if}
          <!-- svelte-ignore html-self-closing-tags -->
          {@html card.sparkHtml}
        </a>
      {/each}
    </div>

    <!-- Watchlist -->
    {#if portfolioStore.watchlistData.length > 0}
      <div style="margin-top:20px">
        <h3 style="font-size:13px;font-weight:600;margin:0 0 10px">Watchlist</h3>
        <div class="spark-grid">
          {#each portfolioStore.watchlistData as w}
            {@const intra = intradayStore.data[w.yahoo]}
            {@const pts   = intra?.points ?? []}
            {@const prev  = intra?.previousClose ?? null}
            {@const last  = pts[pts.length - 1]}
            {@const price = last?.close ?? null}
            {@const pct   = price != null && prev ? ((price - prev) / prev) * 100 : null}
            {@const rawState = intra?.marketState ?? ''}
            {@const state = normalizeMarketState(w.yahoo, rawState || (isExchangeOpen(w.yahoo) ? 'REGULAR' : 'CLOSED'))}
            <div class="spark-card card">
              <div class="spark-header">
                <div class="spark-ticker">{w.ticker}</div>
                <span class="badge {stateClass(state)}">{stateLabel(state)}</span>
              </div>
              {#if w.label && w.label !== w.ticker}
                <div class="spark-label">{w.label}</div>
              {/if}
              <div class="spark-price">
                {#if price != null}
                  <span class="price-val">{price.toFixed(2)}</span>
                  {#if pct != null}
                    <span class="price-chg {pct >= 0 ? 'c-pos' : 'c-neg'}">{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
                  {/if}
                {:else}
                  <span class="c-muted">—</span>
                {/if}
              </div>
              {#if pts.length >= 2 && prev}
                <!-- svelte-ignore html-self-closing-tags -->
                {@html sparklineSVG(pts, prev, getTradingMins(w.yahoo), state !== 'REGULAR')}
              {/if}
            </div>
          {/each}
        </div>
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

  .spark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }
  .spark-card {
    padding: 12px 14px;
    text-decoration: none;
    color: inherit;
    display: block;
    transition: border-color 0.1s;
  }
  .spark-card:hover { border-color: var(--fg-muted); }

  .spark-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .spark-ticker { font-size: 13px; font-weight: 700; }
  .spark-label { font-size: 11px; color: var(--fg-muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spark-price {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 6px;
  }
  .price-val { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 600; }
  .price-chg { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .spark-eur { font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-top: 2px; }

  .badge {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge-open   { background: rgba(74,222,128,0.15); color: #4ade80; }
  .badge-ext    { background: rgba(251,191,36,0.15);  color: #fbbf24; }
  .badge-closed { background: rgba(100,116,139,0.15); color: #64748b; }

  .loading-state { color: var(--fg-muted); font-size: 13px; padding: 24px 0; }
  .c-muted { color: var(--fg-muted); }
</style>
