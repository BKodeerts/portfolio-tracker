<script lang="ts" module>
  export type DayTone = 'pos' | 'neg' | 'washed-pos' | 'washed-neg' | 'muted';
</script>

<script lang="ts">
  import IntradaySparkline from '$lib/components/shared/IntradaySparkline.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { TickerSpark } from '$lib/derived/dashboard';

  /**
   * Holdings/watchlist card (dashboard v3): color dot + ticker + native price,
   * session sparkline, footer with a muted left value and the one loud number —
   * the day change. Watch variant: dashed border, hollow dot, company name left.
   */
  interface Props {
    ticker: string;
    color: string;
    href: string;
    variant?: 'held' | 'watch';
    /** Market price in the trading currency (pre-open: prev close). */
    priceStr: string;
    /** Footer left: your value (held) or the company name (watch). */
    footLeft: string;
    /** Blur the footer-left value in privacy mode (held cards). */
    privacy?: boolean;
    dayStr: string;
    dayTone: DayTone;
    spark: TickerSpark | null;
    /** Tapping the day number flips all cards between day-% and day-€. */
    ontoggleday: () => void;
  }
  const {
    ticker, color, href, variant = 'held',
    priceStr, footLeft, privacy = false,
    dayStr, dayTone, spark, ontoggleday,
  }: Props = $props();

  function toggle(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    ontoggleday();
  }
  function toggleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') toggle(e);
  }
</script>

<a class="card" class:watch={variant === 'watch'} {href}>
  <div class="head">
    <div class="id">
      <span class="dot" class:hollow={variant === 'watch'} style={variant === 'watch' ? `border-color:${color}` : `background:${color}`}></span>
      <span class="tick">{ticker}</span>
    </div>
    <span class="price mono">{priceStr}</span>
  </div>
  <div class="spark">
    {#if spark}
      <IntradaySparkline
        points={spark.points}
        prevClose={spark.prevClose}
        sessionStart={spark.sessionStart}
        sessionEnd={spark.sessionEnd}
        phase={spark.phase}
        ghostPoints={spark.ghostPoints}
        ghostStart={spark.ghostStart}
        ghostEnd={spark.ghostEnd}
        hint={spark.hint}
        height={34}
      />
    {/if}
  </div>
  <div class="foot">
    <span class="foot-left" class:mono={variant === 'held'}>
      {#if privacy}<PrivacyValue value={footLeft} />{:else}{footLeft}{/if}
    </span>
    <span
      class="day mono {dayTone}"
      role="button"
      tabindex="0"
      onclick={toggle}
      onkeydown={toggleKey}
    >{dayStr}</span>
  </div>
</a>

<style>
  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
    letter-spacing: -0.02em;
  }

  .card {
    display: block;
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    padding: 12px 14px;
    box-shadow: var(--card-shadow);
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    min-width: 0;
    transition: border-color 0.12s;
  }
  .card:hover { border-color: var(--card-border-hover); }

  .card.watch {
    background: transparent;
    border: 1px dashed var(--watch-border);
    box-shadow: none;
  }
  .card.watch:hover { border-color: var(--watch-border-hover); }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .id {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .dot.hollow {
    border-radius: 50%;
    border-width: 1.5px;
    border-style: solid;
    box-sizing: border-box;
    background: transparent;
  }
  .tick {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .price {
    font-size: 10px;
    color: var(--fg-faint);
    white-space: nowrap;
  }

  .spark {
    margin: 10px 0 8px;
    min-height: 34px;
  }

  .foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .foot-left {
    font-size: 10.5px;
    color: var(--fg-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .day {
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
  }
  .day.pos { color: var(--c-pos); }
  .day.neg { color: var(--c-neg); }
  .day.washed-pos { color: var(--c-pos-washed); }
  .day.washed-neg { color: var(--c-neg-washed); }
  .day.muted { color: var(--fg-faint); }
</style>
