<script lang="ts">
  /** Tiny value-based trend sparkline (30D column / position-card fallback). */
  interface Props {
    values: number[];
    fullWidth?: boolean;
  }
  const { values, fullWidth = false }: Props = $props();

  const w = 72;
  const h = 22;

  const geom = $derived.by(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step  = w / (values.length - 1);
    const pts   = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 3) - 1] as [number, number]);
    const d     = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const up    = values[values.length - 1]! >= values[0]!;
    return { d, fillD: `${d} L${w} ${h} L0 ${h} Z`, up };
  });
</script>

{#if geom}
  <svg
    width={fullWidth ? '100%' : w}
    height={h}
    viewBox="0 0 {w} {h}"
    preserveAspectRatio="none"
    style="display:block"
  >
    <path d={geom.fillD} fill={geom.up ? 'var(--c-pos-bg)' : 'var(--c-neg-bg)'} />
    <path d={geom.d} fill="none" stroke={geom.up ? 'var(--c-pos)' : 'var(--c-neg)'} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
{/if}
