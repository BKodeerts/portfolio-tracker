<script lang="ts">
  import { resolve } from '$app/paths';
  import { browser } from '$app/environment';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import PeriodChart from '$lib/components/shared/PeriodChart.svelte';
  import PeriodPills from '$lib/components/shared/PeriodPills.svelte';
  import IntradaySparkline from '$lib/components/shared/IntradaySparkline.svelte';
  import AllocationBar from '$lib/components/shared/AllocationBar.svelte';
  import ActivityList from '$lib/components/shared/ActivityList.svelte';
  import { buildPortfolioIntradaySession } from '$lib/derived/intraday';
  import { getLiveData, getDay1Pl, getPeriodPl, buildCards } from '$lib/derived/dashboard';
  import { fmtEur, fmtEurSigned, fmtNative, fmtPct } from '$lib/utils/fmt';
  import { PERIOD_OPTIONS, periodDeltaLabel, filterChartData, type Period } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import { sessionBounds } from '$lib/market';
  import type { Position } from '$lib/types/portfolio';

  // ── Period selection (persisted) ───────────────────────────────────────────
  const PERIOD_KEY = 'pt-dashboard-period';
  const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));

  function initialPeriod(): Period {
    if (browser) {
      try {
        const v = localStorage.getItem(PERIOD_KEY);
        if (v && VALID_PERIODS.has(v)) return v as Period;
      } catch {
        /* localStorage unavailable */
      }
    }
    return '1d';
  }

  let period = $state<Period>(initialPeriod());

  function selectPeriod(v: string) {
    period = v as Period;
    try {
      localStorage.setItem(PERIOD_KEY, v);
    } catch {
      /* localStorage unavailable */
    }
  }

  // ── Live status / hero ──────────────────────────────────────────────────────
  const cards    = $derived(buildCards());
  const cardMap  = $derived(new Map(cards.map((c) => [c.ticker, c])));
  const anyOpen  = $derived(cards.some((c) => c.marketState === 'REGULAR'));

  const liveData   = $derived(getLiveData());
  const staticTotal = $derived(portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const totalValue = $derived(liveData?.value ?? staticTotal);

  const heroDelta = $derived.by((): { pl: number; pct: number } | null => {
    if (period === '1d') {
      const live = getDay1Pl();
      if (live) return live;
      // Fallback to server-computed day P&L while intraday/FX is unavailable.
      const pl = portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0);
      const base = totalValue - pl;
      return base > 0 ? { pl, pct: (pl / base) * 100 } : null;
    }
    return getPeriodPl(filterChartData(portfolioStore.chartData, period));
  });

  // ── Chart ───────────────────────────────────────────────────────────────────
  const session = $derived(period === '1d' ? buildPortfolioIntradaySession() : null);

  const INTRADAY_TICKS = [9, 12, 15, 18, 21].map((h) => ({
    x: h * 60,
    label: `${String(h).padStart(2, '0')}:00`,
  }));

  const historyFiltered = $derived(period === '1d' ? [] : filterChartData(portfolioStore.chartData, period));
  const historyData     = $derived(historyFiltered.map((p) => ({ x: new Date(p.date).getTime(), value: p.value })));
  const historyInvested = $derived(historyFiltered.map((p) => ({ x: new Date(p.date).getTime(), value: p.invested })));

  const historyTicks = $derived.by(() => {
    const rows = historyFiltered;
    if (rows.length < 2) return [];
    const short = period === '1m' || period === '3m';
    const seen = new Set<number>();
    const ticks: { x: number; label: string }[] = [];
    for (const f of [0, 1 / 3, 2 / 3, 1]) {
      const idx = Math.round(f * (rows.length - 1));
      if (seen.has(idx)) continue;
      seen.add(idx);
      const date = rows[idx]!.date;
      ticks.push({ x: new Date(date).getTime(), label: short ? date.slice(5) : date.slice(2, 7) });
    }
    return ticks;
  });

  // ── Holdings ────────────────────────────────────────────────────────────────
  const holdings = $derived([...portfolioStore.positions].sort((a, b) => b.value - a.value));

  /** Per-ticker sparkline session bounds in unix seconds (Yahoo trading periods, exchange fallback). */
  function sparkSession(yahoo: string): { start: number; end: number } | null {
    const intra = intradayStore.data[yahoo];
    if (!intra) return null;
    const regular = intra.tradingPeriods?.regular;
    if (regular) return { start: regular.start, end: regular.end };
    const b = sessionBounds(yahoo, intra.date || new Date().toISOString().slice(0, 10));
    return b ? { start: b.open, end: b.close } : null;
  }

  /** "120 shares" / "3.5 shares" — trailing zeros trimmed on fractional counts. */
  function fmtShares(shares: number): string {
    const str = Number.isInteger(shares) ? String(shares) : shares.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return `${str} ${shares === 1 ? 'share' : 'shares'}`;
  }

  /** Line 1 market price: last intraday point ?? prev close; EUR value/share as last resort. */
  function marketPriceStr(pos: Position): string {
    const card = cardMap.get(pos.ticker);
    const live = card?.price ?? card?.prevClose;
    if (live != null) return fmtNative(live, pos.currency);
    if (pos.shares > 0) return fmtNative(pos.value / pos.shares, 'EUR');
    return '—';
  }

  function dayPctOf(pos: Position): number | null {
    return cardMap.get(pos.ticker)?.changePct ?? pos.dayPlPct ?? null;
  }

  // ── Allocation ──────────────────────────────────────────────────────────────
  const allocItems = $derived(
    holdings
      .filter((p) => p.value > 0)
      .map((p) => ({
        name: p.ticker,
        color: getColor(p.ticker),
        pct: staticTotal > 0 ? (p.value / staticTotal) * 100 : 0,
      })),
  );

  // ── Activity ────────────────────────────────────────────────────────────────
  const recentTx = $derived(
    [...portfolioStore.rawTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
  );
</script>

<div class="page">

  <!-- ── Top bar row ── -->
  <div class="topbar">
    <div class="topbar-title">Portfolio</div>
    <div class="topbar-status mono">
      <span class="live-dot" class:open={anyOpen}></span>
      <span>{anyOpen ? 'LIVE' : 'CLOSED'}{#if intradayStore.liveEurUsd}&nbsp;· EUR/USD {intradayStore.liveEurUsd.toFixed(3)}{/if}</span>
    </div>
  </div>

  <!-- ── Hero ── -->
  <div class="hero">
    <div class="hero-value mono"><PrivacyValue value={fmtEur(totalValue)} /></div>
    <div class="hero-delta-row">
      {#if heroDelta}
        <span class="hero-delta mono" class:pos={heroDelta.pl >= 0} class:neg={heroDelta.pl < 0}>
          {fmtEurSigned(heroDelta.pl)} ({fmtPct(heroDelta.pct)})
        </span>
      {/if}
      <span class="hero-label">{periodDeltaLabel(period)}</span>
    </div>
  </div>

  <!-- ── Chart (full-bleed) ── -->
  <div class="chart-bleed">
    {#if period === '1d'}
      <PeriodChart
        mode="intraday"
        height={200}
        formatY={fmtEur}
        points={session?.points ?? []}
        prevClose={session?.prevCloseTotal}
        sessionStart={session?.dayStart}
        sessionEnd={session?.dayEnd}
        xTicks={INTRADAY_TICKS}
        emptyLabel="Markets open at 09:00"
      />
    {:else}
      <PeriodChart
        mode="history"
        height={200}
        formatY={fmtEur}
        data={historyData}
        invested={historyInvested}
        xTicks={historyTicks}
      />
    {/if}
  </div>

  <!-- ── Period pills ── -->
  <div class="pills-row">
    <PeriodPills options={PERIOD_OPTIONS} selected={period} onselect={selectPeriod} />
  </div>
  {#if period === '1d'}
    <div class="pills-caption">Since first market open, 09:00 CET · dot = latest</div>
  {/if}

  <!-- ── Holdings ── -->
  {#if holdings.length > 0}
    <div class="section-header">
      <div class="section-title">Holdings</div>
      <div class="section-hint">market price · your value</div>
    </div>

    {#each holdings as pos (pos.ticker)}
      {@const yahoo = pos.yahoo ?? pos.ticker}
      {@const intra = intradayStore.data[yahoo]}
      {@const spark = sparkSession(yahoo)}
      {@const dayPct = dayPctOf(pos)}
      <a class="h-row" href={resolve('/stock/[ticker]', { ticker: pos.ticker })}>
        <div class="h-id">
          <div class="h-tick">
            <span class="h-dot" style="background:{getColor(pos.ticker)}"></span>
            <span class="h-name">{pos.ticker}</span>
          </div>
          <div class="h-shares">{fmtShares(pos.shares)}</div>
        </div>
        <div class="h-spark">
          {#if intra?.previousClose && spark}
            <IntradaySparkline
              points={intra.points ?? []}
              prevClose={intra.previousClose}
              sessionStart={spark.start}
              sessionEnd={spark.end}
              height={30}
            />
          {/if}
        </div>
        <div class="h-nums">
          <div class="h-pair">
            <span class="h-price mono">{marketPriceStr(pos)}</span>
            <span class="h-pct mono muted">{dayPct != null ? fmtPct(dayPct) : '—'}</span>
          </div>
          <div class="h-pair">
            <span class="h-value mono"><PrivacyValue value={fmtEur(pos.value)} /></span>
            <span class="h-pct mono" class:pos={pos.plPct >= 0} class:neg={pos.plPct < 0}>{fmtPct(pos.plPct)}</span>
          </div>
        </div>
      </a>
    {/each}
  {/if}

  <!-- ── Allocation ── -->
  {#if allocItems.length > 0}
    <div class="section-header alloc-header">
      <div class="section-title">Allocation</div>
      <div class="section-hint"><PrivacyValue value={fmtEur(portfolioStore.totalInvested)} /> invested</div>
    </div>
    <AllocationBar items={allocItems} legend="chips" />
  {/if}

  <!-- ── Activity ── -->
  <div class="section-header activity-header">
    <div class="section-title">Activity</div>
    <a class="section-link" href={resolve('/transactions')}>All →</a>
  </div>
  {#if recentTx.length > 0}
    <div class="activity-wrap" class:privacy={themeStore.privacyMode}>
      <ActivityList items={recentTx} />
    </div>
  {:else}
    <div class="activity-empty">No transactions yet</div>
  {/if}

</div>

<style>
  .page {
    max-width: 560px;
    margin: 0 auto;
    padding: 14px 20px 90px;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
    letter-spacing: -0.02em;
  }

  .pos { color: var(--c-pos); }
  .neg { color: var(--c-neg); }

  /* ── Top bar row ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .topbar-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .topbar-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--fg-faint);
  }
  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-faint);
    flex-shrink: 0;
  }
  .live-dot.open { background: var(--c-pos); }

  /* ── Hero ── */
  .hero { margin: 18px 0 6px; }
  .hero-value {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }
  .hero-delta-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 8px;
    font-size: 13px;
  }
  .hero-delta { font-weight: 600; }
  .hero-label { color: var(--fg-faint); }

  /* ── Chart ── */
  .chart-bleed { margin: 10px -20px 0; }

  /* ── Period pills ── */
  .pills-row { margin: 8px 0 4px; }
  .pills-caption {
    font-size: 11px;
    color: var(--fg-faint);
    padding: 2px 2px 0;
  }

  /* ── Section headers ── */
  .section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 26px 0 4px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .section-hint {
    font-size: 11px;
    color: var(--fg-faint);
  }
  .section-link {
    font-size: 11px;
    color: var(--fg-faint);
    text-decoration: none;
  }
  .section-link:hover { color: var(--fg); }
  .activity-header { margin-bottom: 2px; }
  .alloc-header    { margin-bottom: 10px; }

  /* ── Holdings rows ── */
  .h-row {
    display: grid;
    grid-template-columns: minmax(72px, auto) 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 13px 0;
    min-height: 44px;
    border-bottom: 1px solid var(--hairline);
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }
  .h-row:hover { background: var(--row-hover); }
  .h-id { min-width: 0; }
  .h-tick {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .h-dot {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .h-name {
    font-size: 13px;
    font-weight: 700;
  }
  .h-shares {
    font-size: 10.5px;
    color: var(--fg-faint);
    margin-top: 2px;
    white-space: nowrap;
  }
  .h-spark { min-width: 0; }
  .h-nums { text-align: right; }
  .h-pair {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 6px;
  }
  .h-pair + .h-pair { margin-top: 3px; }
  .h-price {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--fg-secondary);
  }
  .h-pct {
    font-size: 11px;
    font-weight: 600;
    min-width: 52px;
  }
  .h-pct.muted { color: var(--fg-secondary); }
  .h-value {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--fg);
  }

  /* ── Activity ── */
  .activity-wrap.privacy :global(.amount) {
    filter: blur(7px);
    user-select: none;
  }
  .activity-empty {
    padding: 12px 0;
    font-size: 11px;
    color: var(--fg-faint);
  }
</style>
