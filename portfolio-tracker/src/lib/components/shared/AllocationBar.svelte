<script lang="ts">
  /**
   * One 8px stacked allocation bar with a chip (wrapping) or row (vertical)
   * legend. `pct` values are 0–100 shares of the bar width.
   */
  interface AllocationItem {
    name: string;
    color: string;
    pct: number;
  }
  interface Props {
    items: AllocationItem[];
    legend?: 'chips' | 'rows';
  }
  const { items, legend = 'chips' }: Props = $props();
</script>

<div class="alloc">
  <div class="bar">
    {#each items as item (item.name)}
      <div class="seg" style="width:{item.pct}%; background:{item.color}"></div>
    {/each}
  </div>
  {#if legend === 'chips'}
    <div class="legend-chips">
      {#each items as item (item.name)}
        <div class="chip">
          <span class="dot" style="background:{item.color}"></span>
          {item.name}
          <span class="chip-pct mono">{item.pct.toFixed(0)}%</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="legend-rows">
      {#each items as item (item.name)}
        <div class="lrow">
          <span class="dot" style="background:{item.color}"></span>
          <span class="lrow-name">{item.name}</span>
          <span class="lrow-pct mono">{item.pct.toFixed(0)}%</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bar {
    height: 8px;
    border-radius: 999px;
    display: flex;
    gap: 2px;
    overflow: hidden;
  }
  .seg { height: 100%; }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
    letter-spacing: -0.02em;
  }

  .legend-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 10px;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--fg-muted);
  }
  .chip-pct {
    font-weight: 600;
    color: var(--fg-secondary);
  }

  .legend-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }
  .lrow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .lrow-name {
    color: var(--fg-muted);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lrow-pct {
    font-weight: 700;
    text-align: right;
  }
</style>
