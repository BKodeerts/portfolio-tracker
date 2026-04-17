<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import PrivacyValue from './PrivacyValue.svelte';

  // Compute total current value from positions
  const totalValue = $derived(
    portfolioStore.positions.reduce((s, p) => s + p.value, 0),
  );

  const totalPl = $derived(totalValue - portfolioStore.totalInvested);
  const totalPlPct = $derived(
    portfolioStore.totalInvested > 0 ? (totalPl / portfolioStore.totalInvested) * 100 : 0,
  );

  // Day P&L from intraday data
  const dayPl = $derived(
    portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0),
  );
  const dayPlPct = $derived(
    totalValue - dayPl > 0 ? (dayPl / (totalValue - dayPl)) * 100 : 0,
  );
</script>

{#if portfolioStore.loaded}
  <div class="summary-bar-inner">
    <div class="summary-hero">
      <div class="summary-hero-main">
        <div class="summary-hero-value">
          <PrivacyValue value={fmt(totalValue)} />
        </div>
        <div class="summary-hero-label">Totale waarde</div>
      </div>

      <div class="summary-secondary">
        <div class="summary-secondary-item">
          <div class="metric-label">Rendement</div>
          <div class="metric-value">
            <PrivacyValue value={fmt(totalPl)} class={totalPl >= 0 ? 'c-pos' : 'c-neg'} />
          </div>
          <div class="metric-sub {totalPlPct >= 0 ? 'c-pos' : 'c-neg'}">
            {fmtPct(totalPlPct)}
          </div>
        </div>

        <div class="summary-secondary-item">
          <div class="metric-label">Ingelegd</div>
          <div class="metric-value">
            <PrivacyValue value={fmt(portfolioStore.totalInvested)} />
          </div>
        </div>

        {#if portfolioStore.twrPct !== null}
          <div class="summary-secondary-item">
            <div class="metric-label">TWR</div>
            <div class="metric-value {(portfolioStore.twrPct ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
              {fmtPct(portfolioStore.twrPct ?? 0)}
            </div>
          </div>
        {/if}
      </div>

      <div class="summary-hero-today">
        <div class="summary-today-label">Vandaag</div>
        <div class="summary-today-value {dayPl >= 0 ? 'c-pos' : 'c-neg'}">
          <PrivacyValue value={fmt(dayPl)} />
        </div>
        <div class="summary-today-pct {dayPl >= 0 ? 'c-pos' : 'c-neg'}">
          {fmtPct(dayPlPct)}
        </div>
      </div>
    </div>
  </div>
{/if}
