<script lang="ts">
  import type { EarningsRow } from '$lib/derived/earnings';

  /**
   * Dashboard earnings list: who reports next, soonest first, plus at most one
   * recently reported ticker. One row per ticker — the service returns a single
   * date, never a series.
   *
   * The caller decides whether this renders at all: with nothing upcoming the
   * whole track is dropped so the holdings reflow full width, rather than
   * leaving an empty column behind.
   */
  interface Props {
    rows: EarningsRow[];
  }
  const { rows }: Props = $props();
</script>

<div class="card">
  {#each rows as row (row.ticker)}
    <a class="row" class:reported={!row.upcoming} href={row.href}>
      <span
        class="square"
        class:hollow={!row.held}
        style="border-color:{row.color}; background:{row.held ? row.color : 'transparent'}"
      ></span>
      <span class="tick mono">{row.ticker}</span>
      <span class="mid">
        <span class="date mono">{row.dateStr}</span>
        <span class="status">{row.statusStr}</span>
      </span>
      <span class="rel mono" class:soon={row.soon}>{row.rel}</span>
    </a>
  {/each}

  <div class="legend">
    <span class="key"><span class="square legend-square"></span>held</span>
    <span class="key"><span class="square legend-square hollow"></span>watchlist</span>
    <span class="note">estimated dates shown as a range</span>
  </div>
</div>

<style>
  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
    letter-spacing: -0.02em;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    padding: 12px 16px 6px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--hairline);
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }
  .row:hover { background: var(--row-hover); }

  .square {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    border: 1.5px solid var(--fg-faint);
    box-sizing: border-box;
    flex-shrink: 0;
  }
  .square.hollow { background: transparent; }

  .tick {
    font-size: 12px;
    font-weight: 700;
    width: 46px;
    flex-shrink: 0;
  }
  .mid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .date {
    font-size: 11px;
    font-weight: 600;
  }
  .status {
    font-size: 10px;
    color: var(--fg-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rel {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-faint);
    white-space: nowrap;
  }
  .rel.soon { color: var(--fg); }

  /* A report that already happened is context, not news — the whole row dims. */
  .row.reported,
  .row.reported .status,
  .row.reported .rel { color: var(--spark-dim); }

  .legend {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 0 6px;
    font-size: 10px;
    color: var(--fg-faint);
  }
  .key {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .legend-square { background: var(--fg-faint); }
  .note { margin-left: auto; }
</style>
