<script lang="ts">
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import { posSparkValues, intradaySparkInputs } from '$lib/derived/dashboard';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import MiniTrend from './MiniTrend.svelte';

  /** Position card grid (view B): intraday spark with 3-month fallback trend. */
  interface Props {
    dayPl: Record<string, number | null>;
    dayPct: Record<string, number | null>;
  }
  const { dayPl, dayPct }: Props = $props();
</script>

<div class="pos-cards-grid">
  {#each portfolioStore.sortedPositions as pos}
    {@const spark = intradaySparkInputs(pos.ticker)}
    <a href={resolve('/stock/[ticker]', { ticker: pos.ticker })} class="pos-card hover-lift" style="border-left:3px solid {getColor(pos.ticker)}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span class="ticker-dot" style="background:{getColor(pos.ticker)};flex-shrink:0"></span>
          <div style="font-size:13px;font-weight:700;letter-spacing:-0.01em">{pos.ticker}</div>
        </div>
        {#if dayPl[pos.ticker] != null}
          <span class="pill-badge sm" class:pos={(dayPl[pos.ticker] ?? 0) >= 0} class:neg={(dayPl[pos.ticker] ?? 0) < 0}>
            {(dayPl[pos.ticker] ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(dayPct[pos.ticker] ?? 0).toFixed(2)}%
          </span>
        {/if}
      </div>
      <div class="mono" style="font-size:16px;font-weight:600;margin-bottom:6px">
        <PrivacyValue value={fmt(pos.value)} />
      </div>
      <div style="margin:4px 0">
        {#if spark}
          <Sparkline points={spark.points} prevClose={spark.prevClose} tradingMins={spark.tradingMins} variant="compact" />
        {:else}
          <MiniTrend values={posSparkValues(pos.ticker)} fullWidth />
        {/if}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;font-size:10px;color:var(--fg-muted)">
        <span>{pos.shares}×</span>
        <span class="mono" style="font-weight:700;color:{pos.plPct >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
          {fmtPct(pos.plPct)}
        </span>
      </div>
    </a>
  {/each}
</div>

<style>
  .pos-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    padding: 14px;
  }
  .pos-card {
    display: block; padding: 13px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    text-decoration: none; color: inherit; cursor: pointer;
  }
  .pos-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-hover); }

  @media (max-width: 640px) {
    .pos-cards-grid { grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; }
  }

  .ticker-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 0; flex-shrink: 0; }
  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
