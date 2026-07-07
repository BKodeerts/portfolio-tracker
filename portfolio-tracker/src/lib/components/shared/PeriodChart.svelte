<script lang="ts">
  /**
   * Hero SVG chart (dashboard, stock detail).
   * The SVG is sized to the measured container width — geometry recomputes
   * on resize instead of stretching a fixed viewBox, so text keeps its size.
   *
   * - mode 'history':  daily/weekly closes with optional dashed invested line.
   * - mode 'intraday': session-bounded line vs a dashed prev-close baseline,
   *   drawn only up to the latest point, with a pulsing "now" dot. Pre-open
   *   (`dimmed`) renders the previous session grey without fill, with the
   *   extended-hours ghost tail dotted in the last ~15% of the width.
   */
  interface XTick {
    /** Position in the data x-domain (history: data x; intraday: minute-of-day). */
    x: number;
    label: string;
  }
  interface Props {
    mode: 'history' | 'intraday';
    height?: number;
    formatY: (v: number) => string;
    xTicks?: XTick[];
    /* history mode */
    data?: { x: number; value: number }[];
    invested?: { x: number; value: number }[];
    /* intraday mode */
    points?: { min: number; value: number }[];
    prevClose?: number;
    /** Session bounds in minutes-of-day (e.g. 540 and 1320). */
    sessionStart?: number;
    sessionEnd?: number;
    /** Caption shown centered when intraday `points` is empty. */
    emptyLabel?: string;
    /** Inner horizontal padding in px (desktop dashboard: 24). */
    padX?: number;
    /** Hide the pulsing "now" dot (after the last market close). */
    showNow?: boolean;
    /** Pre-open: dim the line (no gradient fill, no now-dot). */
    dimmed?: boolean;
    /** Pre-open ghost tail (extended-hours data) in minutes-of-day. */
    ghostPoints?: { min: number; value: number }[];
    /** Ghost tail x-window (pre-market start → regular open), minutes-of-day. */
    ghostStart?: number | null;
    ghostEnd?: number | null;
    /** Caption centered near the top of the plot ("Previous session · opens 15:30"). */
    topCaption?: string | null;
  }
  const {
    mode, height = 200, formatY, xTicks = [],
    data = [], invested = [],
    points = [], prevClose, sessionStart, sessionEnd, emptyLabel,
    padX = 20, showNow = true,
    dimmed = false, ghostPoints = [], ghostStart = null, ghostEnd = null, topCaption = null,
  }: Props = $props();

  const uid = $props.id();

  let containerW = $state(0);
  const VW = $derived(containerW > 0 ? containerW : 390);
  const L = $derived(padX);
  const R = $derived(VW - padX);
  const T = 12;
  const B = $derived(height - 22);

  interface Geom {
    grid: { y: number; labelY: number; label: string }[];
    ticks: { x: number; label: string }[];
    lineD: string;
    areaD: string;
    investedD: string;
    ghostD: string;
    lineColor: string;
    baselineY: number | null;
    now: { x: number; y: number } | null;
    empty: boolean;
  }

  function pathD(pts: [number, number][]): string {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  }

  const geom = $derived.by((): Geom | null => {
    const bottom = B;
    // Transient layouts can measure a degenerate width — draw nothing.
    if (R - L < 10) return null;
    if (mode === 'history') {
      if (data.length < 2) return null;
      const vals = data.map((d) => d.value);
      const invs = invested.map((d) => d.value);
      let lo = Math.min(...vals, ...(invs.length ? invs : [Infinity]));
      let hi = Math.max(...vals, ...(invs.length ? invs : [-Infinity]));
      const pad = (hi - lo) * 0.1 || 1;
      lo -= pad; hi += pad;
      const x0 = data[0]!.x;
      const x1 = data[data.length - 1]!.x;
      const spanX = x1 - x0 || 1;
      const sx = (x: number) => L + ((x - x0) / spanX) * (R - L);
      const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (bottom - T);
      const pts: [number, number][] = data.map((d) => [sx(d.x), sy(d.value)]);
      const lineD = pathD(pts);
      const last = pts[pts.length - 1]!;
      const first = pts[0]!;
      return {
        grid: [0, 0.5, 1].map((f) => {
          const v = hi - f * (hi - lo);
          return { y: sy(v), labelY: sy(v) - 4, label: formatY(v) };
        }),
        ticks: xTicks.map((t) => ({ x: sx(t.x), label: t.label })),
        lineD,
        areaD: `${lineD} L${last[0].toFixed(1)} ${bottom} L${first[0].toFixed(1)} ${bottom} Z`,
        investedD: invs.length >= 2 ? pathD(invested.map((d) => [sx(d.x), sy(d.value)])) : '',
        ghostD: '',
        lineColor: vals[vals.length - 1]! >= vals[0]! ? 'var(--c-pos)' : 'var(--c-neg)',
        baselineY: null,
        now: null,
        empty: false,
      };
    }

    // intraday mode
    if (prevClose == null || sessionStart == null || sessionEnd == null || sessionEnd <= sessionStart) return null;
    // Pre-open: the session line occupies the first ~85% of the width and the
    // extended-hours ghost tail the rest.
    const ghost = dimmed && ghostPoints.length >= 2
      && ghostStart != null && ghostEnd != null && ghostEnd > ghostStart
      ? ghostPoints : [];
    const mainR = ghost.length ? L + (R - L) * 0.85 : R;
    const vals = points.map((p) => p.value);
    const gVals = ghost.map((p) => p.value);
    let lo = Math.min(prevClose, ...vals, ...gVals);
    let hi = Math.max(prevClose, ...vals, ...gVals);
    const pad = (hi - lo) * 0.15 || Math.abs(prevClose) * 0.005 || 1;
    lo -= pad; hi += pad;
    const sx = (m: number) => L + ((m - sessionStart) / (sessionEnd - sessionStart)) * (mainR - L);
    const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (bottom - T);
    const grid = [0, 0.5, 1].map((f) => {
      const v = hi - f * (hi - lo);
      return { y: sy(v), labelY: sy(v) - 4, label: formatY(v) };
    });
    const ticks = xTicks.map((t) => ({ x: sx(t.x), label: t.label }));
    if (points.length < 2) {
      return {
        grid, ticks, lineD: '', areaD: '', investedD: '', ghostD: '',
        lineColor: 'var(--c-pos)', baselineY: sy(prevClose), now: null, empty: true,
      };
    }
    const pts: [number, number][] = points.map((p) => [sx(p.min), sy(p.value)]);
    const lineD = pathD(pts);
    const last = pts[pts.length - 1]!;
    const first = pts[0]!;
    let ghostD = '';
    if (ghost.length) {
      const gSpan = ghostEnd! - ghostStart!;
      const gx = (m: number) => mainR + Math.min(1, Math.max(0, (m - ghostStart!) / gSpan)) * (R - mainR);
      ghostD = pathD(ghost.map((p) => [gx(p.min), sy(p.value)]));
    }
    return {
      grid, ticks,
      lineD,
      areaD: dimmed ? '' : `${lineD} L${last[0].toFixed(1)} ${bottom} L${first[0].toFixed(1)} ${bottom} Z`,
      investedD: '',
      ghostD,
      lineColor: dimmed
        ? 'var(--spark-dim)'
        : vals[vals.length - 1]! >= prevClose ? 'var(--c-pos)' : 'var(--c-neg)',
      baselineY: sy(prevClose),
      now: dimmed ? null : { x: last[0], y: last[1] },
      empty: false,
    };
  });
</script>

<div class="chart-box" bind:clientWidth={containerW}>
<svg width="100%" height={height} viewBox="0 0 {VW} {height}" style="display:block">
  {#if geom}
    <defs>
      <linearGradient id="pchart-{uid}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" style="stop-color:{geom.lineColor}" stop-opacity="0.16" />
        <stop offset="100%" style="stop-color:{geom.lineColor}" stop-opacity="0" />
      </linearGradient>
    </defs>
    {#each geom.grid as g}
      <line x1={L} x2={R} y1={g.y} y2={g.y} stroke="var(--chart-gridline)" stroke-width="1" />
      <text class="axis" x={R - 2} y={g.labelY} text-anchor="end">{g.label}</text>
    {/each}
    {#if geom.baselineY != null}
      <line x1={L} x2={R} y1={geom.baselineY} y2={geom.baselineY} stroke="var(--chart-axis-label)" stroke-width="1" stroke-dasharray="3 4" />
      <text class="axis" x={L + 2} y={geom.baselineY - 5}>prev close</text>
    {/if}
    {#if geom.investedD}
      <path d={geom.investedD} fill="none" stroke="var(--chart-invested-line)" stroke-width="1.3" stroke-dasharray="4 4" />
    {/if}
    {#if geom.areaD}
      <path d={geom.areaD} fill="url(#pchart-{uid})" />
    {/if}
    {#if geom.lineD}
      <path d={geom.lineD} fill="none" stroke={geom.lineColor} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity={dimmed ? 0.85 : 1} />
    {/if}
    {#if geom.ghostD}
      <path d={geom.ghostD} fill="none" stroke="var(--spark-ghost)" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round" />
    {/if}
    {#if topCaption}
      <text class="top-caption" x={(L + R) / 2} y={T + 12} text-anchor="middle">{topCaption}</text>
    {/if}
    {#if geom.now && showNow}
      <circle class="now-halo" cx={geom.now.x} cy={geom.now.y} r="7" fill={geom.lineColor} opacity="0.18" />
      <circle cx={geom.now.x} cy={geom.now.y} r="3.5" fill={geom.lineColor} />
    {/if}
    {#each geom.ticks as t}
      <text class="axis" x={t.x} y={height - 4} text-anchor="middle">{t.label}</text>
    {/each}
    {#if geom.empty && emptyLabel}
      <text class="empty-label" x={VW / 2} y={(T + B) / 2} text-anchor="middle">{emptyLabel}</text>
    {/if}
  {/if}
</svg>
</div>

<style>
  .chart-box { min-width: 0; }
  .axis {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    fill: var(--chart-axis-label);
  }
  .empty-label {
    font-family: inherit;
    font-size: 11px;
    fill: var(--fg-faint);
  }
  .top-caption {
    font-family: inherit;
    font-size: 10px;
    fill: var(--fg-faint);
  }
  .now-halo {
    transform-box: fill-box;
    transform-origin: center;
    animation: pulse 2.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.18; transform: scale(1); }
    50%      { opacity: 0.05; transform: scale(1.4); }
  }
  @media (prefers-reduced-motion: reduce) {
    .now-halo { animation: none; }
  }
</style>
