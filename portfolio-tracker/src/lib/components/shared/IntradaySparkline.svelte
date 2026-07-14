<script lang="ts">
  import type { IntradayPoint } from '$lib/types/candle';

  /**
   * THE single ticker mini-graph (design decision #4): % vs prev close,
   * x-axis normalized to the ticker's own trading session so each stock
   * fills its own session width up to "now". Used everywhere a ticker
   * sparkline appears.
   *
   * Phase-driven (dashboard v2): a sparkline reflects its own exchange
   * session only — never FX drift while the market is closed.
   * - 'pre':  yesterday's full session, dimmed, in the first ~83% of the
   *   width; today's pre-market as a dotted ghost tail in the rest.
   * - 'live': partial fill grows through the day, colored by day direction.
   * - 'post': full session at normal color, "closed HH:MM" hint.
   */
  interface Props {
    points: IntradayPoint[];
    prevClose: number;
    /** Session open, unix seconds. */
    sessionStart: number;
    /** Session close, unix seconds. */
    sessionEnd: number;
    height?: number;
    phase?: 'pre' | 'live' | 'post';
    /** Pre phase: extended-hours points drawn as the dotted ghost tail. */
    ghostPoints?: IntradayPoint[];
    /** Ghost tail x-window (pre-market start → regular open), unix seconds. */
    ghostStart?: number | null;
    ghostEnd?: number | null;
    /** Caption centered under the sparkline ("prev session · opens 15:30"). */
    hint?: string | null;
  }
  const {
    points, prevClose, sessionStart, sessionEnd, height = 30,
    phase = 'live', ghostPoints = [], ghostStart = null, ghostEnd = null, hint = null,
  }: Props = $props();

  const uid = $props.id();

  const W = 120;
  /** Pre phase: session line occupies ~83% of the width, ghost tail the rest. */
  const MAIN_W = 100;
  const PAD_Y = 3;

  const geom = $derived.by(() => {
    if (!points || points.length < 2 || !prevClose || sessionEnd <= sessionStart) return null;
    const H = height;
    const ghost = phase === 'pre' && ghostPoints.length >= 2
      && ghostStart != null && ghostEnd != null && ghostEnd > ghostStart
      ? ghostPoints : [];
    // Only reserve the tail width when there is a ghost to draw in it —
    // pre-open without pre-market data (weekends) uses the full width.
    const mainW = ghost.length ? MAIN_W : W;

    const pcts = points.map((p) => ((p.close - prevClose) / prevClose) * 100);
    const gPcts = ghost.map((p) => ((p.close - prevClose) / prevClose) * 100);
    const min = Math.min(0, ...pcts, ...gPcts);
    const max = Math.max(0, ...pcts, ...gPcts);
    const range = max - min || 0.1;
    const y = (v: number) => H - PAD_Y - ((v - min) / range) * (H - 2 * PAD_Y);

    const span = sessionEnd - sessionStart;
    const xs = points.map((p) => Math.min(mainW, Math.max(0, ((p.ts - sessionStart) / span) * mainW)));
    const ys = pcts.map(y);
    const lineD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');
    const fillD = phase === 'pre'
      ? ''
      : `${lineD} L${xs[xs.length - 1]!.toFixed(1)} ${H} L${xs[0]!.toFixed(1)} ${H} Z`;

    // Ghost tail continues from the session's last close at the boundary (the
    // baseline is the close before the drawn session, not the session's own).
    let ghostD = '';
    if (ghost.length) {
      const gSpan = ghostEnd! - ghostStart!;
      const gx = (ts: number) => mainW + Math.min(1, Math.max(0, (ts - ghostStart!) / gSpan)) * (W - mainW);
      ghostD = `M${mainW} ${ys[ys.length - 1]!.toFixed(1)} `
        + ghost.map((p, i) => `L${gx(p.ts).toFixed(1)} ${y(gPcts[i]!).toFixed(1)}`).join(' ');
    }

    const zeroY = y(0).toFixed(1);
    const up = (pcts[pcts.length - 1] ?? 0) >= 0;
    return { lineD, fillD, ghostD, zeroY, up };
  });

  const stroke = $derived(
    phase === 'pre' ? 'var(--spark-dim)' : geom?.up ? 'var(--c-pos)' : 'var(--c-neg)',
  );
</script>

{#if geom}
  <svg width="100%" height={height} viewBox="0 0 {W} {height}" preserveAspectRatio="none" style="display:block" opacity={phase === 'pre' ? 0.75 : 1}>
    {#if geom.fillD}
      <defs>
        <linearGradient id="ispark-{uid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style="stop-color:{stroke}" stop-opacity="0.16" />
          <stop offset="100%" style="stop-color:{stroke}" stop-opacity="0" />
        </linearGradient>
      </defs>
    {/if}
    <line x1="0" x2={W} y1={geom.zeroY} y2={geom.zeroY} stroke="var(--hairline)" stroke-width="1" />
    {#if geom.fillD}
      <path d={geom.fillD} fill="url(#ispark-{uid})" />
    {/if}
    <path d={geom.lineD} fill="none" {stroke} stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    {#if geom.ghostD}
      <path d={geom.ghostD} fill="none" stroke="var(--spark-ghost)" stroke-width="1.2" stroke-dasharray="2 3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    {/if}
  </svg>
  {#if hint}
    <div class="spark-hint">{hint}</div>
  {/if}
{/if}

<style>
  .spark-hint {
    font-size: 9.5px;
    color: var(--spark-dim);
    text-align: center;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
  }
</style>
