<script lang="ts">
  import { resolve } from '$app/paths';
  import { browser } from '$app/environment';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmtPct1 } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import PeriodPills from '$lib/components/shared/PeriodPills.svelte';
  import AllocationBar from '$lib/components/shared/AllocationBar.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';

  // ── Performance ──────────────────────────────────────────────────────────────

  const twr = $derived(portfolioStore.twrPct);
  const irr = $derived(portfolioStore.irrPct);

  /** "since Jan 2023" from the first chart point; falls back to method label. */
  const twrSub = $derived(() => {
    const first = portfolioStore.chartData[0];
    if (!first) return 'time-weighted';
    const d = new Date(first.date);
    return `since ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  });

  // ── Return by position ───────────────────────────────────────────────────────

  const returnBars = $derived(() => {
    const positions = [...portfolioStore.positions].sort((a, b) => b.plPct - a.plPct);
    if (!positions.length) return [];
    // Default domain −20%..+120%; expand to fit outliers, keeping zero placed correctly.
    const lo = Math.min(-20, ...positions.map((p) => p.plPct));
    const hi = Math.max(120, ...positions.map((p) => p.plPct));
    const span = hi - lo || 1;
    const zeroPct = ((0 - lo) / span) * 100;
    return positions.map((p) => {
      const vPct = ((p.plPct - lo) / span) * 100;
      return {
        ticker: p.ticker,
        color: getColor(p.ticker),
        zeroLeft: zeroPct,
        barLeft: Math.min(zeroPct, vPct),
        barWidth: Math.max(0.5, Math.abs(vPct - zeroPct)),
        pos: p.plPct >= 0,
        pctStr: fmtPct1(p.plPct),
      };
    });
  });

  // ── Rolling returns ──────────────────────────────────────────────────────────

  // Backend keys → display labels (same keys the old analysis page used)
  const ROLLING_PERIODS: Array<[string, string]> = [
    ['1w', '1W'], ['1m', '1M'], ['3m', '3M'], ['ytd', 'YTD'], ['1y', '1Y'], ['inception', 'Max'],
  ];

  const rollingTiles = $derived(() => {
    const rr = portfolioStore.rollingReturns;
    return ROLLING_PERIODS.map(([key, label]) => {
      const v = rr?.[key]?.portfolio ?? null;
      return { label, value: v };
    });
  });

  // ── Risk ─────────────────────────────────────────────────────────────────────

  const rm = $derived(portfolioStore.riskMetrics);

  const riskRows = $derived(() => {
    const dd = rm?.maxDrawdownPct ?? null;
    return [
      { label: 'Volatility',   sub: 'annualized, full history', value: rm?.volatility != null ? fmtPct1(rm.volatility) : null, neg: false },
      { label: 'Max drawdown', sub: 'worst peak-to-trough',     value: dd != null ? fmtPct1(-Math.abs(dd)) : null,             neg: true },
      { label: 'Sharpe',       sub: 'return per unit of risk',  value: rm?.sharpe != null ? rm.sharpe.toFixed(2) : null,       neg: false },
      { label: 'Sortino',      sub: 'downside risk only',       value: rm?.sortino != null ? rm.sortino.toFixed(2) : null,     neg: false },
      { label: 'Beta',         sub: 'vs VWCE All-World',        value: rm?.beta != null ? rm.beta.toFixed(2) : null,           neg: false },
    ];
  });

  /** Share of total value in the top-3 positions; null hides the note. */
  const concentrationPct = $derived(() => {
    const positions = portfolioStore.positions;
    if (positions.length < 4) return null;
    const total = positions.reduce((s, p) => s + p.value, 0);
    if (total <= 0) return null;
    const top3 = [...positions].sort((a, b) => b.value - a.value).slice(0, 3);
    const pct = Math.round((top3.reduce((s, p) => s + p.value, 0) / total) * 100);
    return pct >= 50 ? pct : null;
  });

  // ── Allocation ───────────────────────────────────────────────────────────────

  type Dim = 'ticker' | 'sector' | 'currency';
  const DIM_OPTIONS = [
    { value: 'ticker', label: 'Ticker' },
    { value: 'sector', label: 'Sector' },
    { value: 'currency', label: 'Currency' },
  ];
  const DIM_STORAGE_KEY = 'analysis.dim';
  const PALETTE = ['var(--accent)', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#10b981', '#06b6d4', '#f97316'];

  let dim = $state<Dim>('ticker');
  if (browser) {
    const saved = localStorage.getItem(DIM_STORAGE_KEY);
    if (saved === 'ticker' || saved === 'sector' || saved === 'currency') dim = saved;
  }
  function setDim(v: string) {
    dim = v as Dim;
    if (browser) localStorage.setItem(DIM_STORAGE_KEY, v);
  }

  function toPctItems(entries: [string, number][]) {
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([name, v], i) => ({ name, pct: (v / total) * 100, color: PALETTE[i % PALETTE.length]! }));
  }

  const allocItems = $derived(() => {
    const positions = portfolioStore.positions;
    if (dim === 'ticker') {
      const total = positions.reduce((s, p) => s + p.value, 0) || 1;
      return [...positions]
        .sort((a, b) => b.value - a.value)
        .map((p) => ({ name: p.ticker, pct: (p.value / total) * 100, color: getColor(p.ticker) }));
    }
    if (dim === 'sector') {
      const map: Record<string, number> = {};
      for (const p of positions) {
        const s = portfolioStore.tickerMeta[p.ticker]?.sector ?? 'Other';
        map[s] = (map[s] ?? 0) + p.value;
      }
      return toPctItems(Object.entries(map));
    }
    return toPctItems(Object.entries(portfolioStore.currencyExposure ?? {}));
  });
</script>

{#snippet rollingReturns()}
  <h2 class="sect-title" style="margin-bottom:8px">Rolling returns</h2>
  <div class="rr-grid">
    {#each rollingTiles() as t (t.label)}
      {#if t.value != null}
        <div class="rr-tile" class:tint-pos={t.value >= 0} class:tint-neg={t.value < 0}>
          <div class="rr-val mono {t.value >= 0 ? 'c-pos' : 'c-neg'}">{fmtPct1(t.value)}</div>
          <div class="rr-period">{t.label}</div>
        </div>
      {:else}
        <div class="rr-tile tint-null">
          <div class="rr-val mono null-val">–</div>
          <div class="rr-period">{t.label}</div>
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<div class="analysis-page">

  <!-- ── Header (mobile only — desktop uses the global top nav) ── -->
  <div class="head-row">
    <h1 class="page-title">Analysis</h1>
    <a href={resolve('/settings')} class="gear-btn" title="Settings" aria-label="Settings">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </a>
  </div>

  {#if portfolioStore.loaded && portfolioStore.positions.length > 0}

    <!-- ── Performance row: TWR/IRR pair + rolling returns (desktop) ── -->
    <div class="perf-row">
      <section class="perf-grid">
        <div>
          <div class="kpi-label">Total return (TWR)</div>
          <div class="kpi-value mono {twr != null ? (twr >= 0 ? 'c-pos' : 'c-neg') : 'null-val'}">
            <PrivacyValue value={twr != null ? fmtPct1(twr) : '–'} />
          </div>
          <div class="kpi-sub">{twrSub()}</div>
        </div>
        <div>
          <div class="kpi-label">Annualized (IRR)</div>
          <div class="kpi-value mono {irr != null ? (irr >= 0 ? 'c-pos' : 'c-neg') : 'null-val'}">
            <PrivacyValue value={irr != null ? fmtPct1(irr) : '–'} />
          </div>
          <div class="kpi-sub">money-weighted</div>
        </div>
      </section>
      <div class="rr-desktop">{@render rollingReturns()}</div>
    </div>

    <!-- ── Columns: positions + risk left, allocation right (single column on mobile) ── -->
    <div class="columns">

      <div class="col-main">
        <!-- ── Return by position ── -->
        <section>
          <div class="sect-head">
            <h2 class="sect-title">Return by position</h2>
            <span class="sect-hint">% since purchase</span>
          </div>
          {#each returnBars() as b (b.ticker)}
            <div class="ret-row">
              <div class="ret-id">
                <span class="tdot" style="background:{b.color}"></span>
                <span class="ret-ticker">{b.ticker}</span>
              </div>
              <div class="ret-track">
                <div class="ret-zero" style="left:{b.zeroLeft}%"></div>
                <div class="ret-bar {b.pos ? 'pos' : 'neg'}" style="left:{b.barLeft}%; width:{b.barWidth}%"></div>
              </div>
              <div class="ret-pct mono {b.pos ? 'c-pos' : 'c-neg'}">{b.pctStr}</div>
            </div>
          {/each}
        </section>

        <!-- ── Rolling returns (mobile position — handoff 1 order) ── -->
        <section class="rr-mobile">{@render rollingReturns()}</section>

        <!-- ── Risk ── -->
        <section class="risk-sect">
          <h2 class="sect-title" style="margin-bottom:2px">Risk</h2>
          {#each riskRows() as r (r.label)}
            <div class="risk-row">
              <div>
                <div class="risk-label">{r.label}</div>
                <div class="risk-sub">{r.sub}</div>
              </div>
              <div class="risk-val mono" class:c-neg={r.neg && r.value != null} class:null-val={r.value == null}>
                {r.value ?? '–'}
              </div>
            </div>
          {/each}
          {#if concentrationPct() != null}
            <div class="conc-note">
              Concentration: {concentrationPct()}% of the portfolio sits in 3 names.
            </div>
          {/if}
        </section>
      </div>

      <div class="col-side">
        <!-- ── Allocation ── -->
        <section>
          <div class="sect-head center" style="margin-bottom:10px">
            <h2 class="sect-title">Allocation</h2>
            <PeriodPills options={DIM_OPTIONS} selected={dim} onselect={setDim} size="small" />
          </div>
          <AllocationBar items={allocItems()} legend="rows" />
        </section>
      </div>

    </div>

  {:else if portfolioStore.loaded}
    <div class="empty-msg">Add transactions to see the analysis.</div>
  {/if}

</div>

<style>
  .analysis-page {
    padding: 14px 20px 90px;
    max-width: 560px;
    margin: 0 auto;
    background: var(--bg);
  }

  /* ── Performance row / columns (flex only ≥900px; block flow on mobile) ── */
  .perf-row { margin-bottom: 24px; }
  .rr-desktop { display: none; }
  .columns {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 24px 56px;
  }
  .col-main { flex: 2 1 480px; min-width: 0; }
  .col-side { flex: 1 1 300px; min-width: 0; }
  .rr-mobile { margin-top: 24px; }
  .risk-sect { margin-top: 24px; }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
  }
  .c-pos { color: var(--c-pos); }
  .c-neg { color: var(--c-neg); }
  .null-val { color: var(--fg-faint); }

  /* ── Header ── */
  .head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .page-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .gear-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-hover);
    color: var(--fg);
    text-decoration: none;
    transition: background 0.12s;
  }
  .gear-btn:hover { background: var(--surface-3); }

  /* ── Section headers ── */
  .sect-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .sect-head.center { align-items: center; }
  .sect-title {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }
  .sect-hint { font-size: 11px; color: var(--fg-faint); }

  /* ── Performance ── */
  .perf-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .kpi-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
    margin-bottom: 4px;
  }
  .kpi-value {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .kpi-sub {
    font-size: 11px;
    color: var(--fg-faint);
    margin-top: 2px;
  }

  /* ── Return by position ── */
  .ret-row {
    display: grid;
    grid-template-columns: 44px 1fr 58px;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
  }
  .ret-id { display: flex; align-items: center; gap: 6px; }
  .tdot {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .ret-ticker { font-size: 12px; font-weight: 700; }
  .ret-track { position: relative; height: 14px; }
  .ret-zero {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border-2);
  }
  .ret-bar {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 3px;
  }
  .ret-bar.pos { background: color-mix(in srgb, var(--c-pos) 55%, transparent); }
  .ret-bar.neg { background: color-mix(in srgb, var(--c-neg) 55%, transparent); }
  .ret-pct {
    font-size: 11.5px;
    font-weight: 600;
    text-align: right;
  }

  /* ── Rolling returns ── */
  .rr-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .rr-tile {
    text-align: center;
    padding: 10px 2px;
    border-radius: 10px;
  }
  .rr-tile.tint-pos { background: var(--c-pos-tint); }
  .rr-tile.tint-neg { background: var(--c-neg-tint); }
  .rr-tile.tint-null { background: var(--surface-2); }
  .rr-val { font-size: 12px; font-weight: 700; }
  .rr-period {
    font-size: 10px;
    color: var(--fg-faint);
    margin-top: 3px;
  }

  /* ── Risk ── */
  .risk-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .risk-label { font-size: 12.5px; font-weight: 500; }
  .risk-sub {
    font-size: 10.5px;
    color: var(--fg-faint);
    margin-top: 1px;
  }
  .risk-val { font-size: 13px; font-weight: 600; }

  .conc-note {
    margin-top: 10px;
    padding: 10px 12px;
    background: var(--warn-tint);
    border-radius: 10px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--warn-fg);
  }

  /* ── Misc ── */
  .empty-msg {
    padding: 32px 0;
    text-align: center;
    font-size: 13px;
    color: var(--fg-muted);
  }

  /* ── Desktop (≥900px) ── */
  @media (min-width: 900px) {
    .analysis-page {
      max-width: 1160px;
      padding: 18px 24px 96px;
    }
    /* Global top nav replaces the page's own title row */
    .head-row { display: none; }

    /* Performance row: TWR/IRR pair left, rolling returns right */
    .perf-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 24px 56px;
      margin-bottom: 30px;
    }
    .perf-grid { flex: 0 1 340px; min-width: 260px; }
    .rr-desktop { display: block; flex: 1 1 420px; min-width: 300px; }
    .rr-mobile { display: none; }
    .kpi-value { font-size: 30px; }

    /* Position bars gain real width — slightly taller rows */
    .ret-row { padding: 8px 0; }
    .risk-sect { margin-top: 28px; }
  }
</style>
