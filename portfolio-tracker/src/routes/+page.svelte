<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fmt, fmtPct } from '$lib/utils/fmt';
  import { filterByPeriod } from '$lib/utils/period';
  import { getColor } from '$lib/utils/color';
  import { sparklineSVG, isExchangeOpen, getTradingMins, normalizeMarketState, EU_EXCHANGE_RE } from '$lib/utils/exchange';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import type { Period } from '$lib/utils/period';
  import type { ChartPoint } from '$lib/types/portfolio';

  type View = 'total' | 'individual' | 'pct' | 'pl';

  let period = $state<Period>('1d');
  let view   = $state<View>('total');

  const visibleTickers = $derived(portfolioStore.currentTickers);

  const filtered = $derived(
    period === '1d'
      ? portfolioStore.chartData
      : filterByPeriod(portfolioStore.chartData, period),
  );

  const periodPl = $derived(() => {
    if (filtered.length < 2) return null;
    const first = filtered[0]!;
    const last  = filtered[filtered.length - 1]!;
    const fv = (first.value as number) ?? 0;
    const lv = (last.value  as number) ?? 0;
    const fi = (first.invested as number) ?? 0;
    const li = (last.invested  as number) ?? 0;
    // pl = change in unrealized PL (Δvalue - Δcost) → cancels cash flow for buy-only
    // pct normalized against end-of-period invested, matching the header's PL/totalInvested
    const pl   = (lv - li) - (fv - fi);
    const base = li > 0 ? li : fi;
    return { pl, pct: base > 0 ? (pl / base) * 100 : 0 };
  });

  // 1D change derived from intraday data (matches the intraday chart's prevCloseTotal/lastVal)
  const day1Pl = $derived(() => {
    const tickers = portfolioStore.currentTickers;
    if (!tickers.length || !intradayStore.loaded) return null;
    const fxRate = intradayStore.liveEurUsd;
    let prevCloseTotal = 0;
    let currentTotal   = 0;
    for (const ticker of tickers) {
      const yahoo  = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      const intra  = intradayStore.data[yahoo];
      if (!intra) continue;
      const isEu = EU_EXCHANGE_RE.test(yahoo);
      if (!isEu && fxRate == null) continue; // skip USD positions if FX rate not yet available
      const shares    = portfolioStore.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
      const prevClose = intra.previousClose ?? 0;
      const pts       = intra.points ?? [];
      const lastPrice = pts[pts.length - 1]?.close ?? prevClose;
      const fx = isEu ? 1 : fxRate!;
      prevCloseTotal += (shares * prevClose) / fx;
      currentTotal   += (shares * lastPrice) / fx;
    }
    if (prevCloseTotal <= 0) return null;
    const diff = currentTotal - prevCloseTotal;
    return { pl: diff, pct: (diff / prevCloseTotal) * 100 };
  });

  // ── Intraday card logic (merged from /intraday) ─────────────────────────────
  interface SparkCard {
    ticker: string;
    yahoo: string;
    label: string;
    shares: number;
    prevClose: number | null;
    price: number | null;
    changePct: number | null;
    changeEur: number | null;
    marketState: string;
    sparkHtml: string;
  }

  const cards = $derived((): SparkCard[] => {
    return portfolioStore.currentTickers.map((ticker) => {
      const meta  = portfolioStore.tickerMeta[ticker];
      const yahoo = (meta?.['yahoo'] as string | undefined) ?? ticker;
      const label = (meta?.['label'] as string | undefined) ?? ticker;
      const pos   = portfolioStore.positions.find((p) => p.ticker === ticker);
      const shares = pos?.shares ?? 0;

      const intra = intradayStore.data[yahoo];
      const prevClose   = intra?.previousClose ?? null;
      const pts         = intra?.points ?? [];
      const lastPt      = pts[pts.length - 1];
      const price       = lastPt?.close ?? null;
      const tradingMins = getTradingMins(yahoo);

      const changePct = price != null && prevClose
        ? ((price - prevClose) / prevClose) * 100
        : null;
      const isEu = EU_EXCHANGE_RE.test(yahoo);
      const fx = isEu ? 1 : intradayStore.liveEurUsd;
      const changeEur = price != null && prevClose && shares && fx != null
        ? ((price - prevClose) * shares) / fx
        : null;

      const rawState    = intra?.marketState ?? '';
      const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
      const muted       = marketState !== 'REGULAR';
      const sparkHtml   = pts.length >= 2 && prevClose
        ? sparklineSVG(pts, prevClose, tradingMins, muted)
        : '';

      return { ticker, yahoo, label, shares, prevClose, price, changePct, changeEur, marketState, sparkHtml };
    });
  });

  function stateLabel(s: string) {
    if (s === 'REGULAR') return 'Open';
    if (s === 'PRE')     return 'Pre';
    if (s === 'POST')    return 'Post';
    return 'Gesloten';
  }
  function stateClass(s: string) {
    if (s === 'REGULAR') return 'badge-open';
    if (s === 'PRE' || s === 'POST') return 'badge-ext';
    return 'badge-closed';
  }

  const totalDayPl    = $derived(cards().reduce((s, c) => s + (c.changeEur ?? 0), 0));
  const totalValue    = $derived(portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const totalDayPlPct = $derived(totalValue - totalDayPl > 0 ? (totalDayPl / (totalValue - totalDayPl)) * 100 : 0);

  const dayPlMap = $derived(() => {
    const m: Record<string, number | null> = {};
    for (const c of cards()) m[c.ticker] = c.changeEur;
    return m;
  });

  // ── ECharts option builder ──────────────────────────────────────────────────
  import type * as echarts from 'echarts';

  // Pick a fixed label cadence per period so the x-axis isn't a random scatter.
  // Returns: which indices show a label + how to format the YYYY-MM-DD value.
  function periodAxisLabel(data: ChartPoint[], p: Period) {
    const keyOf = (d: Date): string => {
      if (p === '1m')  return String(Math.floor(d.getTime() / 86400000 / 7));   // weekly
      if (p === '3m')  return String(Math.floor(d.getTime() / 86400000 / 14));  // bi-weekly
      if (p === '6m' || p === 'ytd' || p === '1y')
        return `${d.getFullYear()}-${d.getMonth()}`;                            // monthly
      if (p === '2y' || p === '3y')
        return `${d.getFullYear()}-${Math.floor(d.getMonth() / 3)}`;            // quarterly
      if (p === 'total') return String(d.getFullYear());                        // yearly
      return String(Math.floor(d.getTime() / 86400000));                        // daily fallback
    };
    const show: boolean[] = new Array(data.length).fill(false);
    let last = '';
    for (let i = 0; i < data.length; i++) {
      const k = keyOf(new Date(data[i]!.date as string));
      if (k !== last) { show[i] = true; last = k; }
    }
    const fmt = (value: string) => {
      const d = new Date(value);
      if (p === '1m' || p === '3m')
        return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
      if (p === '6m' || p === 'ytd' || p === '1y')
        return d.toLocaleDateString('nl-BE', { month: 'short' });
      if (p === '2y' || p === '3y')
        return `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(-2)}`;
      if (p === 'total') return String(d.getFullYear());
      return value;
    };
    return {
      interval: ((index: number) => show[index] === true) as unknown as number,
      formatter: fmt,
    };
  }

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1d',    label: '1D' },
    { key: '1m',    label: '1M' },
    { key: '3m',    label: '3M' },
    { key: '6m',    label: '6M' },
    { key: 'ytd',   label: 'YTD' },
    { key: '1y',    label: '1Y' },
    { key: '2y',    label: '2Y' },
    { key: '3y',    label: '3Y' },
    { key: 'total', label: 'Max' },
  ];

  const VIEWS: { key: View; label: string }[] = [
    { key: 'total',      label: 'Totaal' },
    { key: 'individual', label: 'Per positie' },
    { key: 'pct',        label: 'Rendement %' },
    { key: 'pl',         label: 'Winst €' },
  ];

  const UNITS: { key: Exclude<View, 'total'>; label: string }[] = [
    { key: 'individual', label: 'Waarde €' },
    { key: 'pct',        label: 'Rendement %' },
    { key: 'pl',         label: 'Winst €' },
  ];

  function buildOption(data: ChartPoint[], v: View, p: Period): echarts.EChartsOption {
    const isDark = themeStore.isDark;
    const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor   = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg   = isDark ? '#1e293b' : '#ffffff';
    const tooltipBord = isDark ? '#334155' : '#e2e8f0';
    const xLabel      = periodAxisLabel(data, p);

    if (v === 'total') {
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.date as string),
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: textColor, fontSize: 10, interval: xLabel.interval, formatter: xLabel.formatter },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v: number) => {
              if (themeStore.privacyMode) return '●●';
              return Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`;
            },
          },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBord,
          borderWidth: 1,
          textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            if (!Array.isArray(params) || !params[0]) return '';
            const date = new Date(params[0].axisValue as string).toLocaleDateString('nl-BE', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            const lines = (params as Array<{ seriesName: string; marker: string; value: number }>)
              .filter((p) => p.seriesName !== '__cost')
              .map((p) => `<div>${p.marker}${p.seriesName}: ${themeStore.privacyMode ? '●●●' : fmt(p.value)}</div>`);
            return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines.join('')}`;
          },
        },
        series: [
          {
            name: 'Portefeuille',
            type: 'line',
            data: data.map((d) => d.value as number),
            smooth: false,
            symbol: 'none',
            lineStyle: { color: '#818cf8', width: 2 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.2)' }, { offset: 1, color: 'rgba(99,102,241,0.01)' }] } },
          },
          {
            name: '__cost',
            type: 'line',
            data: data.map((d) => d.invested as number),
            smooth: false,
            symbol: 'none',
            lineStyle: { color: isDark ? '#334155' : '#94a3b8', width: 1, type: 'dashed' },
            areaStyle: { color: isDark ? 'rgba(51,65,85,0.15)' : 'rgba(148,163,184,0.1)' },
          },
        ],
      };
    }

    if (v === 'individual') {
      const tickers = [...visibleTickers].reverse();
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.date as string),
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: textColor, fontSize: 10, interval: xLabel.interval, formatter: xLabel.formatter },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor, fontSize: 10,
            formatter: (v: number) => themeStore.privacyMode ? '●●' : (Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`),
          },
        },
        tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' } },
        series: tickers.map((t) => ({
          name: t,
          type: 'line' as const,
          stack: 'total',
          data: data.map((d) => (d[t] as number | undefined) ?? 0),
          smooth: false,
          symbol: 'none',
          lineStyle: { color: getColor(t), width: 1.5 },
          areaStyle: { color: getColor(t) + '28' },
        })),
      };
    }

    if (v === 'pct') {
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.date as string),
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: textColor, fontSize: 10, interval: xLabel.interval, formatter: xLabel.formatter },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => `${+v.toFixed(1)}%` },
        },
        tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' } },
        series: visibleTickers.map((t) => ({
          name: t,
          type: 'line' as const,
          data: data.map((d) => {
            const raw = d[`${t}_pct`];
            return raw != null ? +(raw as number) : null;
          }),
          smooth: false,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { color: getColor(t), width: 2 },
        })),
      };
    }

    // pl view
    const tickers2 = [...visibleTickers].reverse();
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.date as string),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: textColor, fontSize: 10, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: (v: number) => themeStore.privacyMode ? '●●' : (Math.abs(v) >= 1000 ? `€${+(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`),
        },
      },
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' } },
      series: tickers2.map((t) => ({
        name: t,
        type: 'line' as const,
        stack: 'total',
        data: data.map((d) => {
          const val  = d[t] as number | undefined;
          const cost = d[`${t}_cost`] as number | undefined;
          return val != null && cost != null ? val - cost : null;
        }),
        smooth: false,
        symbol: 'none',
        connectNulls: true,
        lineStyle: { color: getColor(t), width: 1.5 },
        areaStyle: { color: getColor(t) + '28' },
      })),
    };
  }

  function build1DOption(v: View): echarts.EChartsOption | null {
    const tickers = portfolioStore.currentTickers;
    if (!tickers.length || !intradayStore.loaded) return null;

    const fxRateRaw = intradayStore.liveEurUsd;
    if (fxRateRaw === null && tickers.some((t) => !EU_EXCHANGE_RE.test((portfolioStore.tickerMeta[t]?.['yahoo'] as string) ?? t))) return null;
    const fxRate = fxRateRaw ?? 1; // null only if all tickers are EU; fxFor() will use 1 anyway
    const isDark  = themeStore.isDark;
    const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor   = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg   = isDark ? '#1e293b' : '#ffffff';
    const tooltipBord = isDark ? '#334155' : '#e2e8f0';

    const allTsSet = new Set<number>();
    const priceMap:     Record<string, Map<number, number>> = {};
    const prevCloseMap: Record<string, number> = {};
    // Track which regions (EU/US) are present and the session date we're plotting.
    // Yahoo's tradingPeriods can point to the NEXT session (e.g. Monday when viewing Friday on
    // the weekend), so we derive open/close from the data's actual date instead.
    const regionsPresent = new Set<'EU' | 'US'>();
    let sessionDate: string | null = null;

    for (const ticker of tickers) {
      const yahoo = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      const intra = intradayStore.data[yahoo];
      if (!intra) continue;
      prevCloseMap[ticker] = intra.previousClose ?? 0;
      const pts = intra.points ?? [];
      priceMap[ticker] = new Map(pts.map((p) => [p.ts, p.close]));
      for (const pt of pts) allTsSet.add(pt.ts);
      regionsPresent.add(EU_EXCHANGE_RE.test(yahoo) ? 'EU' : 'US');
      if (!sessionDate && intra.date) sessionDate = intra.date;
    }

    // Build sessions before sortedTs so we can extend the timestamp grid to cover
    // the full expected trading day (the x-axis should always span the whole session).
    // Uses Intl to resolve the tz offset for the exact date (handles DST correctly).
    const unixAtLocal = (dateStr: string, h: number, m: number, tz: string): number => {
      const [y, mo, d] = dateStr.split('-').map(Number);
      const naiveUtc = Date.UTC(y!, mo! - 1, d!, h, m);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(new Date(naiveUtc));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
      return Math.floor((naiveUtc - (tzAsUtc - naiveUtc)) / 1000);
    };

    const sessions: { region: string; open: number; close: number }[] = [];
    if (sessionDate) {
      if (regionsPresent.has('EU')) sessions.push({
        region: 'EU',
        open:  unixAtLocal(sessionDate, 9, 0,  'Europe/Berlin'),
        close: unixAtLocal(sessionDate, 17, 30, 'Europe/Berlin'),
      });
      if (regionsPresent.has('US')) sessions.push({
        region: 'US',
        open:  unixAtLocal(sessionDate, 9, 30, 'America/New_York'),
        close: unixAtLocal(sessionDate, 16, 0, 'America/New_York'),
      });
      // Pad allTsSet with a 5-min grid for the full session so the x-axis always shows
      // the complete day even when we're only partway through it.
      if (sessions.length > 0) {
        const fullStart = Math.min(...sessions.map((s) => s.open));
        const fullEnd   = Math.max(...sessions.map((s) => s.close));
        for (let ts = fullStart; ts <= fullEnd; ts += 300) allTsSet.add(ts);
      }
    }

    if (allTsSet.size === 0) return null;
    const nowSec   = Date.now() / 1000;
    const sortedTs = [...allTsSet].sort((a, b) => a - b);
    const labels   = sortedTs.map((ts) =>
      new Date(ts * 1000).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
    );

    const fxFor     = (t: string) => EU_EXCHANGE_RE.test((portfolioStore.tickerMeta[t]?.['yahoo'] as string) ?? t) ? 1 : fxRate;
    const sharesFor = (t: string) => portfolioStore.positions.find((p) => p.ticker === t)?.shares ?? 0;

    // Per-ticker carry-forward price series across sortedTs
    const priceOverTime: Record<string, number[]> = {};
    for (const ticker of tickers) {
      const pm = priceMap[ticker];
      const arr: number[] = [];
      let last = prevCloseMap[ticker] ?? 0;
      for (const ts of sortedTs) {
        const p = pm?.get(ts);
        if (p != null) last = p;
        arr.push(last);
      }
      priceOverTime[ticker] = arr;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionMarks: any[] = [];
    for (const { region, open, close } of sessions) {
      const openIdx = sortedTs.findIndex((ts) => ts >= open);
      if (openIdx >= 0) sessionMarks.push({
        name: `${region} Open`, xAxis: openIdx,
        lineStyle: { color: '#4ade80', type: 'dashed', width: 1, opacity: 0.6 },
        label: { formatter: `${region} open`, fontSize: 9, color: '#4ade80', position: 'insideStartTop' },
      });
      const closeIdx = sortedTs.findIndex((ts) => ts >= close);
      if (closeIdx >= 0) sessionMarks.push({
        name: `${region} Sluit`, xAxis: closeIdx,
        lineStyle: { color: '#f87171', type: 'dashed', width: 1, opacity: 0.6 },
        label: { formatter: `${region} sluit`, fontSize: 9, color: '#f87171', position: 'insideEndBottom' },
      });
    }

    // Show one label per whole hour (09:00, 10:00, …) regardless of intraday tick density.
    const hourInterval = ((index: number) => {
      const ts = sortedTs[index];
      return ts !== undefined && new Date(ts * 1000).getMinutes() === 0;
    }) as unknown as number;

    const commonAxes = {
      xAxis: {
        type: 'category' as const, data: labels,
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: textColor, fontSize: 10, interval: hourInterval },
      },
      grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false },
    };

    // ── Total view ─────────────────────────────────────────────
    if (v === 'total') {
      // Null for future timestamps so the line ends at "now" and the x-axis shows the full day.
      const seriesValues: (number | null)[] = [];
      for (let i = 0; i < sortedTs.length; i++) {
        if (sortedTs[i]! > nowSec) { seriesValues.push(null); continue; }
        let total = 0;
        for (const ticker of tickers) {
          total += (sharesFor(ticker) * (priceOverTime[ticker]?.[i] ?? 0)) / fxFor(ticker);
        }
        seriesValues.push(Math.round(total * 100) / 100);
      }

      let prevCloseTotal = 0;
      for (const ticker of tickers) {
        prevCloseTotal += (sharesFor(ticker) * (prevCloseMap[ticker] ?? 0)) / fxFor(ticker);
      }
      prevCloseTotal = Math.round(prevCloseTotal * 100) / 100;

      const lastVal = seriesValues.findLast((v) => v !== null) ?? 0;
      const isUp    = lastVal >= prevCloseTotal;
      const lineClr = isUp ? '#4ade80' : '#f87171';
      const areaClr = isUp ? 'rgba(74,222,128,' : 'rgba(248,113,113,';

      const markLineData = [
        {
          name: 'Vorige slotkoers',
          yAxis: prevCloseTotal,
          lineStyle: { color: isDark ? '#475569' : '#94a3b8', type: 'dashed', width: 1 },
          label: {
            formatter: () => themeStore.privacyMode ? '●●' : (prevCloseTotal >= 1000 ? `€${(prevCloseTotal / 1000).toFixed(1)}k` : `€${Math.round(prevCloseTotal)}`),
            position: 'insideEndTop', fontSize: 10, color: textColor,
          },
        },
        ...sessionMarks,
      ];

      const actualValues = seriesValues.filter((v): v is number => v !== null);
      const maxDev = Math.max(...actualValues.map((v) => Math.abs(v - prevCloseTotal)), prevCloseTotal * 0.005);
      const yPad1D = maxDev * 1.1;

      return {
        backgroundColor: 'transparent',
        ...commonAxes,
        yAxis: {
          type: 'value', scale: true,
          min: prevCloseTotal > 0 ? prevCloseTotal - yPad1D : undefined,
          max: prevCloseTotal > 0 ? prevCloseTotal + yPad1D : undefined,
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor, fontSize: 10,
            formatter: (n: number) => themeStore.privacyMode ? '●●' : (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`),
          },
        },
        tooltip: {
          trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1,
          textStyle: { color: isDark ? '#e2e8f0' : '#1c1c1c', fontSize: 11 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            if (!Array.isArray(params) || !params[0]) return '';
            const val  = params[0].value as number;
            const diff = val - prevCloseTotal;
            const pct  = prevCloseTotal > 0 ? (diff / prevCloseTotal) * 100 : 0;
            const sign = diff >= 0 ? '+' : '';
            const clr  = diff >= 0 ? '#4ade80' : '#f87171';
            const valStr  = themeStore.privacyMode ? '●●●' : fmt(val);
            const diffStr = themeStore.privacyMode ? '●●' : fmt(diff);
            return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>` +
              `<div>${valStr}</div>` +
              `<div style="color:${clr}">${sign}${diffStr} (${sign}${pct.toFixed(2)}%)</div>`;
          },
        },
        series: [{
          name: 'Portefeuille',
          type: 'line',
          data: seriesValues,
          smooth: false,
          symbol: 'none',
          lineStyle: { color: lineClr, width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: areaClr + '0.2)' }, { offset: 1, color: areaClr + '0.02)' }] } },
          markLine: { silent: true, symbol: 'none', data: markLineData },
        }],
      };
    }

    // ── Per-position views (individual / pct / pl) ─────────────
    const stacked = v === 'individual' || v === 'pl';
    const tickersOrdered = stacked ? [...tickers].reverse() : tickers;

    const series = tickersOrdered.map((t, idx) => {
      const prev   = prevCloseMap[t] ?? 0;
      const shr    = sharesFor(t);
      const fx     = fxFor(t);
      const prices = priceOverTime[t] ?? [];
      const data: (number | null)[] = prices.map((p, i) => {
        if (sortedTs[i]! > nowSec) return null;
        if (v === 'individual') return Math.round(((shr * p) / fx) * 100) / 100;
        if (v === 'pct')        return prev > 0 ? +(((p - prev) / prev) * 100).toFixed(3) : 0;
        /* v === 'pl' */        return Math.round((((p - prev) * shr) / fx) * 100) / 100;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = {
        name: t,
        type: 'line',
        data,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: getColor(t), width: v === 'pct' ? 2 : 1.5 },
      };
      if (stacked) {
        s.stack = 'total';
        s.areaStyle = { color: getColor(t) + '28' };
      }
      if (idx === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markData: any[] = [...sessionMarks];
        if (v === 'pct' || v === 'pl') {
          markData.push({
            name: 'Nul', yAxis: 0,
            lineStyle: { color: isDark ? '#475569' : '#94a3b8', type: 'dashed', width: 1 },
            label: { show: false },
          });
        }
        s.markLine = { silent: true, symbol: 'none', data: markData };
      }
      return s;
    });

    return {
      backgroundColor: 'transparent',
      ...commonAxes,
      yAxis: {
        type: 'value', scale: true,
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: textColor, fontSize: 10,
          formatter: v === 'pct'
            ? (n: number) => `${+n.toFixed(1)}%`
            : (n: number) => themeStore.privacyMode ? '●●' : (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`),
        },
      },
      tooltip: {
        trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1,
        textStyle: { fontSize: 11, color: isDark ? '#e2e8f0' : '#1c1c1c' },
      },
      series,
    };
  }

  const chartOption    = $derived(period === '1d' ? build1DOption(view) : buildOption(filtered, view, period));
  const periodPlValue  = $derived(period === '1d' ? day1Pl() : periodPl());
  const periodLabel    = $derived(PERIODS.find((p) => p.key === period)?.label ?? '');
</script>

<div class="page-root">

  <!-- ── Day summary strip (mobile only, hidden ≥900px) ── -->
  <div class="day-strip">
    {#if intradayStore.loaded}
      <span class="day-lbl">Vandaag</span>
      <span class="day-pl {totalDayPl >= 0 ? 'c-pos' : 'c-neg'}">
        <PrivacyValue value={`${totalDayPl >= 0 ? '+' : ''}${fmt(totalDayPl)}`} />
      </span>
      <span class="day-pct {totalDayPl >= 0 ? 'c-pos' : 'c-neg'}">{fmtPct(totalDayPlPct)}</span>
      {#if intradayStore.liveEurUsd}
        <span class="fx-rate">EUR/USD {intradayStore.liveEurUsd.toFixed(4)}</span>
      {/if}
    {:else}
      <span class="day-lbl c-muted">Laden…</span>
    {/if}
  </div>

  <!-- ── Ticker scroll strip (mobile only, hidden ≥900px) ── -->
  <div class="ticker-scroll-wrap">
    {#if intradayStore.loaded}
      {#each cards() as card (card.ticker)}
        <a class="spark-card card" href="/stock/{card.ticker}">
          <div class="spark-header">
            <div class="spark-ticker">{card.ticker}</div>
            <span class="badge {stateClass(card.marketState)}">{stateLabel(card.marketState)}</span>
          </div>
          <div class="spark-price">
            {#if card.price != null}
              <span class="price-val">{card.price.toFixed(2)}</span>
              {#if card.changePct != null}
                <span class="price-chg {card.changePct >= 0 ? 'c-pos' : 'c-neg'}">
                  {card.changePct >= 0 ? '+' : ''}{card.changePct.toFixed(2)}%
                </span>
              {/if}
            {:else}
              <span class="c-muted">—</span>
            {/if}
          </div>
          <!-- svelte-ignore html-self-closing-tags -->
          {@html card.sparkHtml}
        </a>
      {/each}
    {:else}
      {#each Array(4) as _, i (i)}
        <div class="spark-card card skeleton"></div>
      {/each}
    {/if}
  </div>

  <!-- ── Dashboard grid: chart (left) + ticker sidebar (right, desktop only) ── -->
  <div class="dashboard-grid">

    <!-- Chart panel -->
    <div class="chart-panel">
      <div class="chart-card">
        <div class="chart-headline">
          <div class="headline-pl {(periodPlValue?.pl ?? 0) >= 0 ? 'c-pos' : 'c-neg'}" style:visibility={periodPlValue ? 'visible' : 'hidden'}>
            {#if periodPlValue}
              <PrivacyValue value={`${periodPlValue.pl >= 0 ? '+' : ''}${fmt(periodPlValue.pl)}`} />
              <span class="headline-pct">{fmtPct(periodPlValue.pct)}</span>
            {:else}
              &nbsp;
            {/if}
          </div>
          <div class="headline-caption">{periodLabel}</div>
        </div>

        <div class="chart-header">
          <div class="seg desktop-only">
            <button
              class="seg-btn"
              class:on={view === 'total'}
              onclick={() => (view = 'total')}
            >Totaal</button>
            <button
              class="seg-btn"
              class:on={view !== 'total'}
              onclick={() => (view = 'pct')}
            >Per positie</button>
          </div>

          {#if view !== 'total'}
            <div class="seg seg-sub desktop-only">
              {#each UNITS as u}
                <button class="seg-btn" class:on={view === u.key} onclick={() => (view = u.key)}>
                  {u.label}
                </button>
              {/each}
            </div>
          {/if}

          <div class="period-pills desktop-only">
            {#each PERIODS as p}
              <button class="pill" class:on={period === p.key} onclick={() => (period = p.key)}>
                {p.label}
              </button>
            {/each}
          </div>

          <div class="chart-controls-mobile">
            <select class="mobile-select" bind:value={view}>
              {#each VIEWS as v}
                <option value={v.key}>{v.label}</option>
              {/each}
            </select>
            <select class="mobile-select" bind:value={period}>
              {#each PERIODS as p}
                <option value={p.key}>{p.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="chart-wrap">
          {#if chartOption}
            <Chart option={chartOption} height="380px" />
          {:else if period === '1d'}
            <div class="chart-empty" style="height:380px">Intraday data laden…</div>
          {:else if filtered.length <= 1}
            <div class="chart-empty" style="height:380px">Niet genoeg data voor deze periode</div>
          {/if}
        </div>

        {#if view !== 'total'}
          <div class="legend">
            {#each visibleTickers as t}
              <a class="legend-item" href="/stock/{t}">
                <span class="legend-dot" style="background:{getColor(t)}"></span>
                {t}
              </a>
            {/each}
          </div>
        {:else}
          <div class="legend">
            <div class="legend-item">
              <span class="legend-line" style="background:#818cf8"></span>
              Portefeuille
            </div>
            {#if period !== '1d'}
              <div class="legend-item">
                <span class="legend-line dashed" style="background:var(--fg-muted)"></span>
                Kostprijs
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Ticker sidebar (desktop only, hidden on mobile) -->
    <div class="tickers-sidebar">
      <div class="sidebar-cards">
        {#if intradayStore.loaded}
          {#each cards() as card (card.ticker)}
            <a class="spark-card card" href="/stock/{card.ticker}">
              <div class="spark-header">
                <div class="spark-ticker">{card.ticker}</div>
                <span class="badge {stateClass(card.marketState)}">{stateLabel(card.marketState)}</span>
              </div>
              <div class="spark-price">
                {#if card.price != null}
                  <span class="price-val">{card.price.toFixed(2)}</span>
                  {#if card.changePct != null}
                    <span class="price-chg {card.changePct >= 0 ? 'c-pos' : 'c-neg'}">
                      {card.changePct >= 0 ? '+' : ''}{card.changePct.toFixed(2)}%
                    </span>
                  {/if}
                {:else}
                  <span class="c-muted">—</span>
                {/if}
              </div>
              <!-- svelte-ignore html-self-closing-tags -->
              {@html card.sparkHtml}
            </a>
          {/each}
        {:else}
          {#each Array(4) as _, i (i)}
            <div class="spark-card card skeleton"></div>
          {/each}
        {/if}
      </div>
    </div>

  </div>

  <!-- ── Positions table (full width below grid) ── -->
  {#if portfolioStore.positions.length > 0}
    <div class="pos-table-card card">
      <table class="pos-table">
        <thead>
          <tr>
            <th onclick={() => portfolioStore.sortPositions('ticker')} class="sortable">
              Ticker {portfolioStore.posSort.col === 'ticker' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('value')} class="sortable right mobile-hide">
              Waarde {portfolioStore.posSort.col === 'value' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('pl')} class="sortable right desktop-only">
              P&amp;L {portfolioStore.posSort.col === 'pl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('plPct')} class="sortable right">
              % {portfolioStore.posSort.col === 'plPct' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('dayPl')} class="sortable right desktop-only">
              Vandaag {portfolioStore.posSort.col === 'dayPl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onclick={() => portfolioStore.sortPositions('cost')} class="sortable right desktop-only">
              Ingelegd {portfolioStore.posSort.col === 'cost' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each portfolioStore.sortedPositions as pos}
            <tr onclick={() => (window.location.href = `/stock/${pos.ticker}`)} style="cursor:pointer">
              <td>
                <span class="ticker-dot" style="background:{getColor(pos.ticker)}"></span>
                <span class="ticker-name">{pos.ticker}</span>
                {#if pos.label && pos.label !== pos.ticker}
                  <span class="ticker-label desktop-only">{pos.label}</span>
                {/if}
              </td>
              <td class="right mono mobile-hide">
                <PrivacyValue value={fmt(pos.value)} />
              </td>
              <td class="right mono desktop-only {pos.pl >= 0 ? 'c-pos' : 'c-neg'}">
                <PrivacyValue value={`${pos.pl >= 0 ? '+' : ''}${fmt(pos.pl)}`} />
              </td>
              <td class="right mono {pos.plPct >= 0 ? 'c-pos' : 'c-neg'}">
                {fmtPct(pos.plPct)}
              </td>
              <td class="right mono desktop-only {(dayPlMap()[pos.ticker] ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
                {#if dayPlMap()[pos.ticker] != null}
                  <PrivacyValue value={`${(dayPlMap()[pos.ticker] ?? 0) >= 0 ? '+' : ''}${fmt(dayPlMap()[pos.ticker] ?? 0)}`} />
                {:else}
                  <span class="c-muted">—</span>
                {/if}
              </td>
              <td class="right mono desktop-only">
                <PrivacyValue value={fmt(pos.costEur)} />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="footer">
    Actief: {portfolioStore.currentTickers.join(', ')} · Geen financieel advies · Zelf gehosted
  </div>
</div>

<style>
  /* ── Chart card internals ──────────────────────────── */
  .chart-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .chart-wrap { position: relative; }
  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--fg-muted);
    font-size: 13px;
  }

  .chart-headline {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
    min-height: 40px;
  }
  .headline-pl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
  }
  .headline-pct {
    font-size: 14px;
    font-weight: 600;
    opacity: 0.8;
    margin-left: 8px;
  }
  .headline-caption {
    margin-left: auto;
    font-size: 12px;
    color: var(--fg-muted);
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .seg-sub { background: transparent; padding: 0; }

  @media (max-width: 640px) {
    .chart-headline { padding: 10px 12px 8px; min-height: 34px; }
    .headline-pl { font-size: 17px; }
    .headline-pct { font-size: 12px; }
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fg-muted);
    text-decoration: none;
    cursor: pointer;
  }
  .legend-item:hover { color: var(--fg); }
  .legend-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-line {
    width: 16px; height: 2px;
    border-radius: 1px;
    flex-shrink: 0;
  }
  .legend-line.dashed {
    background: none !important;
    border-top: 2px dashed var(--fg-muted);
    height: 0;
    margin-top: 1px;
  }

  /* ── Positions table ───────────────────────────────── */
  .pos-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .pos-table th {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    vertical-align: bottom;
  }
  .pos-table th.sortable { cursor: pointer; user-select: none; }
  .pos-table th.sortable:hover { color: var(--fg); }
  .pos-table th.right, .pos-table td.right { text-align: right; }
  .pos-table tbody tr:hover { background: var(--hover-bg, rgba(0,0,0,0.03)); }
  .pos-table td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    vertical-align: middle;
  }
  .pos-table tbody tr:last-child td { border-bottom: none; }
  .ticker-dot {
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
  }
  .ticker-label {
    color: var(--fg-muted);
    font-size: 11px;
    margin-left: 4px;
  }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }

  /* ── Positions table card ─────────────────────────── */
  .pos-table-card {
    margin-top: 16px;
    overflow-x: auto;
    /* constrain to parent so it never causes page-level scroll */
    max-width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 640px) {
    .pos-table td {
      white-space: normal;
      padding: 8px 8px;
    }
    .pos-table th {
      padding: 8px 8px;
    }
    /* keep ticker symbol on one line but allow cell to wrap otherwise */
    .ticker-name { white-space: nowrap; }
  }

  /* ── Footer ────────────────────────────────────────── */
  .footer {
    margin-top: 24px;
    padding: 12px 0;
    text-align: center;
    font-size: 11px;
    color: var(--fg-muted);
  }

  /* ── Day summary strip (mobile) ────────────────────── */
  .day-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: var(--surface-1, var(--card-bg));
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 13px;
    flex-wrap: wrap;
  }
  .day-lbl { color: var(--fg-muted); font-size: 12px; }
  .day-pl  { font-family: 'JetBrains Mono', monospace; font-weight: 700; }
  .day-pct { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .fx-rate { margin-left: auto; font-size: 11px; color: var(--fg-muted); font-family: 'JetBrains Mono', monospace; }

  /* ── Ticker scroll strip (mobile) ─────────────────── */
  .ticker-scroll-wrap {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
    margin-bottom: 14px;
    scrollbar-width: none;
  }
  .ticker-scroll-wrap::-webkit-scrollbar { display: none; }
  .ticker-scroll-wrap .spark-card {
    flex: 0 0 150px;
    scroll-snap-align: start;
    min-width: 0;
  }

  /* ── Spark card shared styles ──────────────────────── */
  .spark-card {
    padding: 12px 14px;
    text-decoration: none;
    color: inherit;
    display: block;
    transition: border-color 0.1s;
  }
  .spark-card:hover { border-color: var(--fg-muted); }

  .spark-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .spark-ticker { font-size: 13px; font-weight: 700; }
  .spark-label  {
    font-size: 11px;
    color: var(--fg-muted);
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spark-price {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 6px;
  }
  .price-val  { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 600; }
  .price-chg  { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .spark-eur  { font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-top: 2px; }

  /* skeleton pulse */
  .spark-card.skeleton {
    height: 108px;
    pointer-events: none;
    animation: sk-pulse 1.5s ease-in-out infinite;
  }
  @keyframes sk-pulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.8; }
  }

  /* ── Badges ────────────────────────────────────────── */
  .badge {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge-open   { background: rgba(74,222,128,0.15);  color: #4ade80; }
  .badge-ext    { background: rgba(251,191,36,0.15);   color: #fbbf24; }
  .badge-closed { background: rgba(100,116,139,0.15);  color: #64748b; }

  /* ── Dashboard grid (mobile-first: stacked) ────────── */
  .dashboard-grid {
    display: block;
  }
  .tickers-sidebar { display: none; }
  .chart-panel { min-width: 0; }

  /* ── Desktop enhancement ≥900px ────────────────────── */
  @media (min-width: 900px) {
    /* hide mobile-only elements */
    .ticker-scroll-wrap { display: none; }
    .day-strip          { display: none; }

    /* two-column grid */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 16px;
      align-items: start;
      margin-bottom: 16px;
    }

    /* desktop sidebar */
    .tickers-sidebar {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sidebar-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  }

  /* ── Mobile breakpoint (existing, preserved) ──────── */
  @media (max-width: 640px) {
    .desktop-only { display: none !important; }
    .mobile-hide  { display: none !important; }
    .chart-controls-mobile { display: flex !important; }
  }
  .chart-controls-mobile { display: none; }
</style>
