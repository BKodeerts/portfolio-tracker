<script lang="ts">
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { getColor } from '$lib/utils/color';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import type { Movers } from '$lib/derived/dashboard';

  /** Top winner / top loser. `rows` = desktop hero card, `chips` = mobile hero. */
  interface Props {
    movers: Movers;
    variant?: 'rows' | 'chips';
  }
  const { movers, variant = 'rows' }: Props = $props();

  function signed(v: number) { return `${v >= 0 ? '+' : ''}${fmt(v)}`; }
</script>

{#if variant === 'rows'}
  {#if movers.top}
    <div class="mover-row">
      <div class="mover-avatar" style="background:{getColor(movers.top.ticker)}22;color:{getColor(movers.top.ticker)}">{movers.top.ticker.slice(0, 2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700">{movers.top.ticker}</div>
        <div class="h-sm" style="font-size:10px">Top winner</div>
      </div>
      <div style="text-align:right">
        <div class="mono c-pos" style="font-size:12px;font-weight:700">{fmtPct(movers.top.changePct ?? 0)}</div>
        <div class="mono h-sm" style="font-size:10px">{signed(movers.top.changeEur ?? 0)}</div>
      </div>
    </div>
  {/if}
  {#if movers.bot && movers.bot.ticker !== movers.top?.ticker}
    {#if movers.top}<div class="hero-movers-sep"></div>{/if}
    <div class="mover-row">
      <div class="mover-avatar" style="background:{getColor(movers.bot.ticker)}22;color:{getColor(movers.bot.ticker)}">{movers.bot.ticker.slice(0, 2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700">{movers.bot.ticker}</div>
        <div class="h-sm" style="font-size:10px">Top loser</div>
      </div>
      <div style="text-align:right">
        <div class="mono c-neg" style="font-size:12px;font-weight:700">{fmtPct(movers.bot.changePct ?? 0)}</div>
        <div class="mono h-sm" style="font-size:10px">{signed(movers.bot.changeEur ?? 0)}</div>
      </div>
    </div>
  {/if}
  {#if !movers.top && !movers.bot}
    <div class="h-sm c-muted" style="padding:4px 0">
      {intradayStore.loaded ? 'Geen koersbeweging vandaag' : 'Intraday data laden…'}
    </div>
  {/if}
{:else if movers.top || movers.bot}
  <div class="mh-movers">
    {#if movers.top}
      <div class="mh-mover">
        <span class="mover-avatar" style="background:{getColor(movers.top.ticker)}22;color:{getColor(movers.top.ticker)}">{movers.top.ticker.slice(0, 2)}</span>
        <span class="mh-mover-tk">{movers.top.ticker}</span>
        <span class="mono c-pos mh-mover-pct">{fmtPct(movers.top.changePct ?? 0)}</span>
      </div>
    {/if}
    {#if movers.bot && movers.bot.ticker !== movers.top?.ticker}
      <div class="mh-mover">
        <span class="mover-avatar" style="background:{getColor(movers.bot.ticker)}22;color:{getColor(movers.bot.ticker)}">{movers.bot.ticker.slice(0, 2)}</span>
        <span class="mh-mover-tk">{movers.bot.ticker}</span>
        <span class="mono c-neg mh-mover-pct">{fmtPct(movers.bot.changePct ?? 0)}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .mover-row { display: flex; align-items: center; gap: 10px; }
  .mover-avatar {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 11px; flex-shrink: 0;
  }
  .hero-movers-sep { height: 1px; background: var(--border); margin: 10px 0; }

  /* Movers as horizontal chips, separated from the top by a hairline */
  .mh-movers {
    display: flex; gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .mh-movers::-webkit-scrollbar { display: none; }
  .mh-mover {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 6px 10px 6px 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    flex-shrink: 0;
    font-size: 12px;
  }
  .mh-mover .mover-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    font-size: 9px;
  }
  .mh-mover-tk { font-weight: 700; }
  .mh-mover-pct { font-weight: 600; font-size: 11px; }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }
</style>
