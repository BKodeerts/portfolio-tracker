<script lang="ts">
  import { page } from '$app/stores';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fetchCandles } from '$lib/api/candles';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import { isExchangeOpen, normalizeMarketState, EU_EXCHANGE_RE } from '$lib/utils/exchange';
  import { periodCutoff } from '$lib/utils/period';
  import Chart from '$lib/components/Chart.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { Period } from '$lib/utils/period';
  import type { Candle, IntradayData } from '$lib/types/candle';
  import type { EChartsOption } from 'echarts';

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1d', label: '1D' }, { key: '1m', label: '1M' }, { key: '3m', label: '3M' },
    { key: '6m', label: '6M' }, { key: 'ytd', label: 'YTD' }, { key: '1y', label: '1Y' },
    { key: '2y', label: '2Y' }, { key: '3y', label: '3Y' }, { key: 'total', label: 'Max' },
  ];

  const ticker  = $derived($page.params['ticker'] ?? '');
  const meta    = $derived(portfolioStore.tickerMeta[ticker] ?? {});
  const yahoo   = $derived((meta['yahoo'] as string | undefined) ?? ticker);
  const color   = $derived(getColor(ticker));
  const pos     = $derived(portfolioStore.positions.find((p) => p.ticker === ticker));
  const latest  = $derived(portfolioStore.chartData[portfolioStore.chartData.length - 1]);

  // Derived position stats from chart data
  const val    = $derived((latest?.[ticker] as number | undefined) ?? 0);
  const cost   = $derived((latest?.[`${ticker}_cost`] as number | undefined) ?? 0);
  const pl     = $derived(val - cost);
  const plPct  = $derived(cost > 0 ? (pl / cost) * 100 : 0);
  const shares = $derived((latest?.[`${ticker}_shares`] as number | undefined) ?? pos?.shares ?? 0);
  const realPl = $derived((portfolioStore.realizedPlPerTicker[ticker]) ?? 0);
  const divInc = $derived((portfolioStore.dividendsPerTicker[ticker]) ?? 0);

  // Currency symbol
  const nativeCcy = $derived((meta['currency'] as string | undefined) ?? 'EUR');
  const ccySym    = $derived(nativeCcy === 'EUR' ? '€' : nativeCcy === 'GBP' ? '£' : nativeCcy === 'USD' ? '$' : nativeCcy);

  // Intraday data
  const iData = $derived(intradayStore.data[yahoo] as IntradayData | null | undefined);
  const pts   = $derived(iData?.points ?? []);
  const prevClose   = $derived(iData?.previousClose ?? null);
  const lastPt      = $derived(pts[pts.length - 1] ?? null);
  const currentPrice = $derived(lastPt?.close ?? prevClose ?? null);
  const dayChangePct = $derived(
    currentPrice != null && prevClose && prevClose !== 0
      ? ((currentPrice - prevClose) / prevClose) * 100
      : null,
  );
  const rawMarketState = $derived(iData?.marketState ?? (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
  const marketState    = $derived(normalizeMarketState(yahoo, rawMarketState));

  // Period + candles
  let period   = $state<Period>('1d');
  let candles  = $state<Candle[]>([]);
  let loading  = $state(false);

  $effect(() => {
    if (period === '1d') { candles = []; return; }
    const cutoff = periodCutoff(period) ?? '2000-01-01';
    loading = true;
    fetchCandles(yahoo, cutoff)
      .then((c) => { candles = c; })
      .catch(() => { candles = []; })
      .finally(() => { loading = false; });
  });

  // Chart option
  const chartOption = $derived((): EChartsOption => {
    const isDark    = themeStore.isDark;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tooltipBg   = isDark ? '#1e293b' : '#ffffff';
    const tooltipBord = isDark ? '#334155' : '#e2e8f0';

    if (period === '1d') {
      if (!pts.length || !prevClose) return {};
      // Use all points (pre + regular + post) for full picture
      const allPts = (iData?.allPoints ?? pts);
      const tradingPeriods = iData?.tradingPeriods;
      const regularStart = tradingPeriods?.regular?.[0]?.start;
      const regularEnd   = tradingPeriods?.regular?.[0]?.end;

      // Group points into pre/regular/post segments
      const labels = allPts.map((p) => new Date(p.ts * 1000).toISOString());

      const regularData = allPts.map((p) => {
        if (regularStart && regularEnd && p.ts >= regularStart && p.ts <= regularEnd) {
          return ((p.close - prevClose) / prevClose) * 100;
        }
        return null;
      });
      const extData = allPts.map((p) => {
        const inRegular = regularStart && regularEnd && p.ts >= regularStart && p.ts <= regularEnd;
        return !inRegular ? ((p.close - prevClose) / prevClose) * 100 : null;
      });

      // Prev-close reference line
      const zeroLine = allPts.map(() => 0);

      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 56 },
        xAxis: {
          type: 'category',
          data: labels,
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: {
            color: textColor, fontSize: 9,
            formatter: (v: string) => new Date(v).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
            interval: Math.floor(allPts.length / 6),
          },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1,
          textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            const time = new Date((params[0]?.axisValue ?? '') as string).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
            const pct  = (params as Array<{ value: number | null }>).find((p) => p.value != null)?.value;
            if (pct == null) return time;
            const absChange = pct / 100 * (prevClose ?? 0);
            return `${time}<br>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%<br>${themeStore.privacyMode ? '●●●' : `${ccySym}${absChange.toFixed(2)}`}`;
          },
        },
        series: [
          {
            name: 'Regulier',
            type: 'line',
            data: regularData,
            smooth: false, symbol: 'none', connectNulls: false,
            lineStyle: { color: color, width: 2 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '33' }, { offset: 1, color: color + '05' }] } },
          },
          {
            name: 'Extended',
            type: 'line',
            data: extData,
            smooth: false, symbol: 'none', connectNulls: false,
            lineStyle: { color: color + '88', width: 1.5, type: 'dashed' },
          },
          {
            name: '__zero',
            type: 'line',
            data: zeroLine,
            smooth: false, symbol: 'none',
            lineStyle: { color: isDark ? '#334155' : '#94a3b8', width: 1, type: 'dashed' },
            tooltip: { show: false },
          },
        ],
      };
    }

    // Historical candle chart
    if (!candles.length) return {};
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 64 },
      xAxis: {
        type: 'category',
        data: candles.map((c) => c.date),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: (v: number) => `${ccySym}${v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toFixed(2)}`,
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1,
        textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const p = (params as Array<{ axisValue: string; value: number }>)[0];
          if (!p) return '';
          return `${p.axisValue}<br>${ccySym}${p.value.toFixed(2)}`;
        },
      },
      series: [{
        name: ticker,
        type: 'line',
        data: candles.map((c) => c.close),
        smooth: false, symbol: 'none',
        lineStyle: { color, width: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '33' }, { offset: 1, color: color + '05' }] } },
      }],
    };
  });

  // Transactions for this ticker
  const txs = $derived(
    portfolioStore.rawTransactions
      .filter((t) => t.ticker === ticker)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  function msBadgeClass(s: string) {
    if (s === 'REGULAR') return 'badge-open';
    if (s === 'PRE' || s === 'POST') return 'badge-ext';
    return 'badge-closed';
  }
  function msBadgeLabel(s: string) {
    if (s === 'REGULAR') return 'Open';
    if (s === 'PRE')     return 'Pre';
    if (s === 'POST')    return 'Post';
    return 'Gesloten';
  }
</script>

<!-- Back navigation header (replaces layout nav for detail pages) -->
<header class="detail-header">
  <a href="/" class="back-btn">← Portfolio</a>
  <div class="sd-identity">
    <span class="color-dot" style="background:{color}"></span>
    <span class="sd-ticker">{ticker}</span>
    {#if meta['label']}
      <span class="sd-name">{meta['label'] as string}</span>
    {/if}
  </div>
  <div class="sd-price-row">
    {#if currentPrice != null}
      <span class="sd-price">
        <PrivacyValue value="{ccySym}{currentPrice.toFixed(2)}" />
      </span>
    {/if}
    {#if dayChangePct != null}
      <span class="sd-change {dayChangePct >= 0 ? 'c-pos' : 'c-neg'}">
        {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%
      </span>
    {/if}
    <span class="badge {msBadgeClass(marketState)}">{msBadgeLabel(marketState)}</span>
  </div>
</header>

<div class="page-root">
  <!-- Stats row -->
  <div class="stats-grid card">
    <div class="stat">
      <div class="stat-label">Waarde</div>
      <div class="stat-val"><PrivacyValue value={fmt(val)} /></div>
    </div>
    <div class="stat">
      <div class="stat-label">P&amp;L</div>
      <div class="stat-val {pl >= 0 ? 'c-pos' : 'c-neg'}">
        <PrivacyValue value="{pl >= 0 ? '+' : ''}{fmt(pl)}" />
      </div>
      <div class="stat-sub {pl >= 0 ? 'c-pos' : 'c-neg'}">{fmtPct(plPct)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Ingelegd</div>
      <div class="stat-val"><PrivacyValue value={fmt(cost)} /></div>
    </div>
    <div class="stat">
      <div class="stat-label">Aandelen</div>
      <div class="stat-val mono"><PrivacyValue value={String(shares)} /></div>
    </div>
    {#if pos?.avgCost}
      <div class="stat">
        <div class="stat-label">Gem. kostprijs</div>
        <div class="stat-val mono">{ccySym}{pos.avgCost.toFixed(2)}</div>
      </div>
    {/if}
    {#if realPl !== 0}
      <div class="stat">
        <div class="stat-label">Gerealiseerd</div>
        <div class="stat-val {realPl >= 0 ? 'c-pos' : 'c-neg'}">
          <PrivacyValue value="{realPl >= 0 ? '+' : ''}{fmt(realPl)}" />
        </div>
      </div>
    {/if}
    {#if divInc > 0}
      <div class="stat">
        <div class="stat-label">Dividenden</div>
        <div class="stat-val c-pos"><PrivacyValue value="+{fmt(divInc)}" /></div>
      </div>
    {/if}
    {#if (meta['high52'] as number | undefined) != null}
      <div class="stat">
        <div class="stat-label">52W Hoog</div>
        <div class="stat-val mono">{ccySym}{(meta['high52'] as number).toFixed(2)}</div>
      </div>
    {/if}
    {#if (meta['low52'] as number | undefined) != null}
      <div class="stat">
        <div class="stat-label">52W Laag</div>
        <div class="stat-val mono">{ccySym}{(meta['low52'] as number).toFixed(2)}</div>
      </div>
    {/if}
    {#if (meta['pe'] as number | undefined) != null}
      <div class="stat">
        <div class="stat-label">P/E</div>
        <div class="stat-val mono">{(meta['pe'] as number).toFixed(1)}</div>
      </div>
    {/if}
  </div>

  <!-- Chart -->
  <div class="card chart-card" style="margin-top:12px">
    <div class="chart-header">
      <div class="period-pills">
        {#each PERIODS as p}
          <button class="pill" class:on={period === p.key} onclick={() => (period = p.key)}>
            {p.label}
          </button>
        {/each}
      </div>
    </div>
    {#if loading}
      <div class="chart-placeholder">Laden…</div>
    {:else if period === '1d' && pts.length > 1}
      <Chart option={chartOption()} height="280px" />
    {:else if period !== '1d' && candles.length > 1}
      <Chart option={chartOption()} height="280px" />
    {:else}
      <div class="chart-placeholder">Geen data voor deze periode</div>
    {/if}
  </div>

  <!-- Transactions -->
  {#if txs.length > 0}
    <div class="card" style="margin-top:12px;overflow-x:auto">
      <div class="card-title" style="padding:10px 14px;border-bottom:1px solid var(--border)">Transacties</div>
      <table class="tx-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Type</th>
            <th class="right">Aandelen</th>
            <th class="right">Kosten €</th>
            <th class="right desktop-only">Prijs</th>
          </tr>
        </thead>
        <tbody>
          {#each txs as tx}
            {@const isDividend = tx.shares === 0}
            {@const isSale     = !isDividend && tx.shares < 0}
            {@const price      = !isDividend && tx.shares !== 0 ? Math.abs(tx.costEur / tx.shares) : null}
            <tr>
              <td class="mono">{tx.date}</td>
              <td class="{isDividend ? 'c-div' : isSale ? 'c-neg' : 'c-pos'}">
                {isDividend ? 'Dividend' : isSale ? 'Verkoop' : 'Koop'}
              </td>
              <td class="right mono">
                {isDividend ? '—' : Math.abs(tx.shares).toLocaleString('nl-BE', { maximumFractionDigits: 4 })}
              </td>
              <td class="right mono"><PrivacyValue value={fmt(Math.abs(tx.costEur))} /></td>
              <td class="right mono desktop-only">
                {price != null ? `${ccySym}${price.toFixed(2)}` : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .detail-header {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px;
    background: var(--bg-solid, var(--card-bg));
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .back-btn { text-decoration: none; color: var(--fg-muted); font-size: 13px; white-space: nowrap; }
  .back-btn:hover { color: var(--fg); }

  .sd-identity { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; }
  .color-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .sd-ticker { font-size: 15px; font-weight: 700; }
  .sd-name { font-size: 12px; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .sd-price-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sd-price { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; }
  .sd-change { font-family: 'JetBrains Mono', monospace; font-size: 13px; }

  .badge {
    font-size: 9px; font-weight: 600; letter-spacing: 0.05em;
    padding: 2px 5px; border-radius: 3px; text-transform: uppercase; white-space: nowrap;
  }
  .badge-open   { background: rgba(74,222,128,0.15); color: #4ade80; }
  .badge-ext    { background: rgba(251,191,36,0.15);  color: #fbbf24; }
  .badge-closed { background: rgba(100,116,139,0.15); color: #64748b; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    overflow: hidden;
  }
  .stat {
    padding: 12px 14px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted); margin-bottom: 3px; }
  .stat-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }
  .stat-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-top: 1px; }

  .chart-header {
    padding: 10px 14px; border-bottom: 1px solid var(--border);
  }
  .chart-placeholder {
    display: flex; align-items: center; justify-content: center;
    height: 120px; color: var(--fg-muted); font-size: 13px;
  }

  .tx-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tx-table th {
    padding: 7px 12px; font-size: 11px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
    text-align: left;
  }
  .tx-table th.right, .tx-table td.right { text-align: right; }
  .tx-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .tx-table tbody tr:last-child td { border-bottom: none; }
  .tx-table tbody tr:hover { background: var(--hover-bg, rgba(0,0,0,0.03)); }

  .c-div { color: #f59e0b; }
  .mono { font-family: 'JetBrains Mono', monospace; }

  @media (max-width: 640px) {
    .desktop-only { display: none !important; }
  }
</style>
