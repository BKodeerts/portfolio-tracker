<script lang="ts">
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { getColor } from '$lib/utils/color';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import SettingsGear from '$lib/components/shared/SettingsGear.svelte';
  import type { Transaction } from '$lib/types/transaction';

  type Kind = 'BUY' | 'SELL' | 'DIV';
  type Filter = 'all' | Kind;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',  label: 'All' },
    { key: 'BUY',  label: 'Buys' },
    { key: 'SELL', label: 'Sells' },
    { key: 'DIV',  label: 'Dividends' },
  ];

  let filter = $state<Filter>('all');

  /**
   * Same rule as the Dashboard's activity preview: >0 BUY, <0 SELL, ===0 DIV —
   * plus the server's `type: 'dividend'` tag (server/domain/positions.js isDividend).
   */
  function kindOf(tx: Transaction): Kind {
    if (tx.type === 'dividend' || tx.shares === 0) return 'DIV';
    return tx.shares > 0 ? 'BUY' : 'SELL';
  }

  /** Design-handoff amount format: `€1,234` from 1k up (rounded), else `€12.34` with a trailing .00 stripped. */
  function fmtAmt(v: number): string {
    const abs = Math.abs(v);
    const str = abs >= 1000
      ? Math.round(abs).toLocaleString('en-US')
      : abs.toFixed(2).replace(/\.00$/, '');
    return `${v < 0 ? '-' : ''}€${str}`;
  }
  const fmtAmtSigned = (v: number): string => (v >= 0 ? '+' : '-') + fmtAmt(Math.abs(v));

  const sorted = $derived(
    [...portfolioStore.rawTransactions].sort((a, b) => b.date.localeCompare(a.date)),
  );

  // ── Year summary — over ALL transactions, regardless of the active filter ──
  const year = new Date().getFullYear();
  const netInvested = $derived.by(() => {
    let net = 0;
    for (const tx of sorted) {
      if (!tx.date.startsWith(String(year))) continue;
      const kind = kindOf(tx);
      if (kind === 'BUY') net += tx.costEur;
      else if (kind === 'SELL') net -= tx.costEur;
    }
    return net;
  });
  // Realized P&L and dividends are FIFO money math — server-computed per year (annualPl).
  const annual    = $derived(portfolioStore.annualPl.find((y) => y.year === String(year)));
  const realized  = $derived(annual?.realizedPl ?? 0);
  const dividends = $derived(annual?.dividends ?? 0);

  // ── Filtered list, grouped by month (newest first) ──
  const filtered = $derived(filter === 'all' ? sorted : sorted.filter((tx) => kindOf(tx) === filter));

  interface MonthGroup { key: string; label: string; net: number; txs: Transaction[] }
  const groups = $derived.by(() => {
    const out: MonthGroup[] = [];
    const byKey = new Map<string, MonthGroup>();
    for (const tx of filtered) {
      const key = tx.date.slice(0, 7);
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          label: new Date(`${key}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
          net: 0,
          txs: [],
        };
        byKey.set(key, g);
        out.push(g);
      }
      // cash-flow sign: sells + dividends in, buys out
      g.net += kindOf(tx) === 'BUY' ? -tx.costEur : tx.costEur;
      g.txs.push(tx);
    }
    return out;
  });

  const emptyLabel = $derived(
    filter === 'all' ? 'activity' : (FILTERS.find((f) => f.key === filter)?.label ?? '').toLowerCase(),
  );
  const firstMonth = $derived.by(() => {
    const oldest = sorted[sorted.length - 1];
    if (!oldest) return '';
    return new Date(`${oldest.date.slice(0, 7)}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });

  function nameOf(tx: Transaction): string {
    return tx.label ?? portfolioStore.tickerMeta[tx.ticker]?.label ?? '';
  }
  function detailOf(tx: Transaction): string {
    if (kindOf(tx) === 'DIV') return 'cash dividend';
    // costEur is stored EUR-converted, so non-EUR tickers show an approximate per-share price
    const ccy = tx.currency ?? portfolioStore.tickerMeta[tx.ticker]?.currency ?? 'EUR';
    const prefix = ccy === 'EUR' ? '€' : '≈€';
    return `${Math.abs(tx.shares)} sh @ ${prefix}${(tx.costEur / Math.abs(tx.shares)).toFixed(2)}`;
  }
  function dateOf(tx: Transaction): string {
    return new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
</script>

<!-- Mobile title bar (desktop uses the global top nav) -->
<div class="topbar">
  <div class="topbar-title">Activity</div>
  <SettingsGear />
</div>

<div class="activity-page">

  <!-- ── Year summary — unaffected by the filter ── -->
  <div class="summary">
    <div>
      <div class="sum-label">Net invested · {year}</div>
      <div class="sum-value mono"><PrivacyValue value={fmtAmt(netInvested)} /></div>
    </div>
    <div>
      <div class="sum-label">Realized P&amp;L</div>
      <div class="sum-value mono" class:pos={realized >= 0} class:neg={realized < 0}>
        <PrivacyValue value={fmtAmtSigned(realized)} />
      </div>
    </div>
    <div>
      <div class="sum-label">Dividends</div>
      <div class="sum-value mono"><PrivacyValue value={fmtAmt(dividends)} /></div>
    </div>
  </div>

  <!-- ── Filter chips — apply to the list only ── -->
  <div class="chips">
    {#each FILTERS as f (f.key)}
      <button class="chip" class:active={filter === f.key} onclick={() => (filter = f.key)}>
        {f.label}
      </button>
    {/each}
  </div>

  <!-- ── Transaction list, grouped by month ── -->
  <div class="list">
    {#each groups as g (g.key)}
      <div class="month-head">
        <div class="month-label">{g.label}</div>
        <div class="month-net mono">net <PrivacyValue value={fmtAmtSigned(g.net)} /></div>
      </div>
      {#each g.txs as tx, i (`${g.key}-${i}`)}
        {@const kind = kindOf(tx)}
        <a class="row" href={resolve('/stock/[ticker]', { ticker: tx.ticker })}>
          <span class="kind-chip {kind.toLowerCase()}">{kind}</span>
          <div class="row-main">
            <div class="row-top">
              <span class="tsquare" style="background:{getColor(tx.ticker)}"></span>
              <span class="row-ticker">{tx.ticker}</span>
              <span class="row-name">{nameOf(tx)}</span>
            </div>
            <div class="row-detail mono">{detailOf(tx)}</div>
          </div>
          <div class="row-right">
            <div class="row-amt mono" class:sell={kind === 'SELL'} class:div={kind === 'DIV'}>
              <PrivacyValue value={kind === 'BUY' ? `-${fmtAmt(tx.costEur)}` : `+${fmtAmt(tx.costEur)}`} />
            </div>
            <div class="row-date">{dateOf(tx)}</div>
          </div>
        </a>
      {/each}
    {/each}

    {#if filtered.length === 0}
      <div class="empty-row">No {emptyLabel} in this period.</div>
    {/if}

    {#if firstMonth}
      <div class="foot-caption">Showing all activity since {firstMonth}</div>
    {/if}
  </div>
</div>

<style>
  /* ── Mobile title bar ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px 0;
  }
  .topbar-title { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }

  .activity-page {
    max-width: 1160px;
    margin: 0 auto;
    padding: 18px 0 110px;
    --page-pad: 20px;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
  }

  /* ── Year summary ── */
  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px 28px;
    margin: 6px var(--page-pad) 0;
  }
  .sum-label { font-size: 11px; color: var(--fg-faint); margin-bottom: 4px; }
  .sum-value { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
  .sum-value.pos { color: var(--c-pos); }
  .sum-value.neg { color: var(--c-neg); }

  /* ── Filter chips ── */
  .chips {
    display: flex;
    gap: 6px;
    margin: 26px var(--page-pad) 0;
  }
  .chip {
    padding: 6px 13px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 8px;
    border: 1px solid var(--border-2);
    background: transparent;
    color: var(--fg-faint);
    cursor: pointer;
    user-select: none;
    font-family: inherit;
    letter-spacing: inherit;
  }
  .chip.active {
    font-weight: 700;
    color: var(--fg);
    background: var(--pill-selected-bg);
    border-color: transparent;
  }

  /* ── Month groups ── */
  .list {
    max-width: 720px;
    padding: 0 var(--page-pad);
  }
  .month-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 26px 0 2px;
  }
  .month-label { font-size: 13px; font-weight: 600; letter-spacing: 0.01em; }
  .month-net   { font-size: 11px; color: var(--fg-faint); }

  /* ── Rows ── */
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 0;
    border-bottom: 1px solid var(--hairline);
    text-decoration: none;
    color: inherit;
    transition: background 0.12s;
  }
  .row:hover { background: var(--row-hover); }

  .kind-chip {
    width: 34px;
    text-align: center;
    padding: 3px 0;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .kind-chip.buy  { background: var(--c-pos-tint); color: var(--c-pos); }
  .kind-chip.sell { background: var(--c-neg-tint); color: var(--c-neg); }
  .kind-chip.div  { background: var(--c-div-tint); color: var(--c-div); }

  .row-main { min-width: 0; flex: 1; }
  .row-top  { display: flex; align-items: center; gap: 6px; }
  .tsquare  { width: 6px; height: 6px; border-radius: 2px; flex-shrink: 0; }
  .row-ticker { font-size: 13px; font-weight: 700; }
  .row-name {
    font-size: 11px;
    color: var(--fg-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .row-detail { font-size: 10px; color: var(--fg-faint); margin-top: 3px; }

  .row-right { text-align: right; flex-shrink: 0; }
  .row-amt { font-size: 13.5px; font-weight: 700; color: var(--fg); }
  .row-amt.sell { color: var(--c-pos); }
  .row-amt.div  { color: var(--c-div); }
  .row-date { font-size: 10px; color: var(--chart-axis-label); margin-top: 3px; }

  .empty-row {
    font-size: 12px;
    color: var(--fg-faint);
    padding: 32px 0;
    text-align: center;
  }
  .foot-caption { font-size: 11px; color: var(--chart-axis-label); padding: 18px 0 0; }

  /* ── Desktop (≥900px) ── */
  @media (min-width: 900px) {
    .topbar { display: none; }
    .activity-page { --page-pad: 24px; }
    .summary { grid-template-columns: repeat(3, minmax(0, 220px)); }
    .sum-value { font-size: 24px; }
  }
</style>
