<script lang="ts">
  import type { IntradayPoint } from '$lib/types/candle';

  /**
   * THE single ticker mini-graph (design decision #4): % vs prev close,
   * x-axis normalized to the ticker's own trading session so each stock
   * fills its own session width up to "now". Used everywhere a ticker
   * sparkline appears.
   *
   * Phase-driven (dashboard v2): a sparkline reflects its own exchange
   * session only — never FX drift while the market is closed. Only regular
   * trading hours are ever drawn; extended-hours ticks are not shown.
   * - 'pre':  yesterday's full session, dimmed.
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
    /** Caption centered under the sparkline ("prev session · opens 15:30"). */
    hint?: string | null;
  }
  const {
    points, prevClose, sessionStart, sessionEnd, height = 30,
    phase = 'live', hint = null,
  }: Props = $props();

  const uid = $props.id();

  const W = 120;
  const PAD_Y = 3;

  const geom = $derived.by(() => {
    if (!points || points.length < 2 || !prevClose || sessionEnd <= sessionStart) return null;
    const H = height;
    const pcts = points.map((p) => ((p.close - prevClose) / prevClose) * 100);
    const min = Math.min(0, ...pcts);
    const max = Math.max(0, ...pcts);
    const range = max - min || 0.1;
    const y = (v: number) => H - PAD_Y - ((v - min) / range) * (H - 2 * PAD_Y);

    const span = sessionEnd - sessionStart;
    const xs = points.map((p) => Math.min(W, Math.max(0, ((p.ts - sessionStart) / span) * W)));
    const ys = pcts.map(y);
    const lineD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');
    const fillD = phase === 'pre'
      ? ''
      : `${lineD} L${xs[xs.length - 1]!.toFixed(1)} ${H} L${xs[0]!.toFixed(1)} ${H} Z`;

    const zeroY = y(0).toFixed(1);
    const up = (pcts[pcts.length - 1] ?? 0) >= 0;
    return { lineD, fillD, zeroY, up };
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
