<script lang="ts" module>
  /** One tooltip body line; tones map to theme colors in this component. */
  export interface ChartTipLine {
    text: string;
    tone: 'main' | 'muted' | 'pos' | 'neg' | 'bench';
  }
  export interface ChartTip {
    title: string;
    lines: ChartTipLine[];
  }
  /** Transaction marker on the value line, anchored to a data index. */
  export interface ChartMarker {
    i: number;
    color: string;
  }
  /**
   * Dated event on the value line (history mode): a dashed vertical rule, a dot
   * at the price of that day, and a label under the axis. Used for the last
   * reported earnings date — there is only ever one.
   */
  export interface ChartEvent {
    i: number;
    label: string;
  }
  /** Session-shading band (intraday mode), in the minute-of-day x-domain. */
  export interface ChartBand {
    start: number;
    end: number;
    label: string;
    strong?: boolean;
  }
</script>

<script lang="ts">
  /**
   * Hero SVG chart (dashboard, stock detail).
   * The SVG is sized to the measured container width — geometry recomputes
   * on resize instead of stretching a fixed viewBox, so text keeps its size.
   *
   * - mode 'history':  daily/weekly closes with optional dashed invested line.
   * - mode 'intraday': session-bounded line vs a dashed prev-close baseline,
   *   drawn only up to the latest point, with a pulsing "now" dot. Pre-open
   *   (`dimmed`) renders the previous session grey without fill. Extended-hours
   *   ticks are never drawn — only regular sessions appear on this chart.
   *
   * Optional v3 features (dashboard portfolio chart; all off by default):
   * session bands, gain/loss fill vs invested, benchmark overlay, transaction
   * markers, high/low tags, and a crosshair + tooltip (enabled by `tooltip`).
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
    /** Caption centered near the top of the plot ("Previous session · opens 15:30"). */
    topCaption?: string | null;
    /* v3 features */
    /** Intraday session-shading bands (EU / EU+US / US). */
    bands?: ChartBand[];
    /** History: overlay series in the same x/y units as `data` (already re-based). */
    benchmark?: { x: number; value: number }[];
    /** History € mode: fill between value and invested lines, drop the plain area. */
    gainFill?: boolean;
    /** Transaction dots on the value line at data indices. */
    markers?: ChartMarker[];
    /** Dated events (history mode): rule + dot + axis label at a data index. */
    events?: ChartEvent[];
    /** Tag the period max/min values (omitted when flat). */
    showHiLo?: boolean;
    /** Crosshair + tooltip content for a data index; enables hover handling. */
    tooltip?: ((i: number) => ChartTip | null) | null;
  }
  const {
    mode, height = 200, formatY, xTicks = [],
    data = [], invested = [],
    points = [], prevClose, sessionStart, sessionEnd, emptyLabel,
    padX = 20, showNow = true,
    dimmed = false, topCaption = null,
    bands = [], benchmark = [], gainFill = false, markers = [], events = [],
    showHiLo = false, tooltip = null,
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
    lineColor: string;
    baselineY: number | null;
    now: { x: number; y: number } | null;
    empty: boolean;
    /** Screen coords of the main series (crosshair snapping, markers, hi/lo). */
    pts: [number, number][];
    bandRects: { x: number; w: number; labelX: number; label: string; strong: boolean }[];
    benchD: string;
    gainSegs: { d: string; pos: boolean }[];
    markerPts: { x: number; y: number; color: string }[];
    eventPts: { x: number; y: number; label: string }[];
    hiLos: { cx: number; cy: number; lx: number; ly: number; label: string }[];
  }

  function pathD(pts: [number, number][]): string {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  }

  /**
   * Filled polygons between the value and invested lines, split at crossings
   * (design: gain regions green, loss regions red, both at low alpha).
   */
  function diffSegs(xs: number[], vals: number[], invs: number[], sy: (v: number) => number): { d: string; pos: boolean }[] {
    const segs: { d: string; pos: boolean }[] = [];
    let cur: { pos: boolean; top: [number, number][]; bot: [number, number][] } | null = null;
    const flush = () => {
      if (cur && cur.top.length > 1) {
        const d = `M${cur.top.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`
          + ` L${cur.bot.slice().reverse().map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')} Z`;
        segs.push({ d, pos: cur.pos });
      }
      cur = null;
    };
    for (let i = 0; i < xs.length; i++) {
      const diff = vals[i]! - invs[i]!;
      const pos = diff >= 0;
      const pv: [number, number] = [xs[i]!, sy(vals[i]!)];
      const pi: [number, number] = [xs[i]!, sy(invs[i]!)];
      if (!cur) { cur = { pos, top: [pv], bot: [pi] }; continue; }
      if (pos === cur.pos) { cur.top.push(pv); cur.bot.push(pi); continue; }
      // Sign change: interpolate the crossing point so segments meet cleanly.
      const d0 = vals[i - 1]! - invs[i - 1]!;
      const t = d0 / (d0 - diff || 1);
      const xI = xs[i - 1]! + (xs[i]! - xs[i - 1]!) * t;
      const vI = vals[i - 1]! + (vals[i]! - vals[i - 1]!) * t;
      const pc: [number, number] = [xI, sy(vI)];
      cur.top.push(pc); cur.bot.push(pc); flush();
      cur = { pos, top: [pc, pv], bot: [pc, pi] };
    }
    flush();
    return segs;
  }

  /** Max/min tags over the displayed values (skipped when the series is flat). */
  function hiLoTags(pts: [number, number][], vals: number[]): Geom['hiLos'] {
    if (!showHiLo || pts.length < 2) return [];
    let iMin = 0, iMax = 0;
    vals.forEach((v, i) => {
      if (v < vals[iMin]!) iMin = i;
      if (v > vals[iMax]!) iMax = i;
    });
    if (iMin === iMax || vals[iMax]! === vals[iMin]!) return [];
    const clampX = (x: number) => Math.max(L + 26, Math.min(R - 26, x));
    return [
      { cx: pts[iMax]![0], cy: pts[iMax]![1], lx: clampX(pts[iMax]![0]), ly: pts[iMax]![1] - 7, label: formatY(vals[iMax]!) },
      { cx: pts[iMin]![0], cy: pts[iMin]![1], lx: clampX(pts[iMin]![0]), ly: pts[iMin]![1] + 13, label: formatY(vals[iMin]!) },
    ];
  }

  const geom = $derived.by((): Geom | null => {
    const bottom = B;
    // Transient layouts can measure a degenerate width — draw nothing.
    if (R - L < 10) return null;
    const none: Pick<Geom, 'pts' | 'bandRects' | 'benchD' | 'gainSegs' | 'markerPts' | 'eventPts' | 'hiLos'> = {
      pts: [], bandRects: [], benchD: '', gainSegs: [], markerPts: [], eventPts: [], hiLos: [],
    };
    if (mode === 'history') {
      if (data.length < 2) return null;
      const vals = data.map((d) => d.value);
      const invs = invested.map((d) => d.value);
      const benchVals = benchmark.map((d) => d.value);
      let lo = Math.min(...vals, ...(invs.length ? invs : [Infinity]), ...(benchVals.length ? benchVals : [Infinity]));
      let hi = Math.max(...vals, ...(invs.length ? invs : [-Infinity]), ...(benchVals.length ? benchVals : [-Infinity]));
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
      const fillOn = gainFill && invs.length === vals.length && invs.length >= 2;
      return {
        grid: [0, 0.5, 1].map((f) => {
          const v = hi - f * (hi - lo);
          return { y: sy(v), labelY: sy(v) - 4, label: formatY(v) };
        }),
        ticks: xTicks.map((t) => ({ x: sx(t.x), label: t.label })),
        lineD,
        // Gain-fill mode replaces the plain gradient area (design §4.2).
        areaD: fillOn ? '' : `${lineD} L${last[0].toFixed(1)} ${bottom} L${first[0].toFixed(1)} ${bottom} Z`,
        investedD: invs.length >= 2 ? pathD(invested.map((d) => [sx(d.x), sy(d.value)])) : '',
        lineColor: vals[vals.length - 1]! >= vals[0]! ? 'var(--c-pos)' : 'var(--c-neg)',
        baselineY: null,
        now: null,
        empty: false,
        ...none,
        pts,
        benchD: benchVals.length >= 2 ? pathD(benchmark.map((d) => [sx(d.x), sy(d.value)])) : '',
        gainSegs: fillOn ? diffSegs(pts.map((p) => p[0]), vals, invs, sy) : [],
        markerPts: markers
          .filter((m) => m.i >= 0 && m.i < pts.length)
          .map((m) => ({ x: pts[m.i]![0], y: pts[m.i]![1], color: m.color })),
        eventPts: events
          .filter((e) => e.i >= 0 && e.i < pts.length)
          .map((e) => ({ x: pts[e.i]![0], y: pts[e.i]![1], label: e.label })),
        hiLos: hiLoTags(pts, vals),
      };
    }

    // intraday mode
    if (prevClose == null || sessionStart == null || sessionEnd == null || sessionEnd <= sessionStart) return null;
    const vals = points.map((p) => p.value);
    let lo = Math.min(prevClose, ...vals);
    let hi = Math.max(prevClose, ...vals);
    const pad = (hi - lo) * 0.15 || Math.abs(prevClose) * 0.005 || 1;
    lo -= pad; hi += pad;
    const sx = (m: number) => L + ((m - sessionStart) / (sessionEnd - sessionStart)) * (R - L);
    const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (bottom - T);
    const grid = [0, 0.5, 1].map((f) => {
      const v = hi - f * (hi - lo);
      return { y: sy(v), labelY: sy(v) - 4, label: formatY(v) };
    });
    const ticks = xTicks.map((t) => ({ x: sx(t.x), label: t.label }));
    const bandRects = bands
      .filter((b) => b.end > b.start)
      .map((b) => {
        const xA = Math.max(L, sx(b.start));
        const xB = Math.min(R, sx(b.end));
        return { x: xA, w: xB - xA, labelX: (xA + xB) / 2, label: b.label, strong: b.strong ?? false };
      })
      .filter((b) => b.w > 0);
    if (points.length < 2) {
      return {
        grid, ticks, lineD: '', areaD: '', investedD: '',
        lineColor: 'var(--c-pos)', baselineY: sy(prevClose), now: null, empty: true,
        ...none, bandRects,
      };
    }
    const pts: [number, number][] = points.map((p) => [sx(p.min), sy(p.value)]);
    const lineD = pathD(pts);
    const last = pts[pts.length - 1]!;
    const first = pts[0]!;
    return {
      grid, ticks,
      lineD,
      areaD: dimmed ? '' : `${lineD} L${last[0].toFixed(1)} ${bottom} L${first[0].toFixed(1)} ${bottom} Z`,
      investedD: '',
      lineColor: dimmed
        ? 'var(--spark-dim)'
        : vals[vals.length - 1]! >= prevClose ? 'var(--c-pos)' : 'var(--c-neg)',
      baselineY: sy(prevClose),
      now: dimmed ? null : { x: last[0], y: last[1] },
      empty: false,
      ...none,
      pts,
      bandRects,
      hiLos: dimmed ? [] : hiLoTags(pts, vals),
    };
  });

  // ── Crosshair + tooltip (enabled by the `tooltip` prop) ─────────────────────
  let hoverI = $state<number | null>(null);

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (!tooltip || !geom || geom.pts.length === 0) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX == null) return;
    const cx = clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < geom.pts.length; i++) {
      const d = Math.abs(geom.pts[i]![0] - cx);
      if (d < bd) { bd = d; best = i; }
    }
    if (hoverI !== best) hoverI = best;
  }
  function onPointerLeave() {
    hoverI = null;
  }

  const TIP_W = 190;
  const hover = $derived.by(() => {
    if (hoverI == null || !tooltip || !geom || geom.pts.length === 0) return null;
    const i = Math.min(hoverI, geom.pts.length - 1);
    const info = tooltip(i);
    if (!info) return null;
    const [x, y] = geom.pts[i]!;
    // Tooltip flips to the left side near the right edge.
    let left = x + 14;
    if (left + TIP_W > VW - 6) left = x - 14 - TIP_W;
    return { ...info, x, y, left };
  });
</script>

<div class="chart-box" bind:clientWidth={containerW}>
<svg
  width="100%"
  height={height}
  viewBox="0 0 {VW} {height}"
  style="display:block; touch-action:pan-y"
  role="presentation"
  onmousemove={onPointerMove}
  onmouseleave={onPointerLeave}
  ontouchstart={onPointerMove}
  ontouchmove={onPointerMove}
  ontouchend={onPointerLeave}
>
  {#if geom}
    <defs>
      <linearGradient id="pchart-{uid}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" style="stop-color:{geom.lineColor}" stop-opacity="0.16" />
        <stop offset="100%" style="stop-color:{geom.lineColor}" stop-opacity="0" />
      </linearGradient>
    </defs>
    {#each geom.bandRects as b}
      <rect x={b.x} y={T} width={b.w} height={B - T} fill={b.strong ? 'var(--chart-band-strong)' : 'var(--chart-band)'} />
      <text class="band-label" x={b.labelX} y={T + 9} text-anchor="middle">{b.label}</text>
    {/each}
    {#each geom.grid as g}
      <line x1={L} x2={R} y1={g.y} y2={g.y} stroke="var(--chart-gridline)" stroke-width="1" />
      <text class="axis" x={R - 2} y={g.labelY} text-anchor="end">{g.label}</text>
    {/each}
    <!-- Prev-close baseline: the dashed line is the established idiom and the
         tooltip carries the delta, so no text label — it only ever collided
         with hi/lo tags and the line itself near the open. -->
    <!-- Event rule sits under the series: it dates the line, it isn't the subject. -->
    {#each geom.eventPts as e}
      <line x1={e.x} x2={e.x} y1={T} y2={B} stroke="var(--chart-event-line)" stroke-width="1" stroke-dasharray="2 4" />
    {/each}
    {#if geom.baselineY != null}
      <line x1={L} x2={R} y1={geom.baselineY} y2={geom.baselineY} stroke="var(--chart-axis-label)" stroke-width="1" stroke-dasharray="3 4" />
    {/if}
    {#each geom.gainSegs as seg}
      <path d={seg.d} fill={seg.pos ? 'var(--chart-fill-pos)' : 'var(--chart-fill-neg)'} />
    {/each}
    {#if geom.investedD}
      <path d={geom.investedD} fill="none" stroke="var(--chart-invested-line)" stroke-width="1.3" stroke-dasharray="4 4" />
    {/if}
    {#if geom.areaD}
      <path d={geom.areaD} fill="url(#pchart-{uid})" />
    {/if}
    {#if geom.benchD}
      <path d={geom.benchD} fill="none" stroke="var(--c-bench)" stroke-width="1.5" opacity="0.85" stroke-linejoin="round" />
    {/if}
    {#if geom.lineD}
      <path d={geom.lineD} fill="none" stroke={geom.lineColor} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity={dimmed ? 0.85 : 1} />
    {/if}
    {#each geom.markerPts as m}
      <circle cx={m.x} cy={m.y} r="3" fill={m.color} stroke="var(--bg)" stroke-width="1.5" />
    {/each}
    {#each geom.eventPts as e}
      <circle cx={e.x} cy={e.y} r="3" fill="var(--fg)" stroke="var(--bg)" stroke-width="1.5" />
      <text class="event-label" x={Math.max(L + 14, Math.min(R - 14, e.x))} y={height - 4} text-anchor="middle">{e.label}</text>
    {/each}
    {#each geom.hiLos as h}
      <circle cx={h.cx} cy={h.cy} r="2" fill="var(--chart-hilo-dot)" />
      <text class="hilo-label" x={h.lx} y={h.ly} text-anchor="middle">{h.label}</text>
    {/each}
    {#if topCaption}
      <text class="top-caption" x={(L + R) / 2} y={T + 12} text-anchor="middle">{topCaption}</text>
    {/if}
    {#if hover}
      <line x1={hover.x} x2={hover.x} y1={T} y2={B} stroke="var(--chart-crosshair)" stroke-width="1" stroke-dasharray="2 3" />
      <circle cx={hover.x} cy={hover.y} r="3.5" fill={geom.lineColor} stroke="var(--bg)" stroke-width="1.5" />
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
{#if hover}
  <div class="tip" style="left:{hover.left}px">
    <div class="tip-title">{hover.title}</div>
    {#each hover.lines as line}
      <div class="tip-line {line.tone}">{line.text}</div>
    {/each}
  </div>
{/if}
</div>

<style>
  .chart-box {
    min-width: 0;
    position: relative;
  }
  .axis {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    fill: var(--chart-axis-label);
  }
  .band-label {
    font-family: inherit;
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    fill: var(--chart-band-label);
  }
  .event-label {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    fill: var(--fg-faint);
  }
  .hilo-label {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    fill: var(--chart-hilo-label);
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

  /* ── Crosshair tooltip ── */
  .tip {
    position: absolute;
    top: 10px;
    width: 190px;
    box-sizing: border-box;
    background: var(--tip-bg);
    border: 1px solid var(--tip-border);
    border-radius: 10px;
    box-shadow: var(--tip-shadow);
    padding: 9px 11px;
    pointer-events: none;
    z-index: 20;
  }
  .tip-title {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--fg-faint);
  }
  .tip-line {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 600;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tip-line.main {
    font-size: 14px;
    font-weight: 700;
    color: var(--fg);
  }
  .tip-line.muted { color: var(--fg-faint); }
  .tip-line.pos   { color: var(--c-pos); }
  .tip-line.neg   { color: var(--c-neg); }
  .tip-line.bench { color: var(--c-bench); }
</style>
