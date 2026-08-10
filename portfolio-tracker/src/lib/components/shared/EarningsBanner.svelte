<script lang="ts">
  import type { EarningsBannerInfo } from '$lib/derived/earnings';

  /**
   * Earnings countdown on the stock detail price row.
   *
   * Two things the copy is careful about: Yahoo publishes no time of day, so
   * the sub-line says so rather than leaving room to read a placeholder clock
   * as before/after the bell; and an unconfirmed date renders as a range inside
   * a dashed border, never as a hard date.
   *
   * The caller decides visibility — outside the horizon there is no banner at
   * all, so this never renders an "unknown" state.
   */
  interface Props {
    info: EarningsBannerInfo;
  }
  const { info }: Props = $props();
</script>

<div class="banner" class:estimated={info.estimated}>
  <span class="dot" class:past={!info.upcoming}></span>
  <span class="text">
    <span class="title">{info.title}</span>
    <span class="sub">{info.sub}</span>
  </span>
  <span class="right">
    <span class="date mono">{info.dateStr}</span>
    <span class="flag">{info.flag}</span>
  </span>
</div>

<style>
  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
  }

  .banner {
    flex: 1 1 100%;
    max-width: 400px;
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
    padding: 12px 16px;
    box-sizing: border-box;
  }
  /* Dashed = the date is not confirmed. Same cue as the card badge's underline. */
  .banner.estimated {
    border-style: dashed;
    border-color: var(--border-strong);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--fg);
    flex-shrink: 0;
  }
  .dot.past { background: var(--spark-dim); }

  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .title {
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 11px;
    color: var(--fg-faint);
  }

  .right {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex-shrink: 0;
  }
  .date {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .flag {
    font-size: 10px;
    color: var(--fg-faint);
  }

  /* Desktop: the banner sits at the end of the price row, sized to content. */
  @media (min-width: 900px) {
    .banner {
      margin-left: auto;
      flex: 0 0 auto;
    }
  }
</style>
