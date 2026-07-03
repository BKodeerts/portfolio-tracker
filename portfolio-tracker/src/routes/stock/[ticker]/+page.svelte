<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fetchCandles } from '$lib/api/candles';
  import { fmt } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import { isExchangeOpen, normalizeMarketState, sessionBounds } from '$lib/market';
  import { periodCutoff } from '$lib/utils/period';
  import Chart from '$lib/components/Chart.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { Period } from '$lib/utils/period';
  import type { Candle, IntradayData } from '$lib/types/candle';
  import type { EChartsOption } from 'echarts';

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1m', label: '1M' }, { key: '3m', label: '3M' }, { key: '6m', label: '6M' },
    { key: 'ytd', label: 'YTD' }, { key: '1y', label: '1J' }, { key: 'total', label: 'Max' },
  ];

  const ticker  = $derived(page.params['ticker'] ?? '');
  const meta    = $derived(portfolioStore.tickerMeta[ticker] ?? {});
  const yahoo   = $derived(meta.yahoo ?? ticker);
  const color   = $derived(getColor(ticker));
  const pos     = $derived(portfolioStore.positions.find((p) => p.ticker === ticker));
  const latest  = $derived(portfolioStore.chartData[portfolioStore.chartData.length - 1]);

  // Derived position stats from chart data
  const slice  = $derived(latest?.positions[ticker]);
  const val    = $derived(slice?.value ?? 0);
  const cost   = $derived(slice?.cost ?? 0);
  const pl     = $derived(val - cost);
  const plPct  = $derived(cost > 0 ? (pl / cost) * 100 : 0);
  const shares = $derived(slice?.shares ?? pos?.shares ?? 0);

  // Currency symbol
  const nativeCcy = $derived(meta.currency ?? 'EUR');
  const ccySym    = $derived(nativeCcy === 'EUR' ? '€' : nativeCcy === 'GBP' ? '£' : nativeCcy === 'USD' ? '$' : nativeCcy);

  // Intraday data
  const iData = $derived(intradayStore.data[yahoo] as IntradayData | null | undefined);
  // `points` is regular-session only (server-side filtered). `allPoints` spans
  // pre + regular + post for the most recent trading day.
  const pts   = $derived(iData?.points ?? []);
  const allPts = $derived(iData?.allPoints ?? pts);
  const prevClose   = $derived(iData?.previousClose ?? null);
  // Absolute-latest tick (may be post-market) → header price
  const lastAllPt   = $derived(allPts[allPts.length - 1] ?? null);
  const currentPrice = $derived(lastAllPt?.close ?? prevClose ?? null);
  // Last regular-session tick → reference point for regular vs extended split
  const lastRegularClose = $derived(pts[pts.length - 1]?.close ?? null);

  const rawMarketState = $derived(iData?.marketState ?? (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
  const marketState    = $derived(normalizeMarketState(yahoo, rawMarketState));

  // Regular-session move (market open → close). Always versus prevClose.
  const regularChangePct = $derived(
    lastRegularClose != null && prevClose && prevClose !== 0
      ? ((lastRegularClose - prevClose) / prevClose) * 100
      : null,
  );
  // Extended-hours move relative to last regular close (shown only in PRE/POST).
  const extChangePct = $derived(
    currentPrice != null && lastRegularClose && lastRegularClose !== 0 && marketState !== 'REGULAR'
      ? ((currentPrice - lastRegularClose) / lastRegularClose) * 100
      : null,
  );
  // Combined day change (fallback when we can't split, or during REGULAR).
  const dayChangePct = $derived(
    currentPrice != null && prevClose && prevClose !== 0
      ? ((currentPrice - prevClose) / prevClose) * 100
      : null,
  );

  // Derive native-currency avg cost using current implicit FX rate (value/shares/currentPrice)
  const priceEur      = $derived(shares > 0 && currentPrice != null && currentPrice > 0 ? val / shares : null);
  const impliedFx     = $derived(priceEur && priceEur > 0 && currentPrice != null ? currentPrice / priceEur : null);
  const avgCostNative = $derived(pos?.avgCost != null && impliedFx != null ? pos.avgCost * impliedFx : null);

  // Period + candles
  let period   = $state<Period>('3m');
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
      if (!allPts.length || !prevClose) return {};
      // Use `pts` (server-computed regular-only points) to identify the actual
      // session boundaries. tradingPeriods.regular points to the NEXT session
      // when the market is closed, so we can't trust it for segmentation.
      const regOpenTs  = pts[0]?.ts    ?? null;
      const regCloseTs = pts[pts.length - 1]?.ts ?? null;

      // Pad the timestamp grid to cover the full trading session so the x-axis
      // always spans the whole day (same behaviour as the dashboard 1D chart).
      const tsSet = new Set<number>(allPts.map((p) => p.ts));
      const sessionDate = iData?.date ?? null;
      const bounds = sessionDate ? sessionBounds(yahoo, sessionDate) : null;
      if (bounds) {
        for (let ts = bounds.open; ts <= bounds.close; ts += 300) tsSet.add(ts);
      }
      const sortedTs = [...tsSet].sort((a, b) => a - b);
      const ptMap    = new Map(allPts.map((p) => [p.ts, p]));

      const labels = sortedTs.map((ts) => new Date(ts * 1000).toISOString());

      // Solid line for regular hours, dashed for extended (pre/post); null for padded timestamps.
      const regularData = sortedTs.map((ts) => {
        const p = ptMap.get(ts);
        if (!p) return null;
        return regOpenTs && regCloseTs && p.ts >= regOpenTs && p.ts <= regCloseTs
          ? ((p.close - prevClose) / prevClose) * 100
          : null;
      });
      const extData = sortedTs.map((ts) => {
        const p = ptMap.get(ts);
        if (!p) return null;
        return !regOpenTs || !regCloseTs || p.ts < regOpenTs || p.ts > regCloseTs
          ? ((p.close - prevClose) / prevClose) * 100
          : null;
      });
      const zeroLine = sortedTs.map(() => 0);

      // Symmetric y-axis: equal space above and below the zero/prevClose line.
      const allPcts = [...regularData, ...extData].filter((v): v is number => v !== null);
      const maxAbs  = Math.max(...allPcts.map(Math.abs), 0.5);
      const yPad    = maxAbs * 1.1;

      // Green/red based on current day move vs prev close.
      const lastPct  = lastAllPt && prevClose ? ((lastAllPt.close - prevClose) / prevClose) * 100 : 0;
      const lineClr  = lastPct >= 0 ? '#4ade80' : '#f87171';

      // Open marker: first actual data point; Close marker: scheduled session end.
      const openIdx  = regOpenTs   ? sortedTs.findIndex((ts) => ts === regOpenTs)  : -1;
      const closeIdx = bounds?.close ? sortedTs.findIndex((ts) => ts >= bounds.close) : -1;
      const openLabel  = openIdx  >= 0 ? (labels[openIdx]  ?? null) : null;
      const closeLabel = closeIdx >= 0 ? (labels[closeIdx] ?? null) : null;
      const sessionMarkers = [
        openLabel  ? { xAxis: openLabel,  label: { formatter: 'Open',  position: 'insideEndTop'   as const, color: textColor, fontSize: 9 } } : null,
        closeLabel ? { xAxis: closeLabel, label: { formatter: 'Close', position: 'insideStartTop' as const, color: textColor, fontSize: 9 } } : null,
      ].filter((m): m is NonNullable<typeof m> => m !== null);

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
            interval: ((index: number) => {
              const ts = sortedTs[index];
              return ts !== undefined && new Date(ts * 1000).getMinutes() === 0;
            }) as unknown as number,
          },
        },
        yAxis: {
          type: 'value',
          min: -yPad,
          max:  yPad,
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
            lineStyle: { color: lineClr, width: 2 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lineClr + '33' }, { offset: 1, color: lineClr + '05' }] } },
            markLine: sessionMarkers.length ? {
              symbol: 'none', silent: true, animation: false,
              lineStyle: { color: isDark ? '#64748b' : '#94a3b8', width: 1, type: 'solid' as const, opacity: 0.6 },
              data: sessionMarkers,
            } : undefined,
          },
          {
            name: 'Extended',
            type: 'line',
            data: extData,
            smooth: false, symbol: 'none', connectNulls: false,
            lineStyle: { color: lineClr + '88', width: 1.5, type: 'dashed' as const },
          },
          {
            name: '__zero',
            type: 'line',
            data: zeroLine,
            smooth: false, symbol: 'none',
            lineStyle: { color: isDark ? '#334155' : '#94a3b8', width: 1, type: 'dashed' as const },
            tooltip: { show: false },
          },
        ],
      };
    }

    // Historical candle chart. Server may return a cached superset (back to 2021)
    // regardless of our `from` query, so always filter to the selected period.
    const cutoff = periodCutoff(period);
    const visible = cutoff ? candles.filter((c) => c.date >= cutoff) : candles;
    if (!visible.length) return {};
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 64 },
      xAxis: {
        type: 'category',
        data: visible.map((c) => c.date),
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
        data: visible.map((c) => c.close),
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

<div class="page-root">
  <!-- Mobile top bar -->
  <div class="mobile-topbar">
    <a href={resolve('/')} class="mobile-circle-btn" aria-label="Terug">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </a>
    <div class="mobile-topbar-title">
      <span class="mobile-avatar" style="background:{color}">{ticker.slice(0, 2)}</span>
      <span class="mobile-topbar-ticker">{ticker}</span>
    </div>
    <button class="mobile-circle-btn" aria-label="Meer opties">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
    </button>
  </div>

  <!-- Desktop header (hidden on mobile) -->
  <div class="sd-desktop-header">
    <div class="sd-identity">
      <span class="color-dot" style="background:{color}"></span>
      <span class="sd-ticker">{ticker}</span>
      {#if meta.label}<span class="sd-name">{meta.label}</span>{/if}
    </div>
    <div class="sd-price-row">
      {#if currentPrice != null}
        <span class="sd-price"><PrivacyValue value="{ccySym}{currentPrice.toFixed(2)}" /></span>
      {/if}
      {#if extChangePct != null && regularChangePct != null}
        <span class="sd-change-group">
          <span class="sd-change-lbl">Markt</span>
          <span class="sd-change {regularChangePct >= 0 ? 'c-pos' : 'c-neg'}">{regularChangePct >= 0 ? '+' : ''}{regularChangePct.toFixed(2)}%</span>
          <span class="sd-change-sep">·</span>
          <span class="sd-change-lbl">{marketState === 'PRE' ? 'Pre' : 'Post'}</span>
          <span class="sd-change {extChangePct >= 0 ? 'c-pos' : 'c-neg'}">{extChangePct >= 0 ? '+' : ''}{extChangePct.toFixed(2)}%</span>
        </span>
      {:else if dayChangePct != null}
        <span class="sd-change {dayChangePct >= 0 ? 'c-pos' : 'c-neg'}">{dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%</span>
      {/if}
      <span class="badge {msBadgeClass(marketState)}">{msBadgeLabel(marketState)}</span>
    </div>
  </div>

  <!-- Mobile hero: name · big value · P&L pill -->
  <div class="sd-hero">
    {#if meta.label}
      <div class="h-eyebrow" style="margin-bottom:6px">{meta.label.toUpperCase()}</div>
    {/if}
    <div class="sd-hero-value"><PrivacyValue value={fmt(val)} /></div>
    <div class="sd-hero-pl">
      {#if pl !== 0}
        <span class="sd-pl-pill {pl >= 0 ? 'pos' : 'neg'}">
          {pl >= 0 ? '▲' : '▼'} {Math.abs(plPct).toFixed(2)}%
        </span>
        <span class="sd-pl-total {pl >= 0 ? 'c-pos' : 'c-neg'}">
          {pl >= 0 ? '+' : ''}<PrivacyValue value={fmt(pl)} /> totaal
        </span>
      {/if}
    </div>
  </div>

  <!-- Chart -->
  <div class="sd-chart-wrap">
    {#if loading}
      <div class="chart-placeholder">Laden…</div>
    {:else if candles.length > 1}
      <Chart option={chartOption()} height="240px" />
    {:else}
      <div class="chart-placeholder">Geen data voor deze periode</div>
    {/if}
  </div>

  <!-- Period selector -->
  <div class="sd-periods card">
    {#each PERIODS as p}
      <button class="sd-period-btn" class:on={period === p.key} onclick={() => (period = p.key)}>
        {p.label}
      </button>
    {/each}
  </div>

  <!-- 2×2 stat cards -->
  <div class="sd-stats">
    <div class="sd-stat card">
      <div class="sd-stat-label">Aantal</div>
      <div class="sd-stat-val mono"><PrivacyValue value={String(shares)} /></div>
      {#if currentPrice != null}
        <div class="sd-stat-sub">{nativeCcy} {currentPrice.toFixed(2)}</div>
      {/if}
    </div>
    <div class="sd-stat card">
      <div class="sd-stat-label">Gem. kost</div>
      {#if avgCostNative != null}
        <div class="sd-stat-val mono">{nativeCcy} {avgCostNative.toFixed(2)}</div>
      {:else if pos?.avgCost}
        <div class="sd-stat-val mono">€ {pos.avgCost.toFixed(2)}</div>
      {/if}
      <div class="sd-stat-sub"><PrivacyValue value={fmt(cost)} /></div>
    </div>
    <div class="sd-stat card">
      <div class="sd-stat-label">Vandaag</div>
      {#if pos?.dayPl != null}
        <div class="sd-stat-val {pos.dayPl >= 0 ? 'c-pos' : 'c-neg'}">
          <PrivacyValue value="€ {pos.dayPl >= 0 ? '+' : ''}{pos.dayPl.toFixed(0)}" />
        </div>
        <div class="sd-stat-sub {pos.dayPl >= 0 ? 'c-pos' : 'c-neg'}">{(pos.dayPlPct ?? 0) >= 0 ? '+' : ''}{(pos.dayPlPct ?? 0).toFixed(2)}%</div>
      {:else if dayChangePct != null}
        <div class="sd-stat-val {dayChangePct >= 0 ? 'c-pos' : 'c-neg'}">{dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%</div>
      {:else}
        <div class="sd-stat-val c-muted">—</div>
      {/if}
    </div>
    <div class="sd-stat card">
      <div class="sd-stat-label">P&amp;L %</div>
      <div class="sd-stat-val {pl >= 0 ? 'c-pos' : 'c-neg'}">{pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%</div>
      <div class="sd-stat-sub {pl >= 0 ? 'c-pos' : 'c-neg'}"><PrivacyValue value="{pl >= 0 ? '+' : ''}{fmt(pl)}" /></div>
    </div>
  </div>

  <!-- Transactions list -->
  {#if txs.length > 0}
    <div class="card sd-tx-card">
      <div class="sd-tx-title">Laatste transacties</div>
      {#each txs as tx}
        {@const isDividend = tx.shares === 0}
        {@const isSale = !isDividend && tx.shares < 0}
        <div class="sd-tx-row">
          <div class="sd-tx-left">
            <div class="sd-tx-type">
              {isDividend ? 'Dividend' : isSale ? 'Verkoop' : 'Koop'}{#if !isDividend} · {Math.abs(tx.shares).toLocaleString('nl-BE', { maximumFractionDigits: 4 })} aandelen{/if}
            </div>
            <div class="sd-tx-date">{tx.date}</div>
          </div>
          <div class="sd-tx-amount mono"><PrivacyValue value={fmt(tx.costEur)} /></div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* ── Mobile topbar ── */
  .mobile-topbar {
    display: none; align-items: center; justify-content: space-between; padding: 10px 0 6px;
  }
  .mobile-topbar-title { display: flex; align-items: center; gap: 8px; }
  .mobile-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.02em; flex-shrink: 0; opacity: 0.85;
  }
  .mobile-topbar-ticker { font-size: 16px; font-weight: 700; }
  .mobile-circle-btn {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--surface-2); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--fg); text-decoration: none; flex-shrink: 0;
  }
  .mobile-circle-btn:hover { background: var(--surface-3, var(--surface-2)); }

  @media (max-width: 640px) { .mobile-topbar { display: flex; } }

  /* ── Desktop header ── */
  .sd-desktop-header {
    display: flex; align-items: center; gap: 12px; padding: 16px 0 12px; flex-wrap: wrap;
  }
  .sd-identity { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; }
  .color-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .sd-ticker { font-size: 18px; font-weight: 700; }
  .sd-name { font-size: 12px; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sd-price-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sd-price { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; }
  .sd-change { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .sd-change-group { display: inline-flex; align-items: baseline; gap: 4px; font-family: 'JetBrains Mono', monospace; }
  .sd-change-lbl { font-size: 10px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .sd-change-sep { color: var(--fg-muted); opacity: 0.5; margin: 0 2px; }
  .badge { font-size: 9px; font-weight: 600; letter-spacing: 0.05em; padding: 2px 5px; border-radius: 3px; text-transform: uppercase; white-space: nowrap; }
  .badge-open   { background: rgba(74,222,128,0.15); color: #4ade80; }
  .badge-ext    { background: rgba(251,191,36,0.15);  color: #fbbf24; }
  .badge-closed { background: rgba(100,116,139,0.15); color: #64748b; }
  @media (max-width: 640px) { .sd-desktop-header { display: none; } }

  /* ── Hero ── */
  .sd-hero { padding: 4px 0 12px; }
  .sd-hero-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 36px; font-weight: 700; letter-spacing: -0.02em;
    line-height: 1.1; margin-bottom: 8px;
  }
  .sd-hero-pl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sd-pl-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 6px;
    font-size: 12px; font-weight: 600;
  }
  .sd-pl-pill.pos { background: rgba(4,120,87,0.12); color: var(--c-pos, #047857); }
  .sd-pl-pill.neg { background: rgba(185,28,28,0.1);  color: var(--c-neg, #b91c1c); }
  .sd-pl-total { font-size: 13px; font-weight: 500; }
  @media (min-width: 641px) { .sd-hero { display: none; } }

  /* ── Chart ── */
  .sd-chart-wrap { margin: 0 -16px; }
  @media (min-width: 641px) { .sd-chart-wrap { margin: 12px 0 0; } }
  .chart-placeholder {
    display: flex; align-items: center; justify-content: center;
    height: 160px; color: var(--fg-muted); font-size: 13px;
  }

  /* ── Period selector ── */
  .sd-periods {
    display: flex; align-items: center; justify-content: space-between;
    margin: 12px 0; padding: 4px;
  }
  .sd-period-btn {
    flex: 1; padding: 7px 4px; font-size: 12px; font-weight: 500;
    background: none; border: none; cursor: pointer;
    color: var(--fg-muted); border-radius: 8px; text-align: center;
    transition: color 0.1s, background 0.1s;
  }
  .sd-period-btn:hover { color: var(--fg); }
  .sd-period-btn.on { background: var(--surface-3, var(--surface-2)); color: var(--fg); font-weight: 700; }

  /* ── 2×2 stat cards ── */
  .sd-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .sd-stat { padding: 14px 16px; }
  .sd-stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--fg-muted); margin-bottom: 6px; }
  .sd-stat-val { font-size: 20px; font-weight: 700; line-height: 1.1; margin-bottom: 3px; }
  .sd-stat-sub { font-size: 12px; color: var(--fg-muted); }

  /* ── Transactions list ── */
  .sd-tx-card { overflow: hidden; }
  .sd-tx-title { font-size: 15px; font-weight: 700; padding: 14px 16px 12px; border-bottom: 1px solid var(--border); }
  .sd-tx-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 16px; border-bottom: 1px solid var(--border);
  }
  .sd-tx-row:last-child { border-bottom: none; }
  .sd-tx-left { display: flex; flex-direction: column; gap: 2px; }
  .sd-tx-type { font-size: 13px; font-weight: 600; }
  .sd-tx-date { font-size: 11px; color: var(--fg-muted); }
  .sd-tx-amount { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }

  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
