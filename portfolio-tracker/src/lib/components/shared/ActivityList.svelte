<script lang="ts">
  import { fmtEur } from '$lib/utils/fmt';

  /**
   * Flat transaction rows (dashboard "Activity", stock detail "Your history").
   * Kind is derived from shares: >0 BUY, <0 SELL, ===0 DIV.
   */
  interface ActivityItem {
    date: string;      // YYYY-MM-DD
    ticker: string;
    shares: number;
    costEur: number;
    detail?: string;   // e.g. "10 sh @ $44.71"; fallback built from shares + date
  }
  interface Props {
    items: ActivityItem[];
    showTicker?: boolean;
  }
  const { items, showTicker = true }: Props = $props();

  function kindOf(shares: number): 'BUY' | 'SELL' | 'DIV' {
    return shares > 0 ? 'BUY' : shares < 0 ? 'SELL' : 'DIV';
  }
  function detailOf(item: ActivityItem): string {
    if (item.detail) return item.detail;
    const datePart = item.date.slice(5);
    return item.shares !== 0 ? `${Math.abs(item.shares)} sh · ${datePart}` : datePart;
  }
</script>

<div class="activity">
  {#each items as item, i (i)}
    <div class="row">
      <span class="chip {kindOf(item.shares).toLowerCase()}">{kindOf(item.shares)}</span>
      {#if showTicker}
        <span class="ticker">{item.ticker}</span>
      {/if}
      <span class="detail">{detailOf(item)}</span>
      <span class="amount mono">{fmtEur(item.costEur)}</span>
    </div>
  {/each}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .chip {
    width: 34px;
    text-align: center;
    padding: 3px 0;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .chip.buy  { background: var(--c-pos-tint); color: var(--c-pos); }
  .chip.sell { background: var(--c-neg-tint); color: var(--c-neg); }
  .chip.div  { background: var(--c-div-tint); color: var(--c-div); }
  .ticker {
    font-size: 12.5px;
    font-weight: 600;
  }
  .detail {
    font-size: 11px;
    color: var(--fg-faint);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .amount {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
  }
  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
    letter-spacing: -0.02em;
  }
</style>
