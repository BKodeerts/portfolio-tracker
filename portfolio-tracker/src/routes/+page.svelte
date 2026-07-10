<script lang="ts">
  import { resolve } from '$app/paths';
  import { browser } from '$app/environment';
  import { MediaQuery } from 'svelte/reactivity';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import PeriodChart, { type ChartTip, type ChartTipLine } from '$lib/components/shared/PeriodChart.svelte';
  import PeriodPills from '$lib/components/shared/PeriodPills.svelte';
  import AllocationBar from '$lib/components/shared/AllocationBar.svelte';
  import ActivityList from '$lib/components/shared/ActivityList.svelte';
  import HoldingCard, { type DayTone } from '$lib/components/dashboard/HoldingCard.svelte';
  import { buildPortfolioIntradaySession } from '$lib/derived/intraday';
  import {
    getLiveData, getDay1Pl, getPeriodPl, buildCards, buildTickerSpark,
    buildWatchCards, buildBenchmarkRatios, buildSessionBands,
    livePositionValueEur, prevSessionMove,
    type TickerSpark, type WatchCard,
  } from '$lib/derived/dashboard';
  import { fmtEur, fmtEurSigned, fmtNative, fmtNativeSigned, fmtPct, fmtPct1 } from '$lib/utils/fmt';
  import { PERIOD_OPTIONS, periodDeltaLabel, filterChartData, type Period } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import type { Position } from '$lib/types/portfolio';

  // ── Responsive (design breakpoint: 900px) ───────────────────────────────────
  const desktop = new MediaQuery('(min-width: 900px)');

  // ── Persisted UI state ──────────────────────────────────────────────────────
  const PERIOD_KEY = 'pt-dashboard-period';
  const DAY_MODE_KEY = 'pt-day-mode';
  const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));

  function persisted(key: string): string | null {
    if (!browser) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null; /* localStorage unavailable */
    }
  }
  function persist(key: string, v: string) {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* localStorage unavailable */
    }
  }

  function initialPeriod(): Period {
    const v = persisted(PERIOD_KEY);
    return v && VALID_PERIODS.has(v) ? (v as Period) : '1d';
  }

  let period = $state<Period>(initialPeriod());

  function selectPeriod(v: string) {
    period = v as Period;
    persist(PERIOD_KEY, v);
  }

  /** Day-change toggle (Apple Stocks-style): flips ALL cards between % and €. */
  let dayMode = $state<'pct' | 'eur'>(persisted(DAY_MODE_KEY) === 'eur' ? 'eur' : 'pct');

  function toggleDayMode() {
    dayMode = dayMode === 'pct' ? 'eur' : 'pct';
    persist(DAY_MODE_KEY, dayMode);
  }

  // ── Chart controls (ephemeral) ──────────────────────────────────────────────
  let yMode = $state<'eur' | 'pct'>('eur');
  let showBench = $state(false);
  const isPct = $derived(yMode === 'pct');

  // ── Live status / hero ──────────────────────────────────────────────────────
  const cards    = $derived(buildCards());
  const cardMap  = $derived(new Map(cards.map((c) => [c.ticker, c])));
  const anyOpen  = $derived(cards.some((c) => c.marketState === 'REGULAR'));

  const liveData   = $derived(getLiveData());
  const staticTotal = $derived(portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const totalValue = $derived(liveData?.value ?? staticTotal);

  // ── Chart / market clock ────────────────────────────────────────────────────
  const session = $derived(period === '1d' ? buildPortfolioIntradaySession() : null);
  /** Before the first exchange opens: empty chart, zero delta, dimmed captions. */
  const preOpen    = $derived(session != null && session.nowMin < session.dayStart);
  /** After the last exchange closes: full-day series, no "now" dot. */
  const afterClose = $derived(session != null && session.nowMin > session.dayEnd);

  const fmtMin = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const firstOpenLabel = $derived(fmtMin(session?.dayStart ?? 9 * 60));

  const heroDelta = $derived.by((): { pl: number; pct: number | null } | null => {
    if (period === '1d') {
      // Markets haven't opened: nothing traded today, never show FX drift.
      if (preOpen) return { pl: 0, pct: 0 };
      // No intraday/FX data yet: hide the delta instead of implying a flat day.
      return getDay1Pl();
    }
    return getPeriodPl(filterChartData(portfolioStore.chartData, period), period);
  });

  const INTRADAY_TICKS = [9, 12, 15, 18, 21].map((h) => ({
    x: h * 60,
    label: `${String(h).padStart(2, '0')}:00`,
  }));

  // ── 1D series (€ or re-based % vs prev close) ───────────────────────────────
  const prevCloseTotal = $derived(session?.prevCloseTotal ?? 0);
  const intradayDisplay = $derived.by(() => {
    const pts = session?.points ?? [];
    if (!isPct) return pts;
    if (prevCloseTotal <= 0) return [];
    return pts.map((p) => ({ min: p.min, value: ((p.value - prevCloseTotal) / prevCloseTotal) * 100 }));
  });
  const sessionBands = $derived(session ? buildSessionBands(session.dayStart, session.dayEnd) : []);

  function tip1d(i: number): ChartTip | null {
    const p = session?.points[i];
    if (!p || prevCloseTotal <= 0) return null;
    const delta = p.value - prevCloseTotal;
    const pct = (delta / prevCloseTotal) * 100;
    return {
      title: fmtMin(p.min),
      lines: [
        { text: isPct ? fmtPct(pct) : fmtEur(p.value), tone: 'main' },
        { text: `${fmtEurSigned(delta)} (${fmtPct(pct)})`, tone: delta >= 0 ? 'pos' : 'neg' },
      ],
    };
  }

  // ── History series (€ or re-based % vs window start) ────────────────────────
  const historyFiltered = $derived(period === '1d' ? [] : filterChartData(portfolioStore.chartData, period));
  const historyFirst    = $derived(historyFiltered[0]?.value ?? 0);
  const historyData     = $derived(historyFiltered.map((p) => ({ x: new Date(p.date).getTime(), value: p.value })));
  // % mode re-bases the server's flow-adjusted return index (TWR), never raw
  // value: dividing values by the window-start value counts every deposit as
  // return and explodes on long windows where the portfolio started small.
  const historyFirstRi  = $derived(historyFiltered[0]?.returnIndex ?? 0);
  const historyDisplay  = $derived.by(() => {
    if (!isPct) return historyData;
    if (historyFirstRi <= 0) return [];
    return historyFiltered.map((p) => ({
      x: new Date(p.date).getTime(),
      value: (p.returnIndex / historyFirstRi - 1) * 100,
    }));
  });
  // Invested overlay + gain fill are € mode only (in %, benchmark comparison is the point).
  const historyInvested = $derived(isPct ? [] : historyFiltered.map((p) => ({ x: new Date(p.date).getTime(), value: p.invested })));

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

  // ── Benchmark overlay (real S&P 500 series, re-based to the window) ─────────
  const benchRatios = $derived(showBench && period !== '1d' ? buildBenchmarkRatios(historyFiltered) : null);
  const benchSeries = $derived.by(() => {
    if (!benchRatios || (!isPct && historyFirst <= 0)) return [];
    const out: { x: number; value: number }[] = [];
    for (let i = 0; i < historyFiltered.length; i++) {
      const r = benchRatios[i];
      if (r == null) continue;
      out.push({
        x: new Date(historyFiltered[i]!.date).getTime(),
        value: isPct ? (r - 1) * 100 : r * historyFirst,
      });
    }
    return out.length >= 2 ? out : [];
  });

  // ── Transaction markers (nearest chart row; details in the tooltip) ─────────
  const SNAP_MS = 4 * 864e5;
  const txMarks = $derived.by(() => {
    const rows = historyFiltered;
    const markers: { i: number; color: string }[] = [];
    const at = new Map<number, string[]>();
    if (rows.length < 2) return { markers, at };
    const times = rows.map((r) => new Date(r.date).getTime());
    for (const tx of portfolioStore.rawTransactions) {
      const tt = new Date(tx.date).getTime();
      if (tt < times[0]! - SNAP_MS || tt > times[times.length - 1]! + SNAP_MS) continue;
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < times.length; i++) {
        const d = Math.abs(times[i]! - tt);
        if (d < bd) { bd = d; bi = i; }
      }
      const kind = tx.shares > 0 ? 'BUY' : tx.shares < 0 ? 'SELL' : 'DIV';
      markers.push({
        i: bi,
        color: kind === 'BUY' ? 'var(--c-pos)' : kind === 'SELL' ? 'var(--c-neg)' : 'var(--c-div)',
      });
      const sh = Math.abs(tx.shares);
      const shStr = sh === 0 ? '' : ` ${Number.isInteger(sh) ? sh : sh.toFixed(2)}`;
      const list = at.get(bi) ?? [];
      list.push(`${kind}${shStr} ${tx.ticker} · ${fmtEur(tx.costEur)}`);
      at.set(bi, list);
    }
    return { markers, at };
  });

  function tipHistory(i: number): ChartTip | null {
    const row = historyFiltered[i];
    if (!row) return null;
    const lines: ChartTipLine[] = [];
    lines.push({
      text: isPct
        ? historyFirstRi > 0 ? fmtPct1((row.returnIndex / historyFirstRi - 1) * 100) : '—'
        : fmtEur(row.value),
      tone: 'main',
    });
    if (!isPct) {
      const pl = row.value - row.invested;
      lines.push({ text: `invested ${fmtEur(row.invested)}`, tone: 'muted' });
      lines.push({ text: `${fmtEurSigned(pl)} P&L`, tone: pl >= 0 ? 'pos' : 'neg' });
    }
    const r = benchRatios?.[i];
    if (r != null) {
      lines.push({
        text: `S&P 500 ${isPct ? fmtPct1((r - 1) * 100) : fmtEur(r * historyFirst)}`,
        tone: 'bench',
      });
    }
    for (const t of txMarks.at.get(i) ?? []) lines.push({ text: t, tone: 'muted' });
    return {
      title: new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }),
      lines,
    };
  }

  // ── Holdings & watchlist cards ──────────────────────────────────────────────
  const holdings = $derived([...portfolioStore.positions].sort((a, b) => b.value - a.value));
  const watchCards = $derived(buildWatchCards());

  /** Header-row market price: last intraday point ?? prev close; EUR value/share as last resort. */
  function marketPriceStr(pos: Position): string {
    const card = cardMap.get(pos.ticker);
    const live = card?.price ?? card?.prevClose;
    if (live != null) return fmtNative(live, pos.currency);
    if (pos.shares > 0) return fmtNative(pos.value / pos.shares, 'EUR');
    return '—';
  }

  interface CardBits {
    priceStr: string;
    dayStr: string;
    dayTone: DayTone;
  }

  /**
   * Held card numbers. Pre-open: previous session's move in washed colors and
   * the prev close as price; live/post: day % or the position's € day impact.
   */
  function heldBits(pos: Position, spark: TickerSpark | null): CardBits {
    const card = cardMap.get(pos.ticker);
    if (spark?.phase === 'pre') {
      const priceStr = card?.prevClose != null ? fmtNative(card.prevClose, pos.currency) : marketPriceStr(pos);
      const mv = prevSessionMove(spark);
      if (!mv) return { priceStr, dayStr: '—', dayTone: 'muted' };
      return {
        priceStr,
        dayStr: dayMode === 'pct' ? fmtPct(mv.pct) : fmtNativeSigned(mv.native, pos.currency),
        dayTone: mv.native >= 0 ? 'washed-pos' : 'washed-neg',
      };
    }
    const priceStr = marketPriceStr(pos);
    if (card?.changePct == null) return { priceStr, dayStr: '—', dayTone: 'muted' };
    const tone: DayTone = card.changePct >= 0 ? 'pos' : 'neg';
    if (dayMode === 'pct') return { priceStr, dayStr: fmtPct(card.changePct), dayTone: tone };
    if (card.changeEur == null) return { priceStr, dayStr: '—', dayTone: 'muted' };
    return { priceStr, dayStr: fmtEurSigned(card.changeEur), dayTone: tone };
  }

  /** Watch card numbers: € mode shows the native per-share change (no position). */
  function watchBits(w: WatchCard, spark: TickerSpark | null): CardBits {
    if (spark?.phase === 'pre') {
      const priceStr = w.prevClose != null ? fmtNative(w.prevClose, w.currency) : '—';
      const mv = prevSessionMove(spark);
      if (!mv) return { priceStr, dayStr: '—', dayTone: 'muted' };
      return {
        priceStr,
        dayStr: dayMode === 'pct' ? fmtPct(mv.pct) : fmtNativeSigned(mv.native, w.currency),
        dayTone: mv.native >= 0 ? 'washed-pos' : 'washed-neg',
      };
    }
    const last = w.price ?? w.prevClose;
    const priceStr = last != null ? fmtNative(last, w.currency) : '—';
    if (w.changePct == null || w.changeNative == null) return { priceStr, dayStr: '—', dayTone: 'muted' };
    return {
      priceStr,
      dayStr: dayMode === 'pct' ? fmtPct(w.changePct) : fmtNativeSigned(w.changeNative, w.currency),
      dayTone: w.changePct >= 0 ? 'pos' : 'neg',
    };
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

  <!-- ── Top bar row (mobile only — desktop uses the global top nav) ── -->
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
          {fmtEurSigned(heroDelta.pl)}{#if heroDelta.pct != null}&nbsp;({fmtPct(heroDelta.pct)}){/if}
        </span>
      {/if}
      <span class="hero-label">{period === '1d' && preOpen ? 'today · markets closed' : periodDeltaLabel(period)}</span>
    </div>
  </div>

  <!-- ── Chart (full-bleed mobile, full container width desktop) ── -->
  <div class="chart-bleed">
    {#if period === '1d'}
      <PeriodChart
        mode="intraday"
        height={desktop.current ? 260 : 200}
        padX={desktop.current ? 24 : 20}
        formatY={isPct ? fmtPct : fmtEur}
        points={intradayDisplay}
        prevClose={isPct ? 0 : session?.prevCloseTotal}
        sessionStart={session?.dayStart}
        sessionEnd={session?.dayEnd}
        xTicks={INTRADAY_TICKS}
        emptyLabel="Markets open at {firstOpenLabel}"
        showNow={!afterClose}
        bands={sessionBands}
        showHiLo
        tooltip={tip1d}
      />
    {:else}
      <PeriodChart
        mode="history"
        height={desktop.current ? 260 : 200}
        padX={desktop.current ? 24 : 20}
        formatY={isPct ? fmtPct1 : fmtEur}
        data={historyDisplay}
        invested={historyInvested}
        xTicks={historyTicks}
        gainFill={!isPct}
        benchmark={benchSeries}
        markers={txMarks.markers}
        showHiLo
        tooltip={tipHistory}
      />
    {/if}
  </div>

  <!-- ── Period pills + chart controls ── -->
  <div class="pills-row">
    <div class="pills-controls">
      <div class="pills-flex">
        <PeriodPills options={PERIOD_OPTIONS} selected={period} onselect={selectPeriod} />
      </div>
      <div class="chart-ctl">
        <div class="seg" role="group" aria-label="Chart scale">
          <button type="button" class:on={!isPct} onclick={() => (yMode = 'eur')}>€</button>
          <button type="button" class:on={isPct} onclick={() => (yMode = 'pct')}>%</button>
        </div>
        <button
          type="button"
          class="bench-chip"
          class:on={showBench}
          class:idle1d={period === '1d'}
          aria-pressed={showBench}
          onclick={() => { if (period !== '1d') showBench = !showBench; }}
        >
          <span class="bench-dash"></span> vs S&amp;P 500
        </button>
      </div>
    </div>
    {#if period === '1d'}
      <div class="pills-caption">
        {preOpen
          ? `Markets open at ${firstOpenLabel} CET`
          : `Since first market open, ${firstOpenLabel} CET · dot = latest`}
      </div>
    {/if}
  </div>

  <!-- ── Columns: holdings + watchlist + sidebar (single column on mobile) ── -->
  <div class="columns">

    <!-- ── Holdings cards ── -->
    <div class="col-main">
      {#if holdings.length > 0}
        <div class="section-header">
          <div class="section-title">Holdings</div>
          <button type="button" class="section-toggle mono" onclick={toggleDayMode}>
            today · {dayMode === 'pct' ? '%' : '€'} ⇄
          </button>
        </div>

        <div class="card-grid">
          {#each holdings as pos (pos.ticker)}
            {@const spark = buildTickerSpark(pos.yahoo ?? pos.ticker)}
            {@const bits = heldBits(pos, spark)}
            <HoldingCard
              ticker={pos.ticker}
              color={getColor(pos.ticker)}
              href={resolve('/stock/[ticker]', { ticker: pos.ticker })}
              priceStr={bits.priceStr}
              footLeft={fmtEur(livePositionValueEur(pos))}
              privacy
              dayStr={bits.dayStr}
              dayTone={bits.dayTone}
              {spark}
              ontoggleday={toggleDayMode}
            />
          {/each}
        </div>
      {/if}

      <!-- ── Watchlist (tracked, not held) ── -->
      {#if watchCards.length > 0}
        <div class="section-header watch-header">
          <div class="section-title">Watchlist</div>
          <div class="section-hint">not held</div>
        </div>

        <div class="card-grid">
          {#each watchCards as w (w.ticker)}
            {@const spark = buildTickerSpark(w.yahoo)}
            {@const bits = watchBits(w, spark)}
            <HoldingCard
              variant="watch"
              ticker={w.ticker}
              color={getColor(w.ticker)}
              href={resolve('/stock/[ticker]', { ticker: w.ticker })}
              priceStr={bits.priceStr}
              footLeft={w.label}
              dayStr={bits.dayStr}
              dayTone={bits.dayTone}
              {spark}
              ontoggleday={toggleDayMode}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Sidebar: allocation + activity ── -->
    <div class="col-side">
      {#if allocItems.length > 0}
        <div class="side-block">
          <div class="section-header alloc-header">
            <div class="section-title">Allocation</div>
            <div class="section-hint"><PrivacyValue value={fmtEur(portfolioStore.totalInvested)} /> invested</div>
          </div>
          <AllocationBar items={allocItems} legend="chips" />
        </div>
      {/if}

      <div class="side-block">
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
    </div>

  </div>

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

  /* ── Period pills + chart controls ── */
  .pills-row { margin: 8px 0 4px; }
  .pills-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  .pills-flex {
    flex: 1 1 300px;
    max-width: 440px;
    min-width: 0;
  }
  .chart-ctl {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .seg {
    display: flex;
    border: 1px solid var(--border-2);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    padding: 5px 11px;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    border: none;
    background: transparent;
    color: var(--fg-faint);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--pill-selected-bg);
    color: var(--fg);
    font-weight: 700;
  }
  .bench-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    border: 1px solid var(--border-2);
    border-radius: 8px;
    background: transparent;
    color: var(--fg-faint);
    cursor: pointer;
    user-select: none;
  }
  .bench-chip.on {
    background: var(--pill-selected-bg);
    color: var(--fg);
    font-weight: 700;
  }
  .bench-chip.idle1d {
    opacity: 0.4;
    cursor: default;
  }
  .bench-dash {
    width: 10px;
    height: 2px;
    border-radius: 2px;
    background: var(--c-bench);
    flex-shrink: 0;
  }
  .pills-caption {
    font-size: 11px;
    color: var(--fg-faint);
    padding: 6px 2px 0;
  }

  /* ── Columns ── */
  .columns {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 26px 56px;
    margin-top: 26px;
  }
  .col-main { flex: 2 1 520px; min-width: 0; }
  .col-side {
    flex: 1 1 300px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 26px;
  }

  /* ── Section headers ── */
  .section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 0 4px;
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
  .section-toggle {
    font-size: 11px;
    font-weight: 500;
    border: none;
    background: transparent;
    padding: 0;
    color: var(--fg-faint);
    cursor: pointer;
    user-select: none;
  }
  .section-toggle:hover { color: var(--fg); }
  .section-link {
    font-size: 11px;
    color: var(--fg-faint);
    text-decoration: none;
  }
  .section-link:hover { color: var(--fg); }
  .activity-header { margin-bottom: 2px; }
  .alloc-header    { margin-bottom: 10px; }
  .watch-header    { margin-top: 28px; }

  /* ── Holdings / watchlist card grid ── */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    margin-top: 8px;
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

  /* ── Desktop (≥900px) ── */
  @media (min-width: 900px) {
    .page {
      max-width: 1160px;
      padding: 18px 24px 96px;
    }
    /* Global top nav replaces the page's own top bar */
    .topbar { display: none; }
    .hero { margin-top: 0; }
    .hero-value { font-size: 42px; }
    .chart-bleed { margin: 10px -24px 0; }
  }
</style>
