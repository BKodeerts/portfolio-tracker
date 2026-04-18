<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { filterByPeriod } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import { EU_EXCHANGE_RE } from '$lib/utils/exchange';
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

  function build1DOption(): echarts.EChartsOption | null {
    const tickers = portfolioStore.currentTickers;
    if (!tickers.length || !intradayStore.loaded) return null;

    const fxRate  = intradayStore.liveEurUsd ?? 1.1;
    const isDark  = themeStore.isDark;
    const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor   = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg   = isDark ? '#1e293b' : '#ffffff';
    const tooltipBord = isDark ? '#334155' : '#e2e8f0';

    // Collect all timestamps (pre + regular + post) across tickers
    const allTsSet = new Set<number>();
    const priceMap:     Record<string, Map<number, number>> = {};
    const prevCloseMap: Record<string, number> = {};
    let sessionOpen:  number | null = null;
    let sessionClose: number | null = null;

    for (const ticker of tickers) {
      const yahoo = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      const intra = intradayStore.data[yahoo];
      if (!intra) continue;
      prevCloseMap[ticker] = intra.previousClose ?? 0;
      const pts = intra.allPoints ?? intra.points ?? [];
      priceMap[ticker] = new Map(pts.map((p) => [p.ts, p.close]));
      for (const pt of pts) allTsSet.add(pt.ts);
      if (!sessionOpen && intra.tradingPeriods?.regular?.[0]) {
        sessionOpen  = intra.tradingPeriods.regular[0].start;
        sessionClose = intra.tradingPeriods.regular[0].end ?? null;
      }
    }

    if (allTsSet.size === 0) return null;
    const sortedTs = [...allTsSet].sort((a, b) => a - b);

    // Build portfolio value using fill-forward prices
    const lastPrice: Record<string, number> = {};
    const seriesValues: number[] = [];
    for (const ts of sortedTs) {
      let total = 0;
      for (const ticker of tickers) {
        const yahoo  = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
        const shares = portfolioStore.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
        const price  = priceMap[ticker]?.get(ts);
        if (price != null) lastPrice[ticker] = price;
        const p = lastPrice[ticker] ?? 0;
        total += (shares * p) / (EU_EXCHANGE_RE.test(yahoo) ? 1 : fxRate);
      }
      seriesValues.push(Math.round(total * 100) / 100);
    }

    // Previous-close portfolio value
    let prevCloseTotal = 0;
    for (const ticker of tickers) {
      const yahoo  = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      const shares = portfolioStore.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
      prevCloseTotal += (shares * (prevCloseMap[ticker] ?? 0)) / (EU_EXCHANGE_RE.test(yahoo) ? 1 : fxRate);
    }
    prevCloseTotal = Math.round(prevCloseTotal * 100) / 100;

    const labels = sortedTs.map((ts) =>
      new Date(ts * 1000).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
    );

    const lastVal = seriesValues[seriesValues.length - 1] ?? 0;
    const isUp    = lastVal >= prevCloseTotal;
    const lineClr = isUp ? '#4ade80' : '#f87171';
    const areaClr = isUp ? 'rgba(74,222,128,' : 'rgba(248,113,113,';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markLineData: any[] = [
      {
        name: 'Vorige slotkoers',
        yAxis: prevCloseTotal,
        lineStyle: { color: isDark ? '#475569' : '#94a3b8', type: 'dashed', width: 1 },
        label: {
          formatter: () => themeStore.privacyMode ? '●●' : (prevCloseTotal >= 1000 ? `€${(prevCloseTotal / 1000).toFixed(1)}k` : `€${Math.round(prevCloseTotal)}`),
          position: 'insideEndTop', fontSize: 10, color: textColor,
        },
      },
    ];
    if (sessionOpen != null) {
      const openIdx = sortedTs.findIndex((ts) => ts >= sessionOpen!);
      if (openIdx >= 0) markLineData.push({ name: 'Open', xAxis: openIdx, lineStyle: { color: '#4ade80', type: 'dashed', width: 1, opacity: 0.6 }, label: { formatter: 'Open', fontSize: 9, color: '#4ade80' } });
    }
    if (sessionClose != null) {
      const closeIdx = sortedTs.findLastIndex((ts) => ts <= sessionClose!);
      if (closeIdx >= 0) markLineData.push({ name: 'Sluit', xAxis: closeIdx, lineStyle: { color: '#f87171', type: 'dashed', width: 1, opacity: 0.6 }, label: { formatter: 'Sluit', fontSize: 9, color: '#f87171' } });
    }

    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false },
      xAxis: {
        type: 'category', data: labels,
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
      },
      yAxis: {
        type: 'value', scale: true,
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: (v: number) => themeStore.privacyMode ? '●●' : (Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`),
        },
      },
      tooltip: {
        trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1,
        textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || !params[0]) return '';
          const val  = params[0].value as number;
          const diff = val - prevCloseTotal;
          const pct  = prevCloseTotal > 0 ? (diff / prevCloseTotal) * 100 : 0;
          const sign = diff >= 0 ? '+' : '';
          const clr  = diff >= 0 ? '#4ade80' : '#f87171';
          const valStr  = themeStore.privacyMode ? '●●●' : fmt(val);
          const diffStr = themeStore.privacyMode ? '●●' : fmt(diff);
          return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>` +
            `<div>${valStr}</div>` +
            `<div style="color:${clr}">${sign}${diffStr} (${sign}${pct.toFixed(2)}%)</div>`;
        },
      },
      series: [{
        name: 'Portefeuille',
        type: 'line',
        data: seriesValues,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: lineClr, width: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: areaClr + '0.2)' }, { offset: 1, color: areaClr + '0.02)' }] } },
        markLine: { silent: true, symbol: 'none', data: markLineData },
      }],
    };
  }

  const chartOption = $derived(period === '1d' ? build1DOption() : buildOption(filtered, view));
  const periodPlValue = $derived(period !== 'total' ? periodPl() : null);
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
      <div class="period-change" class:c-pos={(periodPlValue?.pl ?? 0) >= 0} class:c-neg={(periodPlValue?.pl ?? 0) < 0} style:visibility={periodPlValue ? 'visible' : 'hidden'}>
        {#if periodPlValue}
          <PrivacyValue value={`${periodPlValue.pl >= 0 ? '+' : ''}${fmt(periodPlValue.pl)}`} />
          <span style="opacity:0.7">{fmtPct(periodPlValue.pct)}</span>
        {:else}
          &nbsp;
        {/if}
      </div>
    </div>

    <div class="chart-wrap">
      {#if chartOption}
        <Chart option={chartOption} height="380px" />
      {:else if period === '1d'}
        <div class="chart-empty" style="height:380px">Intraday data laden…</div>
      {:else if filtered.length <= 1}
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
