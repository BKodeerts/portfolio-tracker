<script lang="ts">
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { filterByPeriod } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import { getDay1Pl, getPeriodPl } from '$lib/derived/dashboard';
  import { buildOption, build1DOption } from '$lib/charts/dashboard';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import type { DashboardView } from '$lib/charts/dashboard';
  import type { LegacyPeriod as Period } from '$lib/utils/period';

  /** Dashboard portfolio chart: period/view controls, headline P&L, legend. */

  let period = $state<Period>('1d');
  let view   = $state<DashboardView>('total');

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1d', label: '1D' }, { key: '1m', label: '1M' }, { key: '3m', label: '3M' },
    { key: '6m', label: '6M' }, { key: 'ytd', label: 'YTD' }, { key: '1y', label: '1Y' },
    { key: '2y', label: '2Y' }, { key: '3y', label: '3Y' }, { key: 'total', label: 'Max' },
  ];

  const UNITS: { key: Exclude<DashboardView, 'total'>; label: string }[] = [
    { key: 'individual', label: 'Waarde €' }, { key: 'pct', label: 'Rendement %' }, { key: 'pl', label: 'Winst €' },
  ];

  const visibleTickers = $derived(portfolioStore.currentTickers);

  const filtered = $derived(
    period === '1d' ? portfolioStore.chartData : filterByPeriod(portfolioStore.chartData, period),
  );

  const chartOption   = $derived(period === '1d' ? build1DOption(view) : buildOption(filtered, view, period, visibleTickers));
  const periodPlValue = $derived(period === '1d' ? getDay1Pl() : getPeriodPl(filtered));
  const periodLabel   = $derived(PERIODS.find((p) => p.key === period)?.label ?? '');
</script>

<div class="chart-card" style="margin-bottom:12px">
  <div class="chart-headline">
    <div class="headline-pl {(periodPlValue?.pl ?? 0) >= 0 ? 'c-pos' : 'c-neg'}" style:visibility={periodPlValue ? 'visible' : 'hidden'}>
      {#if periodPlValue}
        <PrivacyValue value={`${periodPlValue.pl >= 0 ? '+' : ''}${fmt(periodPlValue.pl)}`} />
        <span class="headline-pct">{fmtPct(periodPlValue.pct)}</span>
      {:else}&nbsp;{/if}
    </div>
    <div class="headline-caption">{periodLabel}</div>
  </div>

  <div class="chart-header">
    <div class="seg desktop-only">
      <button class="seg-btn" class:on={view === 'total'} onclick={() => (view = 'total')}>Totaal</button>
      <button class="seg-btn" class:on={view !== 'total'} onclick={() => (view = 'pct')}>Per positie</button>
    </div>
    {#if view !== 'total'}
      <div class="seg seg-sub desktop-only">
        {#each UNITS as u}
          <button class="seg-btn" class:on={view === u.key} onclick={() => (view = u.key)}>{u.label}</button>
        {/each}
      </div>
    {/if}
    <div class="period-pills desktop-only">
      {#each PERIODS as p}
        <button class="pill" class:on={period === p.key} onclick={() => (period = p.key)}>{p.label}</button>
      {/each}
    </div>
    <!-- Mobile: real segmented controls, not native selects -->
    <div class="chart-controls-mobile">
      <div class="seg seg-mobile">
        <button class="seg-btn" class:on={view === 'total'} onclick={() => (view = 'total')}>Totaal</button>
        <button class="seg-btn" class:on={view !== 'total'} onclick={() => (view = 'pct')}>Per pos.</button>
      </div>
      <div class="period-pills-track period-pills-mobile">
        {#each PERIODS as p}
          <button class="pill" class:on={period === p.key} onclick={() => (period = p.key)}>{p.label}</button>
        {/each}
      </div>
    </div>

  </div>

  <div class="chart-wrap">
    {#if chartOption}
      <Chart option={chartOption} height="340px" />
    {:else if period === '1d'}
      <div class="chart-empty" style="height:340px">Intraday data laden…</div>
    {:else if filtered.length <= 1}
      <div class="chart-empty" style="height:340px">Niet genoeg data voor deze periode</div>
    {/if}
  </div>

  <div class="chart-legend">
    {#if view !== 'total'}
      {#each visibleTickers as t}
        <a class="legend-item" href={resolve('/stock/[ticker]', { ticker: t })}>
          <span class="legend-dot" style="background:{getColor(t)}"></span>{t}
        </a>
      {/each}
    {:else}
      <div class="legend-item"><span class="legend-line" style="background:var(--accent)"></span>Portefeuille</div>
      {#if period !== '1d'}
        <div class="legend-item"><span class="legend-line dashed"></span>Kostprijs</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ── Chart card internals ─────────────────────────────── */
  .chart-headline {
    display: flex; align-items: baseline; gap: 10px;
    padding: 14px 16px 10px; border-bottom: 1px solid var(--border); min-height: 40px;
  }
  .headline-pl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px; font-weight: 700; line-height: 1.1; white-space: nowrap;
  }
  .headline-pct { font-size: 14px; font-weight: 600; opacity: 0.8; margin-left: 8px; }
  .headline-caption { margin-left: auto; font-size: 12px; color: var(--fg-muted); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.04em; }

  .chart-wrap { position: relative; }
  .chart-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--fg-muted); font-size: 13px; }

  .chart-legend {
    display: flex; flex-wrap: wrap; gap: 10px 16px;
    padding: 10px 16px; border-top: 1px solid var(--border);
  }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg-muted); text-decoration: none; }
  .legend-item:hover { color: var(--fg); }
  .legend-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .legend-line { width: 16px; height: 2px; border-radius: 1px; flex-shrink: 0; background: var(--accent); }
  .legend-line.dashed { background: none !important; border-top: 2px dashed var(--fg-muted); height: 0; margin-top: 1px; }

  .seg-sub { background: transparent; border-color: transparent; padding: 0; }

  @media (max-width: 640px) {
    .chart-headline { padding: 10px 12px 8px; min-height: 34px; }
    .headline-pl { font-size: 17px; }
    .headline-pct { font-size: 12px; }
    .desktop-only { display: none !important; }
    .chart-controls-mobile { display: flex !important; width: stretch; }
  }

  /* ── Mobile chart controls ─────────────────────────────── */
  .chart-controls-mobile {
    display: none;
    flex-direction: column;
    gap: 8px;
  }
  @media (max-width: 700px) {
    .chart-controls-mobile { display: flex; }
    /* Hide the desktop-only chart header rows on mobile */
    .chart-header > .desktop-only { display: none !important; }
  }

  .seg-mobile { width: 100%; }
  .seg-mobile .seg-btn { flex: 1; height: 30px; font-size: 12px; }

  /* iOS-style segmented track for periods — single row, scrollable if needed */
  .period-pills-track {
    display: flex;
    gap: 0;
    background: var(--surface-2);
    border-radius: 9px;
    padding: 3px;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;          /* don't bleed past the card */
  }
  .period-pills-track .pill {
    flex: 1 1 0;               /* equal share, allowed to shrink */
    min-width: 0;              /* let flex shrink past content size */
    height: 26px;
    padding: 0 4px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600;
    background: transparent;
    border: 0;
    border-radius: 7px;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background .12s, color .12s;
    white-space: nowrap;
  }
  .period-pills-track .pill:hover { color: var(--fg); }
  .period-pills-track .pill.on {
    background: var(--surface);
    color: var(--fg);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }
</style>
