<script lang="ts" module>
  import type { IntradayPoint } from '$lib/types/candle';

  export interface IntradayCardItem {
    ticker: string;
    label: string;
    /** When set the card is a link (portfolio positions); watchlist cards are static. */
    href?: string | null;
    shares?: number;
    price: number | null;
    changePct: number | null;
    changeEur?: number | null;
    marketState: string;
    points: IntradayPoint[];
    prevClose: number | null;
    tradingMins: number;
    muted: boolean;
  }
</script>

<script lang="ts">
  import { fmt } from '$lib/utils/fmt';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';

  /** Grid of intraday spark cards (price, day change, market-state badge). */
  interface Props {
    items: IntradayCardItem[];
  }
  const { items }: Props = $props();

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
</script>

{#snippet cardBody(item: IntradayCardItem)}
  <div class="spark-header">
    <div class="spark-ticker">{item.ticker}</div>
    <span class="badge {stateClass(item.marketState)}">{stateLabel(item.marketState)}</span>
  </div>
  {#if item.label && item.label !== item.ticker}
    <div class="spark-label">{item.label}</div>
  {/if}
  <div class="spark-price">
    {#if item.price != null}
      <span class="price-val">{item.price.toFixed(2)}</span>
      {#if item.changePct != null}
        <span class="price-chg {item.changePct >= 0 ? 'c-pos' : 'c-neg'}">
          {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
        </span>
      {/if}
    {:else}
      <span class="c-muted">—</span>
    {/if}
  </div>
  {#if item.changeEur != null && item.shares}
    <div class="spark-eur {item.changeEur >= 0 ? 'c-pos' : 'c-neg'}">
      <PrivacyValue value={`${item.changeEur >= 0 ? '+' : ''}${fmt(item.changeEur)}`} />
    </div>
  {/if}
  {#if item.points.length >= 2 && item.prevClose}
    <Sparkline points={item.points} prevClose={item.prevClose} tradingMins={item.tradingMins} muted={item.muted} />
  {/if}
{/snippet}

<div class="spark-grid">
  {#each items as item}
    {#if item.href}
      <a class="spark-card card" href={item.href}>
        {@render cardBody(item)}
      </a>
    {:else}
      <div class="spark-card card">
        {@render cardBody(item)}
      </div>
    {/if}
  {/each}
</div>

<style>
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

  .c-muted { color: var(--fg-muted); }
</style>
