import { themeStore } from '$lib/stores/theme.svelte';

/**
 * Shared theme-aware ECharts scaffolding: colors derived from
 * themeStore.isDark plus common axis/tooltip option fragments.
 */
export interface ChartColors {
  grid: string;
  text: string;
  tooltipBg: string;
  tooltipBord: string;
  tooltipText: string;
  /** Dashed reference lines (cost basis, prev close, zero). */
  dashedRef: string;
}

export function chartColors(): ChartColors {
  const isDark = themeStore.isDark;
  return {
    grid:        isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    text:        isDark ? '#8b929c' : '#6a6f78',
    tooltipBg:   isDark ? '#15181c' : '#ffffff',
    tooltipBord: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(16,18,22,0.12)',
    tooltipText: isDark ? '#f2f4f7' : '#101216',
    dashedRef:   isDark ? '#3a3f46' : '#c8c8c8',
  };
}

/** Privacy-aware €-axis label: `€1.2k` / `€850` or `●●` in privacy mode. */
export function euroAxisFormatter(n: number): string {
  if (themeStore.privacyMode) return '●●';
  return Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`;
}

/** Base axis-trigger tooltip fragment (colors only; add formatter per chart). */
export function baseTooltip(c: ChartColors) {
  return {
    trigger: 'axis' as const,
    backgroundColor: c.tooltipBg,
    borderColor: c.tooltipBord,
    borderWidth: 1,
    textStyle: { fontSize: 11, color: c.tooltipText },
  };
}

/** Category x-axis without axis/tick/split lines, muted labels. */
export function baseCategoryXAxis(c: ChartColors, data: string[], axisLabel: object) {
  return {
    type: 'category' as const,
    data,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: c.text, fontSize: 10, ...axisLabel },
  };
}

/** Value y-axis with themed split lines and muted labels. */
export function baseValueYAxis(c: ChartColors, formatter: (n: number) => string, extra: object = {}) {
  return {
    type: 'value' as const,
    splitLine: { lineStyle: { color: c.grid } },
    axisLabel: { color: c.text, fontSize: 10, formatter },
    ...extra,
  };
}
