import type * as echarts from 'echarts';
import { portfolioStore } from '$lib/stores/portfolio.svelte';
import { intradayStore } from '$lib/stores/intraday.svelte';
import { themeStore } from '$lib/stores/theme.svelte';
import { fmt } from '$lib/utils/fmt';
import { getColor } from '$lib/utils/color';
import { EU_EXCHANGE_RE } from '$lib/market';
import { toEurLive, liveRateFor } from '$lib/fx';
import { chartColors, euroAxisFormatter, baseTooltip, baseCategoryXAxis, baseValueYAxis } from './base';
import type { Period } from '$lib/utils/period';
import type { ChartPoint } from '$lib/types/portfolio';

export type DashboardView = 'total' | 'individual' | 'pct' | 'pl';

function periodAxisLabel(data: ChartPoint[], p: Period) {
  const keyOf = (d: Date): string => {
    if (p === '1m')  return String(Math.floor(d.getTime() / 86400000 / 7));
    if (p === '3m')  return String(Math.floor(d.getTime() / 86400000 / 14));
    if (p === '6m' || p === 'ytd' || p === '1y') return `${d.getFullYear()}-${d.getMonth()}`;
    if (p === '2y' || p === '3y') return `${d.getFullYear()}-${Math.floor(d.getMonth() / 3)}`;
    if (p === 'total') return String(d.getFullYear());
    return String(Math.floor(d.getTime() / 86400000));
  };
  const show: boolean[] = new Array(data.length).fill(false);
  let last = '';
  for (let i = 0; i < data.length; i++) {
    const k = keyOf(new Date(data[i]!.date));
    if (k !== last) { show[i] = true; last = k; }
  }
  const fmtLabel = (value: string) => {
    const d = new Date(value);
    if (p === '1m' || p === '3m') return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
    if (p === '6m' || p === 'ytd' || p === '1y') return d.toLocaleDateString('nl-BE', { month: 'short' });
    if (p === '2y' || p === '3y') return `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(-2)}`;
    if (p === 'total') return String(d.getFullYear());
    return value;
  };
  return { interval: ((index: number) => show[index] === true) as unknown as number, formatter: fmtLabel };
}

/** Historical (non-1D) dashboard chart. */
export function buildOption(
  data: ChartPoint[],
  v: DashboardView,
  p: Period,
  visibleTickers: string[],
): echarts.EChartsOption {
  const c = chartColors();
  const xLabel = periodAxisLabel(data, p);
  const dates = data.map((d) => d.date);

  if (v === 'total') {
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false },
      xAxis: baseCategoryXAxis(c, dates, { interval: xLabel.interval, formatter: xLabel.formatter }),
      yAxis: baseValueYAxis(c, euroAxisFormatter),
      tooltip: {
        ...baseTooltip(c),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || !params[0]) return '';
          const date = new Date(params[0].axisValue as string).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
          const lines = (params as Array<{ seriesName: string; marker: string; value: number }>)
            .filter((p) => p.seriesName !== '__cost')
            .map((p) => `<div>${p.marker}${p.seriesName}: ${themeStore.privacyMode ? '●●●' : fmt(p.value)}</div>`);
          return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines.join('')}`;
        },
      },
      series: [
        {
          name: 'Portefeuille', type: 'line', data: data.map((d) => d.value),
          smooth: false, symbol: 'none',
          lineStyle: { color: 'var(--accent)', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'oklch(62% 0.14 255 / 0.18)' }, { offset: 1, color: 'oklch(62% 0.14 255 / 0.02)' }] } },
        },
        {
          name: '__cost', type: 'line', data: data.map((d) => d.invested),
          smooth: false, symbol: 'none',
          lineStyle: { color: c.dashedRef, width: 1, type: 'dashed' },
          areaStyle: { color: themeStore.isDark ? 'rgba(80,80,80,0.07)' : 'rgba(0,0,0,0.03)' },
        },
      ],
    };
  }

  if (v === 'individual') {
    const tickers = [...visibleTickers].reverse();
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: baseCategoryXAxis(c, dates, { interval: xLabel.interval, formatter: xLabel.formatter }),
      yAxis: baseValueYAxis(c, euroAxisFormatter),
      tooltip: baseTooltip(c),
      series: tickers.map((t) => ({ name: t, type: 'line' as const, stack: 'total', data: data.map((d) => d.positions[t]?.value ?? 0), smooth: false, symbol: 'none', lineStyle: { color: getColor(t), width: 1.5 }, areaStyle: { color: getColor(t) + '28' } })),
    };
  }

  if (v === 'pct') {
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: baseCategoryXAxis(c, dates, { interval: xLabel.interval, formatter: xLabel.formatter }),
      yAxis: baseValueYAxis(c, (n: number) => `${+n.toFixed(1)}%`),
      tooltip: baseTooltip(c),
      series: visibleTickers.map((t) => ({
        name: t, type: 'line' as const, data: data.map((d) => { const s = d.positions[t]; return s && s.cost > 0 ? +(((s.value - s.cost) / s.cost) * 100).toFixed(1) : null; }),
        smooth: false, symbol: 'none', connectNulls: true, lineStyle: { color: getColor(t), width: 2 },
      })),
    };
  }

  const tickers2 = [...visibleTickers].reverse();
  return {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 16, bottom: 32, left: 60 },
    xAxis: baseCategoryXAxis(c, dates, { interval: 'auto' }),
    yAxis: baseValueYAxis(c, euroAxisFormatter),
    tooltip: baseTooltip(c),
    series: tickers2.map((t) => ({
      name: t, type: 'line' as const, stack: 'total',
      data: data.map((d) => { const s = d.positions[t]; return s ? s.value - s.cost : null; }),
      smooth: false, symbol: 'none', connectNulls: true, lineStyle: { color: getColor(t), width: 1.5 }, areaStyle: { color: getColor(t) + '28' },
    })),
  };
}

/** Intraday (1D) dashboard chart built from the intraday store. */
export function build1DOption(v: DashboardView): echarts.EChartsOption | null {
  const tickers = portfolioStore.currentTickers;
  if (!tickers.length || !intradayStore.loaded) return null;
  // Require a live rate for every held non-EUR currency before rendering.
  const rates = intradayStore.liveRates;
  if (portfolioStore.positions.some((p) => liveRateFor(p.currency, rates) == null)) return null;
  const c = chartColors();

  const allTsSet = new Set<number>();
  const priceMap: Record<string, Map<number, number>> = {};
  const prevCloseMap: Record<string, number> = {};
  const regionsPresent = new Set<'EU' | 'US'>();
  let sessionDate: string | null = null;

  for (const ticker of tickers) {
    const yahoo = portfolioStore.tickerMeta[ticker]?.yahoo ?? ticker;
    const intra = intradayStore.data[yahoo];
    if (!intra) continue;
    prevCloseMap[ticker] = intra.previousClose ?? 0;
    const pts = intra.points ?? [];
    priceMap[ticker] = new Map(pts.map((p) => [p.ts, p.close]));
    for (const pt of pts) allTsSet.add(pt.ts);
    regionsPresent.add(EU_EXCHANGE_RE.test(yahoo) ? 'EU' : 'US');
    if (!sessionDate && intra.date) sessionDate = intra.date;
  }

  const unixAtLocal = (dateStr: string, h: number, m: number, tz: string): number => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const naiveUtc = Date.UTC(y!, mo! - 1, d!, h, m);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(naiveUtc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.floor((naiveUtc - (tzAsUtc - naiveUtc)) / 1000);
  };

  const sessions: { region: string; open: number; close: number }[] = [];
  if (sessionDate) {
    if (regionsPresent.has('EU')) sessions.push({ region: 'EU', open: unixAtLocal(sessionDate, 9, 0, 'Europe/Berlin'), close: unixAtLocal(sessionDate, 17, 30, 'Europe/Berlin') });
    if (regionsPresent.has('US')) sessions.push({ region: 'US', open: unixAtLocal(sessionDate, 9, 30, 'America/New_York'), close: unixAtLocal(sessionDate, 16, 0, 'America/New_York') });
    if (sessions.length > 0) {
      const fullStart = Math.min(...sessions.map((s) => s.open));
      const fullEnd   = Math.max(...sessions.map((s) => s.close));
      for (let ts = fullStart; ts <= fullEnd; ts += 300) allTsSet.add(ts);
    }
  }

  if (allTsSet.size === 0) return null;
  const nowSec   = Date.now() / 1000;
  const sortedTs = [...allTsSet].sort((a, b) => a - b);
  const labels   = sortedTs.map((ts) => new Date(ts * 1000).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionMarks: any[] = [];
  for (const { region, open, close } of sessions) {
    const openIdx  = sortedTs.findIndex((ts) => ts >= open);
    const closeIdx = sortedTs.findIndex((ts) => ts >= close);
    // Compact, low-contrast session markers — easier to read on mobile.
    const markStyle = { color: 'var(--fg-muted)', type: 'dashed' as const, width: 1, opacity: 0.35 };
    if (openIdx >= 0) {
      sessionMarks.push({
        name: `${region} Open`, xAxis: openIdx,
        lineStyle: markStyle,
        label: { formatter: `${region}↑`, fontSize: 9, color: 'var(--fg-muted)', position: 'insideStartTop' },
      });
    }
    if (closeIdx >= 0) {
      sessionMarks.push({
        name: `${region} Sluit`, xAxis: closeIdx,
        lineStyle: markStyle,
        label: { formatter: `${region}↓`, fontSize: 9, color: 'var(--fg-muted)', position: 'insideEndBottom' },
      });
    }
  }

  // On narrow viewports, only label every 2 hours so labels don't overlap.
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 540;
  const labelInterval = ((index: number) => {
    const ts = sortedTs[index];
    if (ts === undefined) return false;
    const d = new Date(ts * 1000);
    if (d.getMinutes() !== 0) return false;
    return isNarrow ? d.getHours() % 2 === 0 : true;
  }) as unknown as number;

  const commonAxes = {
    xAxis: baseCategoryXAxis(c, labels, {
      fontSize: isNarrow ? 9 : 10,
      interval: labelInterval,
      hideOverlap: true,
      margin: 10,
    }),
    grid: {
      top: 16,
      right: isNarrow ? 12 : 16,
      bottom: 28,
      left: 8,
      containLabel: true, // ← let echarts measure y-axis label width
    },
  };

  const posFor    = (t: string) => portfolioStore.positions.find((p) => p.ticker === t);
  const eurFor    = (t: string, amount: number) => toEurLive(posFor(t)?.currency, amount, rates) ?? 0;
  const sharesFor = (t: string) => posFor(t)?.shares ?? 0;

  const priceOverTime: Record<string, number[]> = {};
  for (const ticker of tickers) {
    const pm = priceMap[ticker];
    const arr: number[] = [];
    let last = prevCloseMap[ticker] ?? 0;
    for (const ts of sortedTs) { const p = pm?.get(ts); if (p != null) last = p; arr.push(last); }
    priceOverTime[ticker] = arr;
  }

  if (v === 'total') {
    const seriesValues: (number | null)[] = [];
    for (let i = 0; i < sortedTs.length; i++) {
      if (sortedTs[i]! > nowSec) { seriesValues.push(null); continue; }
      let total = 0;
      for (const ticker of tickers) total += eurFor(ticker, sharesFor(ticker) * (priceOverTime[ticker]?.[i] ?? 0));
      seriesValues.push(Math.round(total * 100) / 100);
    }
    let prevCloseTotal = 0;
    for (const ticker of tickers) prevCloseTotal += eurFor(ticker, sharesFor(ticker) * (prevCloseMap[ticker] ?? 0));
    prevCloseTotal = Math.round(prevCloseTotal * 100) / 100;
    const lastVal = seriesValues.findLast((v) => v !== null) ?? 0;
    const isUp    = lastVal >= prevCloseTotal;
    const lineClr = isUp ? 'var(--c-pos)' : 'var(--c-neg)';
    const areaClr = isUp ? 'rgba(52,211,153,' : 'rgba(248,113,113,';
    const markLineData = [
      { name: 'Vorige slotkoers', yAxis: prevCloseTotal, lineStyle: { color: c.dashedRef, type: 'dashed', width: 1 }, label: { formatter: () => themeStore.privacyMode ? '●●' : (prevCloseTotal >= 1000 ? `€${(prevCloseTotal / 1000).toFixed(1)}k` : `€${Math.round(prevCloseTotal)}`), position: 'insideEndTop', fontSize: 10, color: c.text } },
      ...sessionMarks,
    ];
    const actualValues = seriesValues.filter((v): v is number => v !== null);
    const maxDev = Math.max(...actualValues.map((v) => Math.abs(v - prevCloseTotal)), prevCloseTotal * 0.005);
    const yPad1D = maxDev * 1.1;
    return {
      backgroundColor: 'transparent', ...commonAxes,
      yAxis: baseValueYAxis(c, euroAxisFormatter, { scale: true, min: prevCloseTotal > 0 ? prevCloseTotal - yPad1D : undefined, max: prevCloseTotal > 0 ? prevCloseTotal + yPad1D : undefined }),
      tooltip: {
        ...baseTooltip(c),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || !params[0]) return '';
          const val  = params[0].value as number;
          const diff = val - prevCloseTotal;
          const pct  = prevCloseTotal > 0 ? (diff / prevCloseTotal) * 100 : 0;
          const sign = diff >= 0 ? '+' : '';
          const clr  = diff >= 0 ? 'var(--c-pos)' : 'var(--c-neg)';
          const valStr  = themeStore.privacyMode ? '●●●' : fmt(val);
          const diffStr = themeStore.privacyMode ? '●●' : fmt(diff);
          return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div><div>${valStr}</div><div style="color:${clr}">${sign}${diffStr} (${sign}${pct.toFixed(2)}%)</div>`;
        },
      },
      series: [{ name: 'Portefeuille', type: 'line', data: seriesValues, smooth: false, symbol: 'none', lineStyle: { color: lineClr, width: 2 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: areaClr + '0.2)' }, { offset: 1, color: areaClr + '0.02)' }] } }, markLine: { silent: true, symbol: 'none', data: markLineData } }],
    };
  }

  const stacked = v === 'individual' || v === 'pl';
  const tickersOrdered = stacked ? [...tickers].reverse() : tickers;
  const series = tickersOrdered.map((t, idx) => {
    const prev = prevCloseMap[t] ?? 0;
    const shr  = sharesFor(t);
    const prices = priceOverTime[t] ?? [];
    const data: (number | null)[] = prices.map((p, i) => {
      if (sortedTs[i]! > nowSec) return null;
      if (v === 'individual') return Math.round(eurFor(t, shr * p) * 100) / 100;
      if (v === 'pct')        return prev > 0 ? +(((p - prev) / prev) * 100).toFixed(3) : 0;
      return Math.round(eurFor(t, (p - prev) * shr) * 100) / 100;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = { name: t, type: 'line', data, smooth: false, symbol: 'none', lineStyle: { color: getColor(t), width: v === 'pct' ? 2 : 1.5 } };
    if (stacked) { s.stack = 'total'; s.areaStyle = { color: getColor(t) + '28' }; }
    if (idx === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markData: any[] = [...sessionMarks];
      if (v === 'pct' || v === 'pl') markData.push({ name: 'Nul', yAxis: 0, lineStyle: { color: c.dashedRef, type: 'dashed', width: 1 }, label: { show: false } });
      s.markLine = { silent: true, symbol: 'none', data: markData };
    }
    return s;
  });
  return {
    backgroundColor: 'transparent', ...commonAxes,
    yAxis: baseValueYAxis(c, v === 'pct' ? (n: number) => `${+n.toFixed(1)}%` : euroAxisFormatter, { scale: true }),
    tooltip: baseTooltip(c),
    series,
  };
}
