<script lang="ts">
  import { page } from '$app/stores';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fetchBonusHistory } from '$lib/api/bonus';
  import { fmt, fmtPct, fmtNum } from '$lib/utils/fmt';
  import Chart from '$lib/components/Chart.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { BonusHistoryPoint } from '$lib/types/bonus';
  import type { EChartsOption } from 'echarts';

  const id = $derived($page.params['id'] ?? '');
  const item = $derived(portfolioStore.bonusItems.find((b) => b.id === id) ?? null);

  let history     = $state<BonusHistoryPoint[]>([]);
  let histLoading = $state(false);
  let showPrior   = $state(true);

  $effect(() => {
    if (!id) return;
    histLoading = true;
    fetchBonusHistory(id)
      .then((h) => { history = h; })
      .catch(() => { history = []; })
      .finally(() => { histLoading = false; });
  });

  const plChartOption = $derived((): EChartsOption => {
    if (!history.length || !item) return {};
    const isDark    = themeStore.isDark;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const totalCost = item.totalCost ?? 0;

    const shownHistory = showPrior ? history : history.filter((p) => {
      // filter to current year only (simplified)
      return true;
    });

    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 64 },
      xAxis: {
        type: 'category',
        data: shownHistory.map((p) => p.date),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: (v: number) => themeStore.privacyMode ? '●●' : (Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`),
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' },
      },
      series: [
        {
          name: 'Waarde',
          type: 'line',
          data: shownHistory.map((p) => p.value),
          smooth: false, symbol: 'none',
          lineStyle: { color: '#818cf8', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.2)' }, { offset: 1, color: 'rgba(99,102,241,0.01)' }] } },
        },
        ...(totalCost > 0 ? [{
          name: 'Kostprijs',
          type: 'line' as const,
          data: shownHistory.map(() => totalCost),
          smooth: false, symbol: 'none',
          lineStyle: { color: isDark ? '#334155' : '#94a3b8', width: 1, type: 'dashed' as const },
        }] : []),
      ],
    };
  });

  const underlyingOption = $derived((): EChartsOption => {
    if (!history.length) return {};
    const withUnderlying = history.filter((p) => p.underlyingPrice != null);
    if (withUnderlying.length < 2) return {};
    const isDark    = themeStore.isDark;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    const first = withUnderlying[0]!.underlyingPrice!;
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: {
        type: 'category',
        data: withUnderlying.map((p) => p.date),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => `${+v.toFixed(1)}%` },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          const first = (p as Array<{ axisValue: string; value: number }>)[0];
          if (!first) return '';
          return `${first.axisValue}: ${first.value >= 0 ? '+' : ''}${first.value.toFixed(2)}%`;
        },
      },
      series: [{
        name: item?.symbol ?? '',
        type: 'line',
        data: withUnderlying.map((p) => +((p.underlyingPrice! / first - 1) * 100).toFixed(2)),
        smooth: false, symbol: 'none', connectNulls: true,
        lineStyle: { color: '#34d399', width: 1.5 },
      }],
    };
  });
</script>

<div class="page-root">
  {#if !item}
    <div class="c-muted" style="padding:24px;text-align:center">Bonus niet gevonden</div>
  {:else}
    <!-- Stats grid -->
    <div class="stats-grid card">
      <div class="stat">
        <div class="stat-label">Totale waarde</div>
        <div class="stat-val">
          {#if item.totalValue != null}
            <PrivacyValue value={fmt(item.totalValue)} />
          {:else}—{/if}
        </div>
      </div>
      <div class="stat">
        <div class="stat-label">P&amp;L</div>
        <div class="stat-val {(item.pl ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
          {#if item.pl != null}
            <PrivacyValue value={`${item.pl >= 0 ? '+' : ''}${fmt(item.pl)}`} />
          {:else}—{/if}
        </div>
        {#if item.plPct != null}
          <div class="stat-sub {item.plPct >= 0 ? 'c-pos' : 'c-neg'}">{fmtPct(item.plPct)}</div>
        {/if}
      </div>
      <div class="stat">
        <div class="stat-label">Kostprijs</div>
        <div class="stat-val">
          {#if item.totalCost != null}
            <PrivacyValue value={fmt(item.totalCost)} />
          {:else}—{/if}
        </div>
      </div>
      <div class="stat">
        <div class="stat-label">Huidig / toekenning</div>
        <div class="stat-val mono">{(item.currentPrice ?? item.grantPrice).toFixed(2)} / {item.grantPrice.toFixed(2)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Aantal</div>
        <div class="stat-val"><PrivacyValue value={String(item.quantity)} /></div>
      </div>
      {#if item.expiryDate}
        <div class="stat">
          <div class="stat-label">Vervaldatum</div>
          <div class="stat-val mono">{item.expiryDate}</div>
        </div>
      {/if}
      {#if item.strikePrice}
        <div class="stat">
          <div class="stat-label">Strike</div>
          <div class="stat-val mono">{item.strikePrice}</div>
        </div>
      {/if}
      {#if item.intrinsicValue != null}
        <div class="stat">
          <div class="stat-label">Intrinsieke waarde</div>
          <div class="stat-val mono">{item.intrinsicValue.toFixed(4)}</div>
        </div>
      {/if}
      {#if item.timeValue != null}
        <div class="stat">
          <div class="stat-label">Tijdswaarde</div>
          <div class="stat-val mono">{item.timeValue.toFixed(4)}</div>
        </div>
      {/if}
    </div>

    <!-- Greeks (call options) -->
    {#if item.type === 'call_option' && (item.delta != null || item.gamma != null)}
      <div class="stats-grid card" style="margin-top:12px">
        {#if item.delta   != null}<div class="stat"><div class="stat-label">Delta</div><div class="stat-val mono">{fmtNum(item.delta, 4)}</div></div>{/if}
        {#if item.gamma   != null}<div class="stat"><div class="stat-label">Gamma</div><div class="stat-val mono">{fmtNum(item.gamma, 4)}</div></div>{/if}
        {#if item.theta   != null}<div class="stat"><div class="stat-label">Theta</div><div class="stat-val mono">{fmtNum(item.theta, 4)}</div></div>{/if}
        {#if item.vega    != null}<div class="stat"><div class="stat-label">Vega</div><div class="stat-val mono">{fmtNum(item.vega, 4)}</div></div>{/if}
        {#if item.impliedVol != null}<div class="stat"><div class="stat-label">Impl. vol.</div><div class="stat-val mono">{fmtPct(item.impliedVol)}</div></div>{/if}
      </div>
    {/if}

    <!-- Belgian tax card (warrants) -->
    {#if item.type === 'warrant' && (item.vaa != null || item.atn != null)}
      <div class="tax-card card" style="margin-top:12px">
        <div class="card-title" style="margin-bottom:10px">Belgische belasting</div>
        <div class="stats-grid" style="padding:0">
          {#if item.vaa != null}
            <div class="stat"><div class="stat-label">VAA (belastbare basis)</div><div class="stat-val"><PrivacyValue value={fmt(item.vaa)} /></div></div>
          {/if}
          {#if item.atn != null}
            <div class="stat"><div class="stat-label">ATN (voordeel)</div><div class="stat-val"><PrivacyValue value={fmt(item.atn)} /></div></div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- PnL history chart -->
    <div class="card chart-card" style="margin-top:12px">
      <div class="chart-header">
        <span class="card-title">Waardeverloop</span>
        {#if history.length > 0}
          <label class="toggle-label">
            <input type="checkbox" bind:checked={showPrior} />
            Toon vorige jaren
          </label>
        {/if}
      </div>
      {#if histLoading}
        <div class="chart-placeholder">Laden…</div>
      {:else if history.length > 1}
        <Chart option={plChartOption()} height="260px" />
      {:else}
        <div class="chart-placeholder">Geen historische data</div>
      {/if}
    </div>

    <!-- Underlying chart -->
    {#if history.some((p) => p.underlyingPrice != null)}
      <div class="card chart-card" style="margin-top:12px">
        <div class="chart-header">
          <span class="card-title">Onderliggende ({item.symbol})</span>
        </div>
        <Chart option={underlyingOption()} height="200px" />
      </div>
    {/if}
  {/if}
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0;
    padding: 0;
  }
  .stats-grid.card { overflow: hidden; }
  .stat {
    padding: 12px 16px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .stat:last-child { border-right: none; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted); margin-bottom: 3px; }
  .stat-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }
  .stat-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-top: 1px; }

  .tax-card { padding: 14px 16px; }

  .chart-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    flex-wrap: wrap; gap: 8px;
  }
  .chart-placeholder {
    display: flex; align-items: center; justify-content: center;
    height: 120px; color: var(--fg-muted); font-size: 13px;
  }
  .toggle-label { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }

  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
