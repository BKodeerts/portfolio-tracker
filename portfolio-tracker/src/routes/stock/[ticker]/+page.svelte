<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { browser } from '$app/environment';
  import { MediaQuery } from 'svelte/reactivity';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { buildTickerSpark, type SparkPhase } from '$lib/derived/dashboard';
  import { fetchCandles } from '$lib/api/candles';
  import { fmtEur, fmtEurSigned, fmtNative, fmtNativeSigned, fmtPct, fmtPct1 } from '$lib/utils/fmt';
  import { PERIOD_OPTIONS, periodCutoff } from '$lib/utils/period';
  import { isExchangeOpen, normalizeMarketState, sessionBounds } from '$lib/market';
  import { toEurLiveOrFallback } from '$lib/fx';
  import PeriodPills from '$lib/components/shared/PeriodPills.svelte';
  import PeriodChart from '$lib/components/shared/PeriodChart.svelte';
  import ActivityList from '$lib/components/shared/ActivityList.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { Period } from '$lib/utils/period';
  import type { Candle, IntradayData } from '$lib/types/candle';
  import type { Transaction } from '$lib/types/transaction';

  /* ── Local helpers (shared modules don't export these; see report) ── */

  // Exchange label per yahoo suffix. $lib/market keeps its EXCHANGE_DEFS
  // private, so this mirrors those labels locally.
  const EXCHANGE_LABELS: Record<string, string> = {
    '': 'US', '.DE': 'XETRA', '.AS': 'AEX', '.PA': 'EPA', '.L': 'LSE',
    '.MI': 'MIL', '.BR': 'XBRU', '.SW': 'SWX', '.ST': 'SSEX', '.HE': 'OMX',
    '.CO': 'KFX', '.OL': 'OSE', '.CL': 'SCL', '.TO': 'TSX', '.AX': 'ASX',
    '.T': 'TSE', '.MX': 'BMV',
  };
  function exchangeLabel(sym: string): string {
    const m = sym.match(/\.([A-Z]{1,2})$/i);
    const sfx = m?.[1] ? `.${m[1].toUpperCase()}` : '';
    return EXCHANGE_LABELS[sfx] ?? 'US';
  }

  // Europe/Brussels minutes-of-day conversion (same technique as
  // $lib/derived/intraday.ts, which doesn't export it).
  const DAY_SECS = 86400;
  function brusselsOffsetSecs(at: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Brussels', hour12: false, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 1000);
  }
  function brusselsMinuteOfDay(ts: number): number {
    const offset = brusselsOffsetSecs(new Date(ts * 1000));
    return Math.floor(((ts + offset) % DAY_SECS) / 60);
  }
  function fmtMin(m: number): string {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /* ── Identity ── */

  const ticker   = $derived(page.params['ticker'] ?? '');
  const meta     = $derived(portfolioStore.tickerMeta[ticker] ?? {});
  const yahoo    = $derived(meta.yahoo ?? ticker);
  const currency = $derived(meta.currency ?? 'EUR');
  const pos      = $derived(portfolioStore.positions.find((p) => p.ticker === ticker));

  const txs = $derived(
    portfolioStore.rawTransactions
      .filter((t) => t.ticker === ticker)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  const known = $derived(
    pos != null || portfolioStore.tickerMeta[ticker] != null || txs.length > 0,
  );

  /* ── Position stats (sold-out fallback: latest chartData slice, like the old page) ── */

  const latestSlice = $derived(
    portfolioStore.chartData[portfolioStore.chartData.length - 1]?.positions[ticker],
  );
  const shares = $derived(pos?.shares ?? latestSlice?.shares ?? 0);
  const value  = $derived(pos?.value ?? latestSlice?.value ?? 0);
  const cost   = $derived(pos?.costEur ?? latestSlice?.cost ?? 0);
  const pl     = $derived(pos?.pl ?? value - cost);
  const plPct  = $derived(pos?.plPct ?? (cost > 0 ? (pl / cost) * 100 : 0));

  const dividends = $derived(portfolioStore.dividendsPerTicker[ticker] ?? 0);

  const totalValue = $derived(portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const weightPct  = $derived(totalValue > 0 ? (value / totalValue) * 100 : 0);

  /* ── Candles state (fetch effect further down) ── */

  let candles        = $state<Candle[]>([]);
  let candlesLoading = $state(false);

  /* ── Intraday / market price ── */

  const iData     = $derived(intradayStore.data[yahoo] as IntradayData | null | undefined);
  const iPts      = $derived(iData?.points ?? []);
  const prevClose = $derived(iData?.previousClose ?? null);

  const rawState    = $derived(iData?.marketState ?? (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
  const marketState = $derived(normalizeMarketState(yahoo, rawState));

  // Same state-driven render path as the dashboard sparklines: pre / live / post
  // per this ticker's own exchange session (incl. the pre-open ghost tail).
  const spark = $derived(buildTickerSpark(yahoo));
  const phase = $derived.by((): SparkPhase => {
    if (spark) return spark.phase;
    if (marketState === 'REGULAR') return 'live';
    if (marketState === 'PRE') return 'pre';
    return 'post';
  });

  // Last regular-session tick of the drawn session (never extended hours).
  const sessionLast = $derived(iPts[iPts.length - 1]?.close ?? null);

  // THE market price: prev close before the open, at/latest session price
  // otherwise; last daily candle close as the final fallback.
  const livePrice = $derived(
    phase === 'pre'
      ? prevClose ?? candles[candles.length - 1]?.close ?? null
      : sessionLast ?? prevClose ?? candles[candles.length - 1]?.close ?? null,
  );

  // Day change in native currency vs prev close — never shown pre-open.
  const dayChangeAbs = $derived(
    phase !== 'pre' && sessionLast != null && prevClose != null ? sessionLast - prevClose : null,
  );
  const dayChangePct = $derived(
    dayChangeAbs != null && prevClose ? (dayChangeAbs / prevClose) * 100 : null,
  );

  // Live day P&L in EUR from intraday ticks; null (rendered as —) pre-open
  // and without data — never a currency-driven number before the open.
  const dayPl = $derived.by((): number | null => {
    if (phase === 'pre') return null;
    if (pos && prevClose != null && sessionLast != null && pos.shares > 0) {
      return toEurLiveOrFallback(currency, pos.shares * (sessionLast - prevClose), intradayStore.liveRates);
    }
    return null;
  });

  /* ── Period state (persisted per page) ── */

  const LS_KEY = 'pt.stock.period';
  let period = $state<Period>('1d');
  onMount(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && PERIOD_OPTIONS.some((o) => o.value === saved)) period = saved as Period;
  });
  function selectPeriod(v: string) {
    period = v as Period;
    if (browser) localStorage.setItem(LS_KEY, v);
  }

  /* ── Candles: fetch max range once per symbol, slice client-side per period ── */

  $effect(() => {
    const sym = yahoo;
    if (!sym) { candles = []; return; }
    let stale = false;
    candlesLoading = true;
    fetchCandles(sym, '2000-01-01')
      .then((c) => { if (!stale) candles = c; })
      .catch(() => { if (!stale) candles = []; })
      .finally(() => { if (!stale) candlesLoading = false; });
    return () => { stale = true; };
  });

  /* ── 1D chart geometry ── */

  const intraSession = $derived.by(() => {
    // Session bounds in Brussels minutes-of-day. tradingPeriods.regular may
    // point at the next session when closed, but wall-clock minutes are the
    // same, so the conversion stays valid.
    const reg = iData?.tradingPeriods?.regular;
    let start = reg ? brusselsMinuteOfDay(reg.start) : null;
    let end   = reg ? brusselsMinuteOfDay(reg.end)   : null;
    if (start == null || end == null || end <= start) {
      const dateStr = iData?.date ?? new Date().toISOString().slice(0, 10);
      const b = sessionBounds(yahoo, dateStr);
      if (b) { start = brusselsMinuteOfDay(b.open); end = brusselsMinuteOfDay(b.close); }
    }
    if (start == null || end == null || end <= start) { start = 9 * 60; end = 22 * 60; }
    return { start, end };
  });

  const intraPoints = $derived(
    iPts.map((p) => ({ min: brusselsMinuteOfDay(p.ts), value: p.close })),
  );

  const intraTicks = $derived.by(() => {
    const { start, end } = intraSession;
    const span = end - start;
    // ~4 intervals, snapped to half hours (US 15:30–22:00 → 90min steps,
    // EU 09:00–17:30 → 120min steps).
    const step = Math.max(30, Math.round(span / 4 / 30) * 30);
    const ticks: { x: number; label: string }[] = [];
    for (let m = start; m <= end; m += step) ticks.push({ x: m, label: fmtMin(m) });
    return ticks;
  });

  // Pre-open ghost tail (today's pre-market ticks) in minutes-of-day.
  const ghostPoints = $derived(
    (spark?.ghostPoints ?? []).map((p) => ({ min: brusselsMinuteOfDay(p.ts), value: p.close })),
  );
  const ghostStart = $derived(spark?.ghostStart != null ? brusselsMinuteOfDay(spark.ghostStart) : null);
  const ghostEnd   = $derived(spark?.ghostEnd   != null ? brusselsMinuteOfDay(spark.ghostEnd)   : null);

  /* ── Market-state labels (chip, hero caption) ── */

  const openLabel  = $derived(fmtMin(intraSession.start));
  const closeLabel = $derived(fmtMin(intraSession.end));
  const chipLabel  = $derived(
    phase === 'live' ? 'OPEN' : phase === 'pre' ? `OPENS ${openLabel}` : 'CLOSED',
  );
  const heroCaption = $derived(
    phase === 'pre'
      ? `Prev close · market opens ${openLabel} CET`
      : phase === 'live'
        ? 'Market price · today'
        : `At close, ${closeLabel} CET`,
  );

  /* ── Responsive (design breakpoint: 900px) ── */

  const desktop = new MediaQuery('(min-width: 900px)');

  /* ── History chart geometry ── */

  const visibleCandles = $derived.by(() => {
    if (period === '1d') return [];
    const cutoff = periodCutoff(period);
    return cutoff ? candles.filter((c) => c.date >= cutoff) : candles;
  });

  const historyData = $derived(
    visibleCandles.map((c) => ({ x: Date.parse(c.date), value: c.close })),
  );

  const historyTicks = $derived.by(() => {
    const cs = visibleCandles;
    if (cs.length < 2) return [];
    const spanDays = (Date.parse(cs[cs.length - 1]!.date) - Date.parse(cs[0]!.date)) / 86_400_000;
    const yearly = spanDays > 800;
    const marks: { x: number; label: string }[] = [];
    let prevKey = cs[0]!.date.slice(0, yearly ? 4 : 7);
    for (const c of cs) {
      const key = c.date.slice(0, yearly ? 4 : 7);
      if (key !== prevKey) {
        prevKey = key;
        marks.push({
          x: Date.parse(c.date),
          label: yearly ? key : new Date(c.date).toLocaleDateString('en-US', { month: 'short' }),
        });
      }
    }
    const step = Math.max(1, Math.ceil(marks.length / 5));
    return marks.filter((_, i) => i % step === 0);
  });

  const formatPrice = $derived((v: number) => fmtNative(v, currency));

  /* ── Your history rows ── */

  function dateLabel(date: string): string {
    const mmdd = date.slice(5);
    const yr = date.slice(0, 4);
    return yr === String(new Date().getFullYear()) ? mmdd : `${mmdd} '${yr.slice(2)}`;
  }
  // Transactions carry no native per-share price, so derive the EUR per-share
  // price from costEur / |shares| (deviation from the "$44.71" prototype copy).
  function txDetail(t: Transaction): string {
    const d = dateLabel(t.date);
    if (t.shares === 0) return `Dividend · ${d}`;
    const perShare = Math.abs(t.costEur) / Math.abs(t.shares);
    const sh = Math.abs(t.shares).toLocaleString('en-US', { maximumFractionDigits: 4 });
    return `${sh} sh @ €${perShare.toFixed(2)} · ${d}`;
  }
  const historyItems = $derived(txs.map((t) => ({
    date: t.date, ticker: t.ticker, shares: t.shares, costEur: t.costEur, detail: txDetail(t),
  })));

  /* ── Display strings ── */

  const sharesStr = $derived(shares.toLocaleString('en-US', { maximumFractionDigits: 4 }));
  const avgCostNative = $derived(pos?.avgCostNative ?? null);
</script>

{#if portfolioStore.loaded && !known}
  <!-- Unknown ticker -->
  <div class="page">
    <div class="empty-state">
      <div class="empty-title">Unknown ticker</div>
      <div class="empty-sub">"{ticker}" isn't in your portfolio.</div>
      <a class="empty-back" href={resolve('/')}>&larr; Back to portfolio</a>
    </div>
  </div>
{:else}
  <div class="page">
    <!-- ── Top bar ── -->
    <div class="topbar">
      <a class="back-btn" href={resolve('/')} aria-label="Back to portfolio">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </a>
      <div class="topbar-id">
        <div class="topbar-ticker">{ticker}</div>
        <div class="topbar-sub">{meta.label ?? ticker} · {exchangeLabel(yahoo)}</div>
      </div>
      <div class="market-chip mono" class:open={phase === 'live'}>
        <span class="market-dot"></span>
        {chipLabel}
      </div>
    </div>

    <!-- ── Market hero: THE market price, native currency ── -->
    <div class="hero">
      <div class="hero-row">
        {#if livePrice != null}
          <div class="hero-price mono">{fmtNative(livePrice, currency)}</div>
        {:else}
          <div class="hero-price mono">—</div>
        {/if}
        {#if phase === 'pre'}
          <div class="hero-change mono pre-dash">—</div>
        {:else if dayChangeAbs != null && dayChangePct != null}
          <div class="hero-change mono" class:pos={dayChangeAbs >= 0} class:neg={dayChangeAbs < 0}>
            {fmtNativeSigned(dayChangeAbs, currency)} ({fmtPct(dayChangePct)})
          </div>
        {/if}
      </div>
      <div class="hero-caption">{heroCaption}</div>
    </div>

    <!-- ── Chart (full-bleed, market price only) ── -->
    <div class="chart-bleed">
      {#if period === '1d'}
        {#if prevClose != null}
          <PeriodChart
            mode="intraday"
            height={desktop.current ? 260 : 190}
            padX={desktop.current ? 24 : 20}
            formatY={formatPrice}
            points={intraPoints}
            {prevClose}
            sessionStart={intraSession.start}
            sessionEnd={intraSession.end}
            xTicks={phase === 'pre' ? [] : intraTicks}
            dimmed={phase === 'pre'}
            ghostPoints={phase === 'pre' ? ghostPoints : []}
            {ghostStart}
            {ghostEnd}
            topCaption={phase === 'pre' ? `Previous session · opens ${openLabel}` : null}
            showNow={phase === 'live'}
            emptyLabel="Market opens at {openLabel}"
          />
        {:else}
          <div class="chart-placeholder">No intraday data</div>
        {/if}
      {:else if historyData.length >= 2}
        <PeriodChart
          mode="history"
          height={desktop.current ? 260 : 190}
          padX={desktop.current ? 24 : 20}
          formatY={formatPrice}
          data={historyData}
          xTicks={historyTicks}
        />
      {:else}
        <div class="chart-placeholder">{candlesLoading ? 'Loading…' : 'No data for this period'}</div>
      {/if}
    </div>

    <!-- ── Period pills ── -->
    <div class="pills-row">
      <PeriodPills options={PERIOD_OPTIONS} selected={period} onselect={selectPeriod} />
    </div>

    <!-- ── Columns: position card + history (stacked on mobile) ── -->
    <div class="columns">

    <!-- ── Your position ── -->
    <div class="pos-card">
      <div class="pos-head">
        <div class="pos-title">Your position</div>
        <div class="pos-hint">all in €</div>
      </div>
      <div class="pos-value-row">
        <div class="pos-value mono"><PrivacyValue value={fmtEur(value)} /></div>
        <div class="pos-pl mono" class:pos={pl >= 0} class:neg={pl < 0}>
          <PrivacyValue value="{fmtEurSigned(pl)} ({fmtPct1(plPct)})" />
        </div>
      </div>
      <div class="pos-grid">
        <div class="stat">
          <div class="stat-label">Shares</div>
          <div class="stat-val mono"><PrivacyValue value={sharesStr} /></div>
        </div>
        <div class="stat">
          <div class="stat-label">Avg cost</div>
          {#if avgCostNative != null}
            <div class="stat-val mono">{fmtNative(avgCostNative, currency)}</div>
            <div class="stat-sub">{fmtNative(pos?.avgCost ?? 0, 'EUR')} /sh</div>
          {:else}
            <div class="stat-val mono">{fmtNative(pos?.avgCost ?? 0, 'EUR')}</div>
          {/if}
        </div>
        <div class="stat">
          <div class="stat-label">Today</div>
          {#if dayPl != null}
            <div class="stat-val mono" class:pos={dayPl >= 0} class:neg={dayPl < 0}>
              <PrivacyValue value={fmtEurSigned(dayPl)} />
            </div>
          {:else}
            <div class="stat-val mono pre-dash">—</div>
          {/if}
        </div>
        <div class="stat">
          <!-- FIFO cost of the shares still held — not total deposits -->
          <div class="stat-label">Cost basis</div>
          <div class="stat-val mono"><PrivacyValue value={fmtEur(cost)} /></div>
        </div>
        <div class="stat">
          <div class="stat-label">Weight</div>
          <div class="stat-val mono">{weightPct.toFixed(1)}%</div>
        </div>
        <div class="stat">
          <div class="stat-label">Dividends</div>
          <div class="stat-val mono"><PrivacyValue value={fmtEur(dividends)} /></div>
        </div>
      </div>
    </div>

    <!-- ── Your history ── -->
    {#if historyItems.length > 0}
      <div class="history">
        <div class="history-title">Your history</div>
        <ActivityList items={historyItems} showTicker={false} />
      </div>
    {/if}

    </div>
  </div>
{/if}

<style>
  .page {
    max-width: 560px;
    margin: 0 auto;
    padding: 20px 20px 90px;
    background: var(--bg);
  }
  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
  }
  .pos { color: var(--c-pos); }
  .neg { color: var(--c-neg); }
  .pre-dash { color: var(--spark-dim); }

  /* ── Top bar ── */
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 0 18px;
  }
  .back-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-hover);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg);
    text-decoration: none;
    flex-shrink: 0;
  }
  .back-btn:hover { background: var(--surface-3); }
  .topbar-id { min-width: 0; }
  .topbar-ticker { font-size: 15px; font-weight: 700; line-height: 1.1; }
  .topbar-sub {
    font-size: 11px;
    color: var(--fg-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .market-chip {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    color: var(--fg-faint);
    flex-shrink: 0;
  }
  .market-chip.open { color: var(--c-pos); }
  .market-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  /* ── Market hero ── */
  .hero { margin-bottom: 4px; }
  .hero-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .hero-price {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }
  .hero-change { font-size: 14px; font-weight: 600; }
  .hero-caption { font-size: 11px; color: var(--fg-faint); margin-top: 4px; }

  /* ── Chart ── */
  .chart-bleed { margin: 8px -20px 0; }
  .chart-placeholder {
    height: 190px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--fg-faint);
  }
  .pills-row { margin-top: 8px; }

  /* ── Columns: position card + history ── */
  .columns {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 26px 56px;
    margin-top: 24px;
  }

  /* ── Your position card ── */
  .pos-card {
    flex: 1 1 340px;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    padding: 16px 18px;
  }
  .pos-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .pos-title { font-size: 13px; font-weight: 600; }
  .pos-hint { font-size: 11px; color: var(--fg-faint); }
  .pos-value-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .pos-value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .pos-pl { font-size: 13px; font-weight: 600; }
  .pos-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--hairline);
  }
  .stat-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
    margin-bottom: 3px;
  }
  .stat-val { font-size: 14px; font-weight: 600; }
  .stat-sub { font-size: 10px; color: var(--fg-faint); margin-top: 1px; }

  /* ── Your history ── */
  .history { flex: 1 1 340px; min-width: 0; }
  .history-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }

  /* ── Desktop (≥900px) — drill-in page: no top nav, back-button header stays ── */
  @media (min-width: 900px) {
    .page {
      max-width: 1160px;
      padding: 14px 24px 60px;
    }
    .hero-price { font-size: 42px; }
    .chart-bleed { margin: 8px -24px 0; }
    .chart-placeholder { height: 260px; }
    .pills-row { max-width: 440px; }
  }

  /* ── Unknown ticker ── */
  .empty-state {
    padding: 60px 0;
    text-align: center;
  }
  .empty-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
  .empty-sub { font-size: 12px; color: var(--fg-faint); margin-bottom: 16px; }
  .empty-back {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--fg);
    text-decoration: none;
  }
  .empty-back:hover { text-decoration: underline; }
</style>
