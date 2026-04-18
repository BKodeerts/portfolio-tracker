<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { filterByPeriod } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import type { Period } from '$lib/utils/period';
  import type { ChartPoint } from '$lib/types/portfolio';

  type View = 'total' | 'individual' | 'pct' | 'pl';

  let period = $state<Period>('total');
  let view   = $state<View>('total');

  const visibleTickers = $derived(portfolioStore.currentTickers);

  const filtered = $derived(
    period === '1d'
      ? portfolioStore.chartData
      : filterByPeriod(portfolioStore.chartData, period),
  );

  const periodPl = $derived(() => {
    if (filtered.length < 2) return null;
    const first = filtered[0]!;
    const last  = filtered[filtered.length - 1]!;
    const fv = (first.value as number) ?? 0;
    const lv = (last.value  as number) ?? 0;
    const fi = (first.invested as number) ?? 0;
    const li = (last.invested  as number) ?? 0;
    return { pl: (lv - li) - (fv - fi), pct: fi > 0 ? ((lv - li) / fi - (fv - fi) / fi) * 100 : 0 };
  });

  // ── ECharts option builder ──────────────────────────────────────────────────
  import type * as echarts from 'echarts';

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1d',    label: '1D' },
    { key: '1m',    label: '1M' },
    { key: '3m',    label: '3M' },
    { key: '6m',    label: '6M' },
    { key: 'ytd',   label: 'YTD' },
    { key: '1y',    label: '1Y' },
    { key: '2y',    label: '2Y' },
    { key: '3y',    label: '3Y' },
    { key: 'total', label: 'Max' },
  ];

  const VIEWS: { key: View; label: string }[] = [
    { key: 'total',      label: 'Totaal' },
    { key: 'individual', label: 'Per positie' },
    { key: 'pct',        label: 'Rendement %' },
    { key: 'pl',         label: 'Winst €' },
  ];

  function buildOption(data: ChartPoint[], v: View): echarts.EChartsOption {
    const isDark = themeStore.isDark;
    const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor   = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg   = isDark ? '#1e293b' : '#ffffff';
    const tooltipBord = isDark ? '#334155' : '#e2e8f0';

    if (v === 'total') {
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.date as string),
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v: number) => {
              if (themeStore.privacyMode) return '●●';
              return Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`;
            },
          },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBord,
          borderWidth: 1,
          textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            if (!Array.isArray(params) || !params[0]) return '';
            const date = new Date(params[0].axisValue as string).toLocaleDateString('nl-BE', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            const lines = (params as Array<{ seriesName: string; marker: string; value: number }>)
              .filter((p) => p.seriesName !== '__cost')
              .map((p) => `<div>${p.marker}${p.seriesName}: ${themeStore.privacyMode ? '●●●' : fmt(p.value)}</div>`);
            return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines.join('')}`;
          },
        },
        series: [
          {
            name: 'Portefeuille',
            type: 'line',
            data: data.map((d) => d.value as number),
            smooth: false,
            symbol: 'none',
            lineStyle: { color: '#818cf8', width: 2 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.2)' }, { offset: 1, color: 'rgba(99,102,241,0.01)' }] } },
          },
          {
            name: '__cost',
            type: 'line',
            data: data.map((d) => d.invested as number),
            smooth: false,
            symbol: 'none',
            lineStyle: { color: isDark ? '#334155' : '#94a3b8', width: 1, type: 'dashed' },
            areaStyle: { color: isDark ? 'rgba(51,65,85,0.15)' : 'rgba(148,163,184,0.1)' },
          },
        ],
      };
    }

    if (v === 'individual') {
      const tickers = [...visibleTickers].reverse();
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.date as string),
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
        tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' } },
        series: tickers.map((t) => ({
          name: t,
          type: 'line' as const,
          stack: 'total',
          data: data.map((d) => (d[t] as number | undefined) ?? 0),
          smooth: false,
          symbol: 'none',
          lineStyle: { color: getColor(t), width: 1.5 },
          areaStyle: { color: getColor(t) + '28' },
        })),
      };
    }

    if (v === 'pct') {
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.date as string),
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => `${+v.toFixed(1)}%` },
        },
        tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' } },
        series: visibleTickers.map((t) => ({
          name: t,
          type: 'line' as const,
          data: data.map((d) => {
            const raw = d[`${t}_pct`];
            return raw != null ? +(raw as number) : null;
          }),
          smooth: false,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { color: getColor(t), width: 2 },
        })),
      };
    }

    // pl view
    const tickers2 = [...visibleTickers].reverse();
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.date as string),
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
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' } },
      series: tickers2.map((t) => ({
        name: t,
        type: 'line' as const,
        stack: 'total',
        data: data.map((d) => {
          const val  = d[t] as number | undefined;
          const cost = d[`${t}_cost`] as number | undefined;
          return val != null && cost != null ? val - cost : null;
        }),
        smooth: false,
        symbol: 'none',
        connectNulls: true,
        lineStyle: { color: getColor(t), width: 1.5 },
        areaStyle: { color: getColor(t) + '28' },
      })),
    };
  }

  const chartOption = $derived(buildOption(filtered, view));
</script>

<div class="page-root">
  <!-- Chart card -->
  <div class="chart-card">
    <div class="chart-header">
      <!-- View toggle (desktop) -->
      <div class="seg desktop-only">
        {#each VIEWS as v}
          <button class="seg-btn" class:on={view === v.key} onclick={() => (view = v.key)}>
            {v.label}
          </button>
        {/each}
      </div>

      <!-- Period pills (desktop) -->
      <div class="period-pills desktop-only">
        {#each PERIODS as p}
          <button class="pill" class:on={period === p.key} onclick={() => (period = p.key)}>
            {p.label}
          </button>
        {/each}
      </div>

      <!-- Mobile selects -->
      <div class="chart-controls-mobile">
        <select class="mobile-select" onchange={(e) => (view = (e.target as HTMLSelectElement).value as View)}>
          {#each VIEWS as v}
            <option value={v.key} selected={view === v.key}>{v.label}</option>
          {/each}
        </select>
        <select class="mobile-select" onchange={(e) => (period = (e.target as HTMLSelectElement).value as Period)}>
          {#each PERIODS as p}
            <option value={p.key} selected={period === p.key}>{p.label}</option>
          {/each}
        </select>
      </div>

      <!-- Period P&L badge -->
      {#if period !== 'total' && periodPl()}
        {@const pp = periodPl()!}
        <div class="period-change" class:c-pos={pp.pl >= 0} class:c-neg={pp.pl < 0}>
          <PrivacyValue value={`${pp.pl >= 0 ? '+' : ''}${fmt(pp.pl)}`} />
          <span style="opacity:0.7">{fmtPct(pp.pct)}</span>
        </div>
      {/if}
    </div>

    <div class="chart-wrap">
      {#if filtered.length > 1}
        <Chart option={chartOption} height="380px" />
      {:else}
        <div class="chart-empty" style="height:380px">Niet genoeg data voor deze periode</div>
      {/if}
    </div>

    <!-- Legend -->
    {#if view !== 'total'}
      <div class="legend">
        {#each visibleTickers as t}
          <a class="legend-item" href="/stock/{t}">
            <span class="legend-dot" style="background:{getColor(t)}"></span>
            {t}
          </a>
        {/each}
      </div>
    {:else}
      <div class="legend">
        <div class="legend-item">
          <span class="legend-line" style="background:#818cf8"></span>
          Portefeuille
        </div>
        {#if period !== '1d'}
          <div class="legend-item">
            <span class="legend-line dashed" style="background:var(--fg-muted)"></span>
            Kostprijs
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Positions table -->
  {#if portfolioStore.positions.length > 0}
    <div class="card" style="margin-top:16px;overflow-x:auto">
      <table class="pos-table">
        <thead>
          <tr>
            <th onclick={() => portfolioStore.sortPositions('ticker')} class="sortable">
              Ticker {portfolioStore.posSort.col === 'ticker' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('value')} class="sortable right">
              Waarde {portfolioStore.posSort.col === 'value' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('pl')} class="sortable right desktop-only">
              P&amp;L {portfolioStore.posSort.col === 'pl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('plPct')} class="sortable right">
              % {portfolioStore.posSort.col === 'plPct' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('dayPl')} class="sortable right desktop-only">
              Vandaag {portfolioStore.posSort.col === 'dayPl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('cost')} class="sortable right desktop-only">
              Ingelegd {portfolioStore.posSort.col === 'cost' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each portfolioStore.sortedPositions as pos}
            <tr onclick={() => (window.location.href = `/stock/${pos.ticker}`)} style="cursor:pointer">
              <td>
                <span class="ticker-dot" style="background:{getColor(pos.ticker)}"></span>
                <span class="ticker-name">{pos.ticker}</span>
                {#if pos.label && pos.label !== pos.ticker}
                  <span class="ticker-label desktop-only">{pos.label}</span>
                {/if}
              </td>
              <td class="right mono">
                <PrivacyValue value={fmt(pos.value)} />
              </td>
              <td class="right mono desktop-only {pos.pl >= 0 ? 'c-pos' : 'c-neg'}">
                <PrivacyValue value={`${pos.pl >= 0 ? '+' : ''}${fmt(pos.pl)}`} />
              </td>
              <td class="right mono {pos.plPct >= 0 ? 'c-pos' : 'c-neg'}">
                {fmtPct(pos.plPct)}
              </td>
              <td class="right mono desktop-only {(pos.dayPl ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
                {#if pos.dayPl != null}
                  <PrivacyValue value={`${pos.dayPl >= 0 ? '+' : ''}${fmt(pos.dayPl)}`} />
                {:else}
                  <span class="c-muted">—</span>
                {/if}
              </td>
              <td class="right mono desktop-only">
                <PrivacyValue value={fmt(pos.costEur)} />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="footer">
    Actief: {portfolioStore.currentTickers.join(', ')} · Geen financieel advies · Zelf gehosted
  </div>
</div>

<style>
  .chart-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .chart-wrap { position: relative; }
  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--fg-muted);
    font-size: 13px;
  }

  .period-change {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    display: flex;
    gap: 5px;
    align-items: center;
    white-space: nowrap;
    margin-left: auto;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fg-muted);
    text-decoration: none;
    cursor: pointer;
  }
  .legend-item:hover { color: var(--fg); }
  .legend-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-line {
    width: 16px; height: 2px;
    border-radius: 1px;
    flex-shrink: 0;
  }
  .legend-line.dashed {
    background: none !important;
    border-top: 2px dashed var(--fg-muted);
    height: 0;
    margin-top: 1px;
  }

  .pos-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .pos-table th {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .pos-table th.sortable { cursor: pointer; user-select: none; }
  .pos-table th.sortable:hover { color: var(--fg); }
  .pos-table th.right, .pos-table td.right { text-align: right; }
  .pos-table tbody tr:hover { background: var(--hover-bg, rgba(0,0,0,0.03)); }
  .pos-table td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .pos-table tbody tr:last-child td { border-bottom: none; }
  .ticker-dot {
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
  }
  .ticker-label {
    color: var(--fg-muted);
    font-size: 11px;
    margin-left: 4px;
  }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }

  .footer {
    margin-top: 24px;
    padding: 12px 0;
    text-align: center;
    font-size: 11px;
    color: var(--fg-muted);
  }

  @media (max-width: 640px) {
    .desktop-only { display: none !important; }
    .chart-controls-mobile { display: flex !important; }
  }
  .chart-controls-mobile { display: none; }
</style>
