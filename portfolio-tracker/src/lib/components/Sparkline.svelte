<script lang="ts">
  import type { IntradayPoint } from '$lib/types/candle';

  /**
   * Intraday sparkline rendered as real Svelte markup.
   *
   * Variants (both x-scale over the full trading session so the line only
   * fills the elapsed portion of the day):
   * - `card`:    38px tall, gradient fill, zero line, fixed green/red colors,
   *              dimmed when `muted` (used on intraday/dashboard spark cards).
   * - `compact`: 26px tall, flat theme-token fill, no zero line
   *              (used inside position cards).
   */
  interface Props {
    points: IntradayPoint[];
    prevClose: number;
    tradingMins: number;
    muted?: boolean;
    variant?: 'card' | 'compact';
  }
  const { points, prevClose, tradingMins, muted = false, variant = 'card' }: Props = $props();

  const uid = $props.id();

  const W = 200;
  const H = $derived(variant === 'card' ? 38 : 26);
  const padY = $derived(variant === 'card' ? 3 : 2);

  const geom = $derived.by(() => {
    if (!points || points.length < 2 || !prevClose) return null;
    const pcts = points.map((p) => ((p.close - prevClose) / prevClose) * 100);
    const min = Math.min(0, ...pcts);
    const max = Math.max(0, ...pcts);
    const range = max - min || 0.1;
    const firstTs = points[0]!.ts;
    const totalSecs = tradingMins ? tradingMins * 60 : points[points.length - 1]!.ts - firstTs;
    const xs = points.map((p) => Math.min(W, Math.max(0, ((p.ts - firstTs) / totalSecs) * W)));
    const ys = pcts.map((v) => H - padY - ((v - min) / range) * (H - 2 * padY));
    const lineD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');
    const fillD = `${lineD} L${xs[xs.length - 1]!.toFixed(1)} ${H} L${xs[0]!.toFixed(1)} ${H} Z`;
    const zeroY = (H - padY - ((-min) / range) * (H - 2 * padY)).toFixed(1);
    const up = (pcts[pcts.length - 1] ?? 0) >= 0;
    return { lineD, fillD, zeroY, up };
  });

  const stroke = $derived(
    variant === 'card' ? (geom?.up ? '#4ade80' : '#f87171') : geom?.up ? 'var(--c-pos)' : 'var(--c-neg)',
  );
</script>

{#if geom}
  {#if variant === 'card'}
    <svg width="100%" height={H} viewBox="0 0 {W} {H}" preserveAspectRatio="none" style="display:block;margin-top:8px" opacity={muted ? '0.45' : '1'}>
      <defs>
        <linearGradient id="spark-{uid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color={stroke} stop-opacity="0.2" />
          <stop offset="100%" stop-color={stroke} stop-opacity="0.02" />
        </linearGradient>
      </defs>
      <line x1="0" y1={geom.zeroY} x2={W} y2={geom.zeroY} stroke="rgba(128,128,128,0.2)" stroke-width="1" />
      <path d={geom.fillD} fill="url(#spark-{uid})" />
      <path d={geom.lineD} fill="none" {stroke} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {:else}
    <svg width="100%" height={H} viewBox="0 0 {W} {H}" preserveAspectRatio="none" style="display:block" opacity={muted ? '0.45' : '1'}>
      <path d={geom.fillD} fill={geom.up ? 'var(--c-pos-bg)' : 'var(--c-neg-bg)'} />
      <path d={geom.lineD} fill="none" {stroke} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>
  {/if}
{/if}
