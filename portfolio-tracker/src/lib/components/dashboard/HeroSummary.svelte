<script lang="ts">
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import MoversStrip from './MoversStrip.svelte';
  import type { Movers } from '$lib/derived/dashboard';

  /** Hero: 3-card split on desktop, single compact card on mobile. */
  interface Props {
    totalValue: number;
    totalPl: number;
    totalPlPct: number;
    totalDayPl: number;
    totalDayPlPct: number;
    movers: Movers;
  }
  const { totalValue, totalPl, totalPlPct, totalDayPl, totalDayPlPct, movers }: Props = $props();

  function signed(v: number) { return `${v >= 0 ? '+' : ''}${fmt(v)}`; }
</script>

<!-- DESKTOP / TABLET: 3-card split -->
<div class="hero-c desktop-hero">

  <!-- Card 1: Total value -->
  <div class="card hero-total">
    <div class="h-eyebrow" style="margin-bottom:8px">Totale waarde</div>
    <div class="h-xl mono privacy-val" style="margin-bottom:10px">
      <PrivacyValue value={fmt(totalValue)} />
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="pill-badge" class:pos={totalPlPct >= 0} class:neg={totalPlPct < 0}>
        {totalPlPct >= 0 ? '▲' : '▼'} {Math.abs(totalPlPct).toFixed(1)}%
      </span>
      <span class="mono h-sm" style="color:{totalPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'};font-weight:600">
        <PrivacyValue value="{signed(totalPl)} totaal" />
      </span>
    </div>
  </div>

  <!-- Card 2: Today -->
  <div class="card hero-today">
    <div class="h-eyebrow" style="margin-bottom:8px">Vandaag</div>
    {#if intradayStore.loaded}
      <div class="mono" style="font-size:22px;font-weight:600;line-height:1;color:{totalDayPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
        <PrivacyValue value={signed(totalDayPl)} />
      </div>
      <div class="mono h-sm" style="margin-top:6px;color:{totalDayPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
        {fmtPct(totalDayPlPct)}
      </div>
    {:else}
      <div class="h-sm c-muted">Laden…</div>
    {/if}
  </div>

  <!-- Card 3: Movers -->
  <div class="card hero-movers">
    <MoversStrip {movers} variant="rows" />
  </div>
</div>

<!-- MOBILE: single compact card -->
<div class="card mobile-hero">
  <!-- Top row: TOTAAL big, VANDAAG to the right -->
  <div class="mh-top">
    <div class="mh-total">
      <div class="h-eyebrow">Totale waarde</div>
      <div class="mh-total-val mono"><PrivacyValue value={fmt(totalValue)} /></div>
      <div class="mh-total-sub">
        <span class="pill-badge sm" class:pos={totalPlPct >= 0} class:neg={totalPlPct < 0}>
          {totalPlPct >= 0 ? '▲' : '▼'} {Math.abs(totalPlPct).toFixed(1)}%
        </span>
        <span class="mono mh-total-pl" style="color:{totalPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
          <PrivacyValue value={signed(totalPl)} />
        </span>
      </div>
    </div>
    <div class="mh-today">
      <div class="h-eyebrow">Vandaag</div>
      {#if intradayStore.loaded}
        <div class="mono mh-today-val" style="color:{totalDayPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
          <PrivacyValue value={signed(totalDayPl)} />
        </div>
        <div class="mono mh-today-pct" style="color:{totalDayPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
          {fmtPct(totalDayPlPct)}
        </div>
      {:else}
        <div class="h-sm c-muted">Laden…</div>
      {/if}
    </div>
  </div>

  <!-- Movers row (chips) -->
  <MoversStrip {movers} variant="chips" />
</div>

<style>
  /* ── Hero C: 3-card split ─────────────────────────────── */
  .hero-c {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  .hero-total, .hero-today, .hero-movers { padding: 18px 20px; }
  .hero-movers { padding: 14px 16px; display: flex; flex-direction: column; justify-content: center; gap: 0; }

  @media (max-width: 860px) {
    .hero-c { grid-template-columns: 1fr 1fr; }
    .hero-movers { grid-column: 1 / -1; }
  }

  /* Hide mobile hero on desktop, hide desktop hero on mobile */
  .mobile-hero { display: none; }

  @media (max-width: 540px) {
    .desktop-hero { display: none !important; }
    .mobile-hero { display: block; margin-bottom: 12px; padding: 14px 16px; }
  }

  /* Compact mobile hero internals */
  .mh-top {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: start;
    padding-bottom: 12px;
  }

  .mh-total .h-eyebrow,
  .mh-today .h-eyebrow { margin-bottom: 4px; }

  .mh-total-val {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.05;
    margin-bottom: 6px;
  }
  .mh-total-sub {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-size: 12px;
  }
  .mh-total-pl { font-weight: 600; }

  .mh-today { text-align: right; min-width: 80px; }
  .mh-today-val {
    font-size: 17px; font-weight: 600; line-height: 1.1;
    margin-top: 2px;
  }
  .mh-today-pct {
    font-size: 11px; font-weight: 500; margin-top: 2px; opacity: 0.85;
  }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }
</style>
