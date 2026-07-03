<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { EU_EXCHANGE_RE } from '$lib/market';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import PrivacyValue from './PrivacyValue.svelte';

  const STALE_MS = 10 * 60 * 1000; // 10 minutes
  const isStale = $derived(
    intradayStore.loadError ||
    (intradayStore.lastLoaded !== null && Date.now() - intradayStore.lastLoaded > STALE_MS),
  );

  // Compute live value + day P&L from intraday prices when available
  const liveData = $derived((): { value: number; dayPl: number } | null => {
    if (!intradayStore.loaded || portfolioStore.positions.length === 0) return null;
    const fxRate = intradayStore.liveEurUsd;
    let liveValue = 0;
    let prevValue = 0;
    for (const pos of portfolioStore.positions) {
      const yahoo  = pos.yahoo ?? pos.ticker;
      const intra  = intradayStore.data[yahoo];
      const isEu   = EU_EXCHANGE_RE.test(yahoo);
      const fx     = isEu ? 1 : fxRate;
      if (!intra?.previousClose || (!isEu && fx == null)) {
        // no intraday or missing FX — use the static position value as-is
        liveValue += pos.value;
        prevValue += pos.value;
        continue;
      }
      const pts          = intra.points ?? [];
      const currentPrice = pts.at(-1)?.close ?? intra.previousClose;
      liveValue += (pos.shares * currentPrice) / fx!;
      prevValue += (pos.shares * intra.previousClose) / fx!;
    }
    return { value: liveValue, dayPl: liveValue - prevValue };
  });

  const totalValue = $derived(
    liveData()?.value ?? portfolioStore.positions.reduce((s, p) => s + p.value, 0),
  );

  const totalPl = $derived(totalValue - portfolioStore.totalInvested);
  const totalPlPct = $derived(
    portfolioStore.totalInvested > 0 ? (totalPl / portfolioStore.totalInvested) * 100 : 0,
  );

  const dayPl    = $derived(liveData()?.dayPl ?? portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0));
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
        <div class="summary-today-label">Vandaag{#if isStale} <span class="stale-badge" title="Koersen mogelijk verouderd">&#9679;</span>{/if}</div>
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
