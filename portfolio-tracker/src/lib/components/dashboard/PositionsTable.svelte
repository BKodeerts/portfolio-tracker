<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmt } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import { posSparkValues } from '$lib/derived/dashboard';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import MiniTrend from './MiniTrend.svelte';

  /** Sortable positions table with day P&L and 30D mini trend. */
  interface Props {
    dayPl: Record<string, number | null>;
    dayPct: Record<string, number | null>;
  }
  const { dayPl, dayPct }: Props = $props();

  function signed(v: number) { return `${v >= 0 ? '+' : ''}${fmt(v)}`; }
</script>

<div class="pos-table-scroll">
  <table class="pos-table">
    <thead>
      <tr>
        <th onclick={() => portfolioStore.sortPositions('ticker')} class="sortable left">
          Ticker {portfolioStore.posSort.col === 'ticker' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th onclick={() => portfolioStore.sortPositions('value')} class="sortable right">
          Waarde {portfolioStore.posSort.col === 'value' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th onclick={() => portfolioStore.sortPositions('pl')} class="sortable right desktop-only">
          P&amp;L {portfolioStore.posSort.col === 'pl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th onclick={() => portfolioStore.sortPositions('plPct')} class="sortable right desktop-only">
          % {portfolioStore.posSort.col === 'plPct' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th onclick={() => portfolioStore.sortPositions('dayPl')} class="sortable right desktop-only">
          Vandaag € {portfolioStore.posSort.col === 'dayPl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th onclick={() => portfolioStore.sortPositions('dayPl')} class="sortable right">
          Dag % {portfolioStore.posSort.col === 'dayPl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th class="right desktop-only">30D</th>
        <th onclick={() => portfolioStore.sortPositions('cost')} class="sortable right desktop-only">
          Ingelegd {portfolioStore.posSort.col === 'cost' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
        </th>
      </tr>
    </thead>
    <tbody>
      {#each portfolioStore.sortedPositions as pos}
        <tr onclick={() => goto(resolve('/stock/[ticker]', { ticker: pos.ticker }))}>
          <td class="left">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="ticker-dot" style="background:{getColor(pos.ticker)}"></span>
              <div>
                <div style="font-weight:700;font-size:12px">{pos.ticker}</div>
                {#if pos.label && pos.label !== pos.ticker}
                  <div class="h-sm desktop-only" style="font-size:10px">{pos.label}</div>
                {/if}
              </div>
            </div>
          </td>
          <td class="right mono"><PrivacyValue value={fmt(pos.value)} /></td>
          <td class="right mono desktop-only {pos.pl >= 0 ? 'c-pos' : 'c-neg'}">
            <PrivacyValue value={signed(pos.pl)} />
          </td>
          <td class="right desktop-only">
            <span class="pill-badge sm" class:pos={pos.plPct >= 0} class:neg={pos.plPct < 0}>
              {pos.plPct >= 0 ? '▲' : '▼'} {Math.abs(pos.plPct).toFixed(1)}%
            </span>
          </td>
          <td class="right mono desktop-only {(dayPl[pos.ticker] ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
            {#if dayPl[pos.ticker] != null}
              <PrivacyValue value={signed(dayPl[pos.ticker] ?? 0)} />
            {:else}<span class="c-muted">—</span>{/if}
          </td>
          <td class="right">
            {#if dayPct[pos.ticker] != null}
              <span class="pill-badge sm" class:pos={(dayPct[pos.ticker] ?? 0) >= 0} class:neg={(dayPct[pos.ticker] ?? 0) < 0}>
                {(dayPct[pos.ticker] ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(dayPct[pos.ticker] ?? 0).toFixed(2)}%
              </span>
            {:else}<span class="c-muted">—</span>{/if}
          </td>
          <td class="right desktop-only">
            <MiniTrend values={posSparkValues(pos.ticker)} />
          </td>
          <td class="right mono desktop-only c-muted"><PrivacyValue value={fmt(pos.costEur)} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .pos-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .pos-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 520px; }
  .pos-table th {
    padding: 9px 12px; font-size: 10px; font-weight: 600;
    color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.07em;
    border-bottom: 1px solid var(--border); white-space: nowrap; vertical-align: bottom;
  }
  .pos-table th.sortable { cursor: pointer; user-select: none; }
  .pos-table th.sortable:hover { color: var(--fg); }
  .pos-table th.left, .pos-table td.left { text-align: left; }
  .pos-table th.right, .pos-table td.right { text-align: right; }
  .pos-table tbody tr:hover td { background: var(--surface-hover); cursor: pointer; }
  .pos-table td {
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    white-space: nowrap; vertical-align: middle;
    font-family: 'JetBrains Mono', monospace;
  }
  .pos-table td.left { font-family: inherit; }
  .pos-table tbody tr:last-child td { border-bottom: none; }
  .ticker-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 0; flex-shrink: 0; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }

  @media (max-width: 640px) {
    .pos-table td, .pos-table th { padding: 8px 8px; }
    .pos-table { min-width: 360px; }
  }
</style>
