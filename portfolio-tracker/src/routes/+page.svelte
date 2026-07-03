<script lang="ts">
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmt } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import { getLiveData, buildCards, getMovers } from '$lib/derived/dashboard';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import HeroSummary from '$lib/components/dashboard/HeroSummary.svelte';
  import ChartCard from '$lib/components/dashboard/ChartCard.svelte';
  import PositionsTable from '$lib/components/dashboard/PositionsTable.svelte';
  import PositionCards from '$lib/components/dashboard/PositionCards.svelte';

  type PosView = 'table' | 'cards';

  let posView = $state<PosView>('table');

  // ── Portfolio summary values ────────────────────────────────────────────────
  const liveData      = $derived(getLiveData());
  const totalValue    = $derived(liveData?.value ?? portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const totalPl       = $derived(totalValue - portfolioStore.totalInvested);
  const totalPlPct    = $derived(portfolioStore.totalInvested > 0 ? (totalPl / portfolioStore.totalInvested) * 100 : 0);
  const totalDayPl    = $derived(liveData?.dayPl ?? portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0));
  const totalDayPlPct = $derived(totalValue - totalDayPl > 0 ? (totalDayPl / (totalValue - totalDayPl)) * 100 : 0);

  // ── Intraday cards / movers / day P&L per ticker ────────────────────────────
  const cards  = $derived(buildCards());
  const movers = $derived(getMovers(cards));

  const dayPlMap = $derived(() => {
    const m: Record<string, number | null> = {};
    for (const c of cards) m[c.ticker] = c.changeEur;
    return m;
  });
  const dayPctMap = $derived(() => {
    const m: Record<string, number | null> = {};
    for (const c of cards) m[c.ticker] = c.changePct;
    return m;
  });

  // ── Allocation from currency exposure ───────────────────────────────────────
  const allocationItems = $derived(() => {
    const entries = Object.entries(portfolioStore.currencyExposure ?? {});
    if (!entries.length) return [];
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries
      .map(([name, val]) => ({ name, pct: (val / total) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  });

  const ALLOC_COLORS = ['var(--accent)', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#10b981', '#f97316'];

  // ── Recent transactions ─────────────────────────────────────────────────────
  const recentTx = $derived([...portfolioStore.rawTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6));
</script>

<div class="page-root">

  <!-- ── Hero: 3-card split (desktop) + compact card (mobile) ──────────────── -->
  {#if portfolioStore.loaded}
    <HeroSummary {totalValue} {totalPl} {totalPlPct} {totalDayPl} {totalDayPlPct} {movers} />
  {/if}

  <!-- ── Chart card ─────────────────────────────────────────────────────────── -->
  <ChartCard />

  <!-- ── Positions: A/B toggle ─────────────────────────────────────────────── -->
  {#if portfolioStore.positions.length > 0}
    <div class="card" style="overflow:hidden;margin-bottom:12px">
      <!-- Header with toggle -->
      <div class="pos-section-header">
        <div>
          <div class="h-md">Posities</div>
          <div class="h-sm" style="margin-top:2px">{portfolioStore.positions.length} actieve · <PrivacyValue value={fmt(totalValue)} /></div>
        </div>
        <div class="seg">
          <button class="seg-btn" class:on={posView === 'table'} onclick={() => (posView = 'table')} title="Tabel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <button class="seg-btn" class:on={posView === 'cards'} onclick={() => (posView = 'cards')} title="Cards">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
          </button>
        </div>
      </div>

      {#if posView === 'table'}
        <PositionsTable dayPl={dayPlMap()} dayPct={dayPctMap()} />
      {:else}
        <PositionCards dayPl={dayPlMap()} dayPct={dayPctMap()} />
      {/if}
    </div>
  {/if}

  <!-- ── Bottom row: allocation + recent transactions ──────────────────────── -->
  {#if portfolioStore.loaded}
    <div class="bottom-grid">

      <!-- Allocation by currency -->
      <div class="card" style="padding:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="h-md">Allocatie</div>
          <div class="h-sm">Valuta</div>
        </div>
        {#each allocationItems() as item, i}
          <div style="display:grid;grid-template-columns:60px 1fr 48px;gap:10px;align-items:center;margin-bottom:10px">
            <div style="font-size:12px;font-weight:600">{item.name}</div>
            <div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
              <div style="width:{item.pct}%;height:100%;background:{ALLOC_COLORS[i % ALLOC_COLORS.length]};border-radius:3px;transition:width .3s"></div>
            </div>
            <div class="mono" style="font-size:11px;font-weight:600;text-align:right">{item.pct.toFixed(1)}%</div>
          </div>
        {/each}
        {#if !allocationItems().length}
          <div class="h-sm c-muted">Geen data beschikbaar</div>
        {/if}
      </div>

      <!-- Recent transactions -->
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
          <div class="h-md">Recente transacties</div>
          <a href={resolve('/transactions')} class="h-sm" style="cursor:pointer;text-decoration:underline;color:var(--fg-muted)">Alle bekijken</a>
        </div>
        {#each recentTx as tx, i}
          {@const isBuy = (tx.shares ?? 0) > 0}
          <div class="tx-row" style="border-bottom:{i < recentTx.length - 1 ? '1px solid var(--border)' : 'none'}">
            <div class="mono h-sm" style="font-size:11px;width:64px;flex-shrink:0">{tx.date.slice(5)}</div>
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
              <span class="dot" style="background:{getColor(tx.ticker)}"></span>
              <span style="font-size:12px;font-weight:600">{tx.ticker}</span>
            </div>
            <span class="tx-kind-pill" class:buy={isBuy} class:sell={!isBuy}>{isBuy ? 'KOOP' : 'VERKOOP'}</span>
            <div class="mono" style="font-size:12px;font-weight:600;text-align:right"><PrivacyValue value={fmt(tx.costEur)} /></div>
          </div>
        {/each}
        {#if !recentTx.length}
          <div style="padding:16px 18px" class="h-sm c-muted">Geen transacties</div>
        {/if}
      </div>

    </div>
  {/if}

  <div class="footer">
    Actief: {portfolioStore.currentTickers.join(', ')} · Geen financieel advies · Zelf gehosted
  </div>
</div>

<style>
  /* ── Positions section header ─────────────────────────── */
  .pos-section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px; border-bottom: 1px solid var(--border);
  }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }

  /* ── Bottom grid ──────────────────────────────────────── */
  .bottom-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; }

  @media (max-width: 700px) {
    .bottom-grid { grid-template-columns: 1fr; }
  }

  /* ── Recent tx rows ───────────────────────────────────── */
  .tx-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 18px;
  }
  .tx-kind-pill {
    display: inline-flex; align-items: center;
    padding: 2px 7px; border-radius: 999px;
    font-size: 9px; font-weight: 700; letter-spacing: 0.03em; flex-shrink: 0;
  }
  .tx-kind-pill.buy  { background: var(--c-pos-bg); color: var(--c-pos); }
  .tx-kind-pill.sell { background: var(--c-neg-bg); color: var(--c-neg); }

  /* ── Footer ───────────────────────────────────────────── */
  .footer { margin-top: 24px; padding: 12px 0; text-align: center; font-size: 11px; color: var(--fg-muted); }
</style>
