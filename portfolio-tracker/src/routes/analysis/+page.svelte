<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fmt, fmtPct, fmtNum } from '$lib/utils/fmt';
  import { filterByPeriod } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import Chart from '$lib/components/Chart.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { Period } from '$lib/utils/period';
  import type { EChartsOption } from 'echarts';

  type BenchmarkToggle = 'vwce' | 'sp500' | 'both';

  let analysePeriod = $state<Period>('total');

  const SECTOR_COLORS  = ['#818cf8','#34d399','#fbbf24','#f87171','#60a5fa','#a78bfa','#fb923c','#4ade80','#38bdf8','#f472b6'];
  const PALETTE        = ['#fbbf24','#818cf8','#34d399','#f87171','#60a5fa','#a78bfa','#fb923c','#4ade80','#f472b6','#22d3ee'];

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1m', label: '1M' }, { key: '3m', label: '3M' }, { key: '6m', label: '6M' },
    { key: 'ytd', label: 'YTD' }, { key: '1y', label: '1Y' }, { key: '2y', label: '2Y' },
    { key: '3y', label: '3Y' }, { key: 'total', label: 'Max' },
  ];

  const latest = $derived(portfolioStore.chartData[portfolioStore.chartData.length - 1]);

  // ── Donut helpers ────────────────────────────────────────────────────────────

  function donutOption(labels: string[], values: number[], colors: string[]): EChartsOption {
    const total = values.reduce((a, b) => a + b, 0);
    const isDark = themeStore.isDark;
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'pie',
        radius: ['58%', '80%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { scale: false },
        data: labels.map((l, i) => ({ name: l, value: values[i]!, itemStyle: { color: colors[i % colors.length]! } })),
      }],
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
        formatter: (p: any) =>
          `${p.name}: ${themeStore.privacyMode ? '●●●' : fmt(p.value)} (${total > 0 ? (p.value / total * 100).toFixed(1) : 0}%)`,
      },
    };
  }

  // Allocation donut
  const allocationLabels = $derived(
    portfolioStore.currentTickers.sort((a, b) =>
      ((latest?.[b] as number) ?? 0) - ((latest?.[a] as number) ?? 0),
    ),
  );
  const allocationValues = $derived(allocationLabels.map((t) => (latest?.[t] as number | undefined) ?? 0));
  const allocationColors = $derived(allocationLabels.map((t) => getColor(t)));
  const allocationOption = $derived(donutOption(allocationLabels, allocationValues, allocationColors));

  // Sector donut
  const sectorData = $derived(() => {
    if (!latest) return { labels: [], values: [], colors: [] };
    const map: Record<string, number> = {};
    for (const t of portfolioStore.currentTickers) {
      const sector = (portfolioStore.tickerMeta[t]?.['sector'] as string | undefined) ?? 'Overig';
      map[sector] = (map[sector] ?? 0) + ((latest[t] as number | undefined) ?? 0);
    }
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([s]) => s),
      values: sorted.map(([, v]) => v),
      colors: sorted.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length]!),
    };
  });
  const sectorOption = $derived(donutOption(sectorData().labels, sectorData().values, sectorData().colors));

  // Geography donut
  const geoData = $derived(() => {
    if (!latest) return { labels: [], values: [], colors: [] };
    const map: Record<string, number> = {};
    for (const t of portfolioStore.currentTickers) {
      const geo = (portfolioStore.tickerMeta[t]?.['geo'] as string | undefined) ?? 'Overig';
      map[geo] = (map[geo] ?? 0) + ((latest[t] as number | undefined) ?? 0);
    }
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([g]) => g),
      values: sorted.map(([, v]) => v),
      colors: sorted.map((_, i) => PALETTE[i % PALETTE.length]!),
    };
  });
  const geoOption = $derived(donutOption(geoData().labels, geoData().values, geoData().colors));

  // Currency donut
  const currencyData = $derived(() => {
    const exp = portfolioStore.currencyExposure;
    if (Object.keys(exp).length === 0) {
      const usd = portfolioStore.usdExposurePct ?? 0;
      return { labels: ['USD', 'EUR'], values: [usd, 100 - usd], colors: [PALETTE[0]!, PALETTE[1]!] };
    }
    const sorted = Object.entries(exp).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([c]) => c),
      values: sorted.map(([, v]) => v),
      colors: sorted.map((_, i) => PALETTE[i % PALETTE.length]!),
    };
  });
  const currencyOption = $derived(donutOption(currencyData().labels, currencyData().values, currencyData().colors));

  // ── Bar chart ────────────────────────────────────────────────────────────────

  const barOption = $derived((): EChartsOption => {
    if (!latest) return {};
    const tickers = [...portfolioStore.currentTickers].sort((a, b) =>
      ((latest[b] as number | undefined) ?? 0) - ((latest[a] as number | undefined) ?? 0),
    );
    const isDark = themeStore.isDark;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    return {
      backgroundColor: 'transparent',
      grid: { top: 8, right: 16, bottom: 8, left: 16, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: (v: number) => themeStore.privacyMode ? '●●' : `€${Math.round(v / 1000)}k`,
        },
      },
      yAxis: {
        type: 'category',
        data: tickers,
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { show: false },
      },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (params as any[]).map((p: any) => `${p.marker}${p.seriesName}: ${themeStore.privacyMode ? '●●●' : fmt(p.value)}`).join('<br>'),
      },
      series: [
        {
          name: 'Geïnvesteerd',
          type: 'bar',
          data: tickers.map((t) => (latest[`${t}_cost`] as number | undefined) ?? 0),
          itemStyle: { color: isDark ? 'rgba(71,85,105,0.6)' : 'rgba(148,163,184,0.5)', borderRadius: [0, 3, 3, 0] },
        },
        {
          name: 'Huidig',
          type: 'bar',
          data: tickers.map((t) => (latest[t] as number | undefined) ?? 0),
          itemStyle: {
            color: (p: { dataIndex: number }) => getColor(tickers[p.dataIndex]!) + 'CC',
            borderRadius: [0, 3, 3, 0],
          },
        },
      ],
    };
  });

  // ── Benchmark chart ──────────────────────────────────────────────────────────

  const benchmarkOption = $derived((): EChartsOption => {
    const filtered = filterByPeriod(portfolioStore.chartData, analysePeriod);
    if (filtered.length < 2) return {};

    const vwceMap  = Object.fromEntries(portfolioStore.benchmarkData.map((b) => [b.date, b.value]));
    const sp500Map = Object.fromEntries(portfolioStore.sp500Data.map((b) => [b.date, b.value]));
    const ab = portfolioStore.activeBenchmark;

    const first = filtered[0]!;
    const startDate   = first.date;
    const startCost   = (first.invested as number | undefined) ?? 1;
    const startTotal  = (first.value as number | undefined) ?? 0;
    const baseReturn  = startCost > 0 ? startTotal / startCost : 1;

    const vwceBase  = vwceMap[startDate] ?? null;
    const sp500Base = sp500Map[startDate] ?? null;

    const portfolioPoints: [string, number][] = [[startDate, 0]];
    const vwcePoints: [string, number | null][] = [[startDate, 0]];
    const sp500Points: [string, number | null][] = [[startDate, 0]];

    for (let i = 1; i < filtered.length; i++) {
      const row  = filtered[i]!;
      const cost = (row.invested as number | undefined) ?? 0;
      const absReturn = cost > 0 ? (row.value as number) / cost : baseReturn;
      portfolioPoints.push([row.date, +((absReturn / baseReturn - 1) * 100).toFixed(2)]);

      const vwce = vwceMap[row.date];
      vwcePoints.push([row.date, vwce != null && vwceBase ? +((vwce / vwceBase - 1) * 100).toFixed(2) : null]);

      const sp  = sp500Map[row.date];
      sp500Points.push([row.date, sp != null && sp500Base ? +((sp / sp500Base - 1) * 100).toFixed(2) : null]);
    }

    const isDark    = themeStore.isDark;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    const series: EChartsOption['series'] = [
      {
        name: 'Portefeuille',
        type: 'line',
        data: portfolioPoints.map(([, v]) => v),
        smooth: false, symbol: 'none', connectNulls: true,
        lineStyle: { color: '#818cf8', width: 2 },
      },
    ];

    if (ab === 'vwce' || ab === 'both') {
      series.push({
        name: 'VWCE',
        type: 'line',
        data: vwcePoints.map(([, v]) => v),
        smooth: false, symbol: 'none', connectNulls: true,
        lineStyle: { color: '#34d399', width: 1.5, type: 'dashed' },
      });
    }
    if (ab === 'sp500' || ab === 'both') {
      series.push({
        name: 'S&P 500',
        type: 'line',
        data: sp500Points.map(([, v]) => v),
        smooth: false, symbol: 'none', connectNulls: true,
        lineStyle: { color: '#fbbf24', width: 1.5, type: 'dashed' },
      });
    }

    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: {
        type: 'category',
        data: portfolioPoints.map(([d]) => d),
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
        textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
      },
      series,
    };
  });

  // ── Annual P&L bar chart ────────────────────────────────────────────────────

  const annualOption = $derived((): EChartsOption => {
    if (!portfolioStore.annualPl.length) return {};
    const isDark    = themeStore.isDark;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 64 },
      xAxis: {
        type: 'category',
        data: portfolioStore.annualPl.map((a) => String(a.year)),
        axisLabel: { color: textColor, fontSize: 10 },
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: (v: number) => themeStore.privacyMode ? '●●' : (Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(0)}k` : `€${Math.round(v)}`),
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' },
        formatter: (p: any) =>
          `${p.name}: ${themeStore.privacyMode ? '●●●' : fmt(p.value)}`,
      },
      series: [{
        type: 'bar',
        data: portfolioStore.annualPl.map((a) => ({
          value: a.pl,
          itemStyle: { color: a.pl >= 0 ? '#4ade80' : '#f87171', borderRadius: a.pl >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] },
        })),
      }],
    };
  });
</script>

<div class="page-root">
  <!-- Benchmark period pills -->
  <div class="section-header">
    <h2 class="section-title">Analyse</h2>
    <div class="period-pills">
      {#each PERIODS as p}
        <button class="pill" class:on={analysePeriod === p.key} onclick={() => (analysePeriod = p.key)}>
          {p.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Donut grid -->
  <div class="donut-grid">
    <!-- Allocation -->
    <div class="card donut-card">
      <div class="card-title">Allocatie</div>
      <div class="donut-wrap">
        <Chart option={allocationOption} height="160px" />
      </div>
      <div class="donut-legend">
        {#each allocationLabels as t, i}
          {@const total = allocationValues.reduce((a, b) => a + b, 0)}
          <div class="donut-legend-item">
            <span class="donut-dot" style="background:{allocationColors[i]}"></span>
            <span class="donut-ticker">{t}</span>
            <span class="donut-pct">{total > 0 ? ((allocationValues[i]! / total) * 100).toFixed(1) : 0}%</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Sector -->
    <div class="card donut-card">
      <div class="card-title">Sector</div>
      <div class="donut-wrap">
        <Chart option={sectorOption} height="160px" />
      </div>
      <div class="donut-legend">
        {#each sectorData().labels as s, i}
          {@const total = sectorData().values.reduce((a, b) => a + b, 0)}
          <div class="donut-legend-item">
            <span class="donut-dot" style="background:{sectorData().colors[i]}"></span>
            <span class="donut-ticker">{s}</span>
            <span class="donut-pct">{total > 0 ? ((sectorData().values[i]! / total) * 100).toFixed(1) : 0}%</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Geography -->
    <div class="card donut-card">
      <div class="card-title">Geografie</div>
      <div class="donut-wrap">
        <Chart option={geoOption} height="160px" />
      </div>
      <div class="donut-legend">
        {#each geoData().labels as g, i}
          {@const total = geoData().values.reduce((a, b) => a + b, 0)}
          <div class="donut-legend-item">
            <span class="donut-dot" style="background:{geoData().colors[i]}"></span>
            <span class="donut-ticker">{g}</span>
            <span class="donut-pct">{total > 0 ? ((geoData().values[i]! / total) * 100).toFixed(1) : 0}%</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Currency -->
    <div class="card donut-card">
      <div class="card-title">Valuta</div>
      <div class="donut-wrap">
        <Chart option={currencyOption} height="160px" />
      </div>
      <div class="donut-legend">
        {#each currencyData().labels as c, i}
          <div class="donut-legend-item">
            <span class="donut-dot" style="background:{currencyData().colors[i]}"></span>
            <span class="donut-ticker">{c}</span>
            <span class="donut-pct">{currencyData().values[i]!.toFixed(1)}%</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Bar chart: cost vs value -->
  {#if latest}
    <div class="card chart-card" style="margin-top:16px">
      <div class="card-title" style="padding:12px 16px">Geïnvesteerd vs. huidig</div>
      <Chart option={barOption()} height="280px" />
    </div>
  {/if}

  <!-- Benchmark chart -->
  <div class="card chart-card" style="margin-top:16px">
    <div class="chart-header">
      <span class="card-title">Benchmark</span>
      <div class="seg">
        <button class="seg-btn" class:on={portfolioStore.activeBenchmark === 'vwce'} onclick={() => (portfolioStore.activeBenchmark = 'vwce')}>VWCE</button>
        <button class="seg-btn" class:on={portfolioStore.activeBenchmark === 'sp500'} onclick={() => (portfolioStore.activeBenchmark = 'sp500')}>S&P 500</button>
        <button class="seg-btn" class:on={portfolioStore.activeBenchmark === 'both'} onclick={() => (portfolioStore.activeBenchmark = 'both')}>Beide</button>
      </div>
    </div>
    <Chart option={benchmarkOption()} height="260px" />
    <div class="legend" style="padding:10px 16px;border-top:1px solid var(--border)">
      <div class="legend-item"><span class="legend-line" style="background:#818cf8"></span>Portefeuille</div>
      {#if portfolioStore.activeBenchmark === 'vwce' || portfolioStore.activeBenchmark === 'both'}
        <div class="legend-item"><span class="legend-line dashed" style="border-color:#34d399"></span>VWCE</div>
      {/if}
      {#if portfolioStore.activeBenchmark === 'sp500' || portfolioStore.activeBenchmark === 'both'}
        <div class="legend-item"><span class="legend-line dashed" style="border-color:#fbbf24"></span>S&P 500</div>
      {/if}
    </div>
  </div>

  <!-- Risk metrics -->
  {#if portfolioStore.riskMetrics}
    {@const rm = portfolioStore.riskMetrics}
    <div class="card" style="margin-top:16px;padding:16px">
      <div class="card-title" style="margin-bottom:12px">Risico</div>
      <div class="metrics-grid">
        <div class="metric-item">
          <div class="metric-label">Sharpe</div>
          <div class="metric-value">{rm.sharpe != null ? fmtNum(rm.sharpe) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Sortino</div>
          <div class="metric-value">{rm.sortino != null ? fmtNum(rm.sortino) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Max Drawdown</div>
          <div class="metric-value {(rm.maxDrawdown ?? 0) < 0 ? 'c-neg' : ''}">{rm.maxDrawdown != null ? fmtPct(rm.maxDrawdown) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Volatiliteit</div>
          <div class="metric-value">{rm.volatility != null ? fmtPct(rm.volatility) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Beta</div>
          <div class="metric-value">{rm.beta != null ? fmtNum(rm.beta) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Calmar</div>
          <div class="metric-value">{rm.calmar != null ? fmtNum(rm.calmar) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">IRR</div>
          <div class="metric-value {(portfolioStore.irrPct ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">{portfolioStore.irrPct != null ? fmtPct(portfolioStore.irrPct) : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Gerealiseerd</div>
          <div class="metric-value {portfolioStore.realizedPl >= 0 ? 'c-pos' : 'c-neg'}">
            <PrivacyValue value={`${portfolioStore.realizedPl >= 0 ? '+' : ''}${fmt(portfolioStore.realizedPl)}`} />
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Rolling returns -->
  {#if portfolioStore.rollingReturns.length > 0}
    <div class="card" style="margin-top:16px;overflow-x:auto">
      <div class="card-title" style="padding:12px 16px">Rolling returns</div>
      <table class="pos-table">
        <thead>
          <tr>
            <th>Periode</th>
            <th class="right">Portefeuille</th>
            <th class="right">VWCE</th>
            <th class="right">S&P 500</th>
          </tr>
        </thead>
        <tbody>
          {#each portfolioStore.rollingReturns as r}
            <tr>
              <td>{r.period}</td>
              <td class="right mono {(r.portfolio ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">{r.portfolio != null ? fmtPct(r.portfolio) : '—'}</td>
              <td class="right mono">{r.benchmark != null ? fmtPct(r.benchmark) : '—'}</td>
              <td class="right mono">{r.sp500 != null ? fmtPct(r.sp500) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Annual P&L -->
  {#if portfolioStore.annualPl.length > 0}
    <div class="card chart-card" style="margin-top:16px">
      <div class="card-title" style="padding:12px 16px">Jaarlijks resultaat</div>
      <Chart option={annualOption()} height="200px" />
    </div>
  {/if}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .section-title { font-size: 15px; font-weight: 600; margin: 0; }

  .donut-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .donut-card { padding: 12px 16px; }
  .donut-wrap { height: 160px; }
  .donut-legend { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; }
  .donut-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .donut-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .donut-ticker { flex: 1; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .donut-pct { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--fg); }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
  }
  .metric-item { display: flex; flex-direction: column; gap: 2px; }
  .metric-label { font-size: 11px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .metric-value { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }

  .legend { display: flex; flex-wrap: wrap; gap: 10px 16px; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg-muted); }
  .legend-line { width: 16px; height: 2px; border-radius: 1px; flex-shrink: 0; }
  .legend-line.dashed { background: none !important; border-top: 2px dashed; height: 0; margin-top: 1px; }

  .pos-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pos-table th {
    padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
  }
  .pos-table th.right, .pos-table td.right { text-align: right; }
  .pos-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .pos-table tbody tr:last-child td { border-bottom: none; }
  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
