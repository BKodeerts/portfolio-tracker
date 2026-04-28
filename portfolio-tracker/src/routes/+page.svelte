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
  type PosView = 'table' | 'cards';

  let period  = $state<Period>('1d');
  let view    = $state<View>('total');
  let posView = $state<PosView>('table');

  // ── Portfolio summary values ────────────────────────────────────────────────
  const liveData = $derived((): { value: number; dayPl: number } | null => {
    if (!intradayStore.loaded || portfolioStore.positions.length === 0) return null;
    const fxRate = intradayStore.liveEurUsd;
    let liveValue = 0;
    let prevValue = 0;
    for (const pos of portfolioStore.positions) {
      const yahoo  = pos.yahoo ?? pos.ticker;
      const intra  = intradayStore.data[yahoo];
      const isEu   = EU_EXCHANGE_RE.test(yahoo);
      const fx     = isEu ? 1 : fxRate;
      if (!intra?.previousClose || (!isEu && fx == null)) {
        liveValue += pos.value;
        prevValue += pos.value;
        continue;
      }
      const pts          = intra.points ?? [];
      const currentPrice = pts.at(-1)?.close ?? intra.previousClose;
      liveValue += (pos.shares * currentPrice) / fx!;
      prevValue += (pos.shares * intra.previousClose) / fx!;
    }
    return { value: liveValue, dayPl: liveValue - prevValue };
  });

  const totalValue    = $derived(liveData()?.value ?? portfolioStore.positions.reduce((s, p) => s + p.value, 0));
  const totalPl       = $derived(totalValue - portfolioStore.totalInvested);
  const totalPlPct    = $derived(portfolioStore.totalInvested > 0 ? (totalPl / portfolioStore.totalInvested) * 100 : 0);
  const totalDayPl    = $derived(liveData()?.dayPl ?? portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0));
  const totalDayPlPct = $derived(totalValue - totalDayPl > 0 ? (totalDayPl / (totalValue - totalDayPl)) * 100 : 0);

  // ── Intraday cards ─────────────────────────────────────────────────────────
  interface SparkCard {
    ticker: string; yahoo: string; label: string; shares: number;
    prevClose: number | null; price: number | null;
    changePct: number | null; changeEur: number | null;
    marketState: string; sparkHtml: string;
  }

  const cards = $derived((): SparkCard[] => {
    return portfolioStore.currentTickers.map((ticker) => {
      const meta   = portfolioStore.tickerMeta[ticker];
      const yahoo  = (meta?.['yahoo'] as string | undefined) ?? ticker;
      const label  = (meta?.['label'] as string | undefined) ?? ticker;
      const pos    = portfolioStore.positions.find((p) => p.ticker === ticker);
      const shares = pos?.shares ?? 0;
      const intra  = intradayStore.data[yahoo];
      const prevClose   = intra?.previousClose ?? null;
      const pts         = intra?.points ?? [];
      const lastPt      = pts[pts.length - 1];
      const price       = lastPt?.close ?? null;
      const tradingMins = getTradingMins(yahoo);
      const changePct   = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
      const isEu  = EU_EXCHANGE_RE.test(yahoo);
      const fx    = isEu ? 1 : intradayStore.liveEurUsd;
      const changeEur = price != null && prevClose && shares && fx != null ? ((price - prevClose) * shares) / fx : null;
      const rawState    = intra?.marketState ?? '';
      const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? 'REGULAR' : 'CLOSED'));
      const muted       = marketState !== 'REGULAR';
      const sparkHtml   = pts.length >= 2 && prevClose ? sparklineSVG(pts, prevClose, tradingMins, muted) : '';
      return { ticker, yahoo, label, shares, prevClose, price, changePct, changeEur, marketState, sparkHtml };
    });
  });

  // ── Movers (sorted by day %) ────────────────────────────────────────────────
  const movers = $derived(() => {
    const cs = cards().filter((c) => c.changePct != null);
    const sorted = [...cs].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    return { top: sorted[0] ?? null, bot: sorted[sorted.length - 1] ?? null };
  });

  // ── Day P&L per ticker for table ────────────────────────────────────────────
  const dayPlMap = $derived(() => {
    const m: Record<string, number | null> = {};
    for (const c of cards()) m[c.ticker] = c.changeEur;
    return m;
  });

  // ── Intraday change % per ticker — only "fresh" when session date is today ──
  const intradayChangePctMap = $derived(() => {
    const today = new Date().toISOString().slice(0, 10); // UTC, matches intra.date
    const m: Record<string, { pct: number | null; fresh: boolean }> = {};
    for (const c of cards()) {
      const intra = intradayStore.data[c.yahoo];
      const fresh = intra?.date != null && intra.date >= today;
      m[c.ticker] = { pct: c.changePct, fresh };
    }
    return m;
  });

  // True when at least one portfolio ticker has intraday data from today (UTC)
  const isIntradayFresh = $derived(() => {
    if (!intradayStore.loaded) return false;
    const today = new Date().toISOString().slice(0, 10);
    return portfolioStore.currentTickers.some((ticker) => {
      const yahoo = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      return (intradayStore.data[yahoo]?.date ?? '') >= today;
    });
  });

  // Dutch label for the intraday session date: "Vandaag", "Gisteren", or weekday name
  const intradayDateLabel = $derived(() => {
    if (!intradayStore.loaded) return 'Vandaag';
    const today = new Date().toISOString().slice(0, 10);
    let latestDate = '';
    for (const ticker of portfolioStore.currentTickers) {
      const yahoo = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      const d = intradayStore.data[yahoo]?.date ?? '';
      if (d > latestDate) latestDate = d;
    }
    if (!latestDate || latestDate >= today) return 'Vandaag';
    const prevDay = new Date(today);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    if (latestDate === prevDay.toISOString().slice(0, 10)) return 'Gisteren';
    return new Date(latestDate + 'T12:00:00Z').toLocaleDateString('nl-BE', { weekday: 'long' });
  });

  // ── Per-position 3-month sparkline from weekly chart data ──────────────────
  function posSparkValues(ticker: string, n = 12): number[] {
    return portfolioStore.chartData
      .slice(-n)
      .map((pt) => (pt[ticker] as number | undefined) ?? 0)
      .filter((v) => v > 0);
  }

  function miniSparkSvg(ticker: string): string {
    const values = posSparkValues(ticker);
    if (values.length < 2) return '';
    const w = 72; const h = 22;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step  = w / (values.length - 1);
    const pts   = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 3) - 1] as [number, number]);
    const d     = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const up    = values[values.length - 1]! >= values[0]!;
    const color = up ? 'var(--c-pos)' : 'var(--c-neg)';
    const fill  = up ? 'var(--c-pos-bg)' : 'var(--c-neg-bg)';
    const fillD = `${d} L${w} ${h} L0 ${h} Z`;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><path d="${fillD}" fill="${fill}" /><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
  }

  // ── Chart data ──────────────────────────────────────────────────────────────
  const visibleTickers = $derived(portfolioStore.currentTickers);

  const filtered = $derived(
    period === '1d' ? portfolioStore.chartData : filterByPeriod(portfolioStore.chartData, period),
  );

  const periodPl = $derived(() => {
    if (filtered.length < 2) return null;
    const first = filtered[0]!;
    const last  = filtered[filtered.length - 1]!;
    const fv = (first.value as number) ?? 0;
    const lv = (last.value  as number) ?? 0;
    const fi = (first.invested as number) ?? 0;
    const li = (last.invested  as number) ?? 0;
    const pl   = (lv - li) - (fv - fi);
    const base = li > 0 ? li : fi;
    return { pl, pct: base > 0 ? (pl / base) * 100 : 0 };
  });

  const day1Pl = $derived(() => {
    const tickers = portfolioStore.currentTickers;
    if (!tickers.length || !intradayStore.loaded) return null;
    const fxRate = intradayStore.liveEurUsd;
    if (fxRate === null && tickers.some((t) => !EU_EXCHANGE_RE.test((portfolioStore.tickerMeta[t]?.['yahoo'] as string) ?? t))) return null;
    let prevCloseTotal = 0;
    let currentTotal   = 0;
    for (const ticker of tickers) {
      const yahoo  = (portfolioStore.tickerMeta[ticker]?.['yahoo'] as string) ?? ticker;
      const intra  = intradayStore.data[yahoo];
      if (!intra) continue;
      const isEu    = EU_EXCHANGE_RE.test(yahoo);
      const fx      = isEu ? 1 : fxRate!;
      const shares  = portfolioStore.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
      const prevClose = intra.previousClose ?? 0;
      const pts     = intra.points ?? [];
      const lastPrice = pts[pts.length - 1]?.close ?? prevClose;
      prevCloseTotal += (shares * prevClose)  / fx;
      currentTotal   += (shares * lastPrice)  / fx;
    }
    if (prevCloseTotal <= 0) return null;
    const diff = currentTotal - prevCloseTotal;
    return { pl: diff, pct: (diff / prevCloseTotal) * 100 };
  });

  // ── ECharts ─────────────────────────────────────────────────────────────────
  import type * as echarts from 'echarts';

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
      const k = keyOf(new Date(data[i]!.date as string));
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

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1d', label: '1D' }, { key: '1m', label: '1M' }, { key: '3m', label: '3M' },
    { key: '6m', label: '6M' }, { key: 'ytd', label: 'YTD' }, { key: '1y', label: '1Y' },
    { key: '2y', label: '2Y' }, { key: '3y', label: '3Y' }, { key: 'total', label: 'Max' },
  ];

  const VIEWS: { key: View; label: string }[] = [
    { key: 'total', label: 'Totaal' }, { key: 'individual', label: 'Per positie' },
    { key: 'pct',   label: 'Rendement %' }, { key: 'pl', label: 'Winst €' },
  ];

  const UNITS: { key: Exclude<View, 'total'>; label: string }[] = [
    { key: 'individual', label: 'Waarde €' }, { key: 'pct', label: 'Rendement %' }, { key: 'pl', label: 'Winst €' },
  ];

  function chartColors() {
    const isDark = themeStore.isDark;
    return {
      grid:        isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      text:        isDark ? '#8b929c' : '#6a6f78',
      tooltipBg:   isDark ? '#15181c' : '#ffffff',
      tooltipBord: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(16,18,22,0.12)',
    };
  }

  function buildOption(data: ChartPoint[], v: View, p: Period): echarts.EChartsOption {
    const { grid, text, tooltipBg, tooltipBord } = chartColors();
    const xLabel = periodAxisLabel(data, p);

    if (v === 'total') {
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false },
        xAxis: {
          type: 'category', data: data.map((d) => d.date as string),
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: text, fontSize: 10, interval: xLabel.interval, formatter: xLabel.formatter },
        },
        yAxis: {
          type: 'value', splitLine: { lineStyle: { color: grid } },
          axisLabel: {
            color: text, fontSize: 10,
            formatter: (n: number) => {
              if (themeStore.privacyMode) return '●●';
              return Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`;
            },
          },
        },
        tooltip: {
          trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1,
          textStyle: { color: themeStore.isDark ? '#f2f4f7' : '#101216', fontSize: 11 },
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
            name: 'Portefeuille', type: 'line', data: data.map((d) => d.value as number),
            smooth: false, symbol: 'none',
            lineStyle: { color: 'var(--accent)', width: 2 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'oklch(62% 0.14 255 / 0.18)' }, { offset: 1, color: 'oklch(62% 0.14 255 / 0.02)' }] } },
          },
          {
            name: '__cost', type: 'line', data: data.map((d) => d.invested as number),
            smooth: false, symbol: 'none',
            lineStyle: { color: themeStore.isDark ? '#3a3f46' : '#c8c8c8', width: 1, type: 'dashed' },
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
        xAxis: { type: 'category', data: data.map((d) => d.date as string), axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: text, fontSize: 10, interval: xLabel.interval, formatter: xLabel.formatter } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, fontSize: 10, formatter: (n: number) => themeStore.privacyMode ? '●●' : (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`) } },
        tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: themeStore.isDark ? '#f2f4f7' : '#101216' } },
        series: tickers.map((t) => ({ name: t, type: 'line' as const, stack: 'total', data: data.map((d) => (d[t] as number | undefined) ?? 0), smooth: false, symbol: 'none', lineStyle: { color: getColor(t), width: 1.5 }, areaStyle: { color: getColor(t) + '28' } })),
      };
    }

    if (v === 'pct') {
      return {
        backgroundColor: 'transparent',
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: { type: 'category', data: data.map((d) => d.date as string), axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: text, fontSize: 10, interval: xLabel.interval, formatter: xLabel.formatter } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, fontSize: 10, formatter: (n: number) => `${+n.toFixed(1)}%` } },
        tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: themeStore.isDark ? '#f2f4f7' : '#101216' } },
        series: visibleTickers.map((t) => ({
          name: t, type: 'line' as const, data: data.map((d) => { const raw = d[`${t}_pct`]; return raw != null ? +(raw as number) : null; }),
          smooth: false, symbol: 'none', connectNulls: true, lineStyle: { color: getColor(t), width: 2 },
        })),
      };
    }

    const tickers2 = [...visibleTickers].reverse();
    return {
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 60 },
      xAxis: { type: 'category', data: data.map((d) => d.date as string), axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: text, fontSize: 10, interval: 'auto' } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, fontSize: 10, formatter: (n: number) => themeStore.privacyMode ? '●●' : (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`) } },
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: themeStore.isDark ? '#f2f4f7' : '#101216' } },
      series: tickers2.map((t) => ({
        name: t, type: 'line' as const, stack: 'total',
        data: data.map((d) => { const val = d[t] as number | undefined; const cost = d[`${t}_cost`] as number | undefined; return val != null && cost != null ? val - cost : null; }),
        smooth: false, symbol: 'none', connectNulls: true, lineStyle: { color: getColor(t), width: 1.5 }, areaStyle: { color: getColor(t) + '28' },
      })),
    };
  }

  function build1DOption(v: View): echarts.EChartsOption | null {
    const tickers = portfolioStore.currentTickers;
    if (!tickers.length || !intradayStore.loaded) return null;
    const fxRateRaw = intradayStore.liveEurUsd;
    if (fxRateRaw === null && tickers.some((t) => !EU_EXCHANGE_RE.test((portfolioStore.tickerMeta[t]?.['yahoo'] as string) ?? t))) return null;
    const fxRate = fxRateRaw ?? 1;
    const { grid, text, tooltipBg, tooltipBord } = chartColors();

    const allTsSet = new Set<number>();
    const priceMap: Record<string, Map<number, number>> = {};
    const prevCloseMap: Record<string, number> = {};
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
      if (openIdx  >= 0) sessionMarks.push({ name: `${region} Open`,  xAxis: openIdx,  lineStyle: { color: 'var(--c-pos)', type: 'dashed', width: 1, opacity: 0.5 }, label: { formatter: `${region} open`,  fontSize: 9, color: 'var(--c-pos)',  position: 'insideStartTop' } });
      if (closeIdx >= 0) sessionMarks.push({ name: `${region} Sluit`, xAxis: closeIdx, lineStyle: { color: 'var(--c-neg)', type: 'dashed', width: 1, opacity: 0.5 }, label: { formatter: `${region} sluit`, fontSize: 9, color: 'var(--c-neg)', position: 'insideEndBottom' } });
    }

    const hourInterval = ((index: number) => { const ts = sortedTs[index]; return ts !== undefined && new Date(ts * 1000).getMinutes() === 0; }) as unknown as number;
    const commonAxes = { xAxis: { type: 'category' as const, data: labels, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: text, fontSize: 10, interval: hourInterval } }, grid: { top: 16, right: 16, bottom: 32, left: 60, containLabel: false } };

    const fxFor     = (t: string) => EU_EXCHANGE_RE.test((portfolioStore.tickerMeta[t]?.['yahoo'] as string) ?? t) ? 1 : fxRate;
    const sharesFor = (t: string) => portfolioStore.positions.find((p) => p.ticker === t)?.shares ?? 0;

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
        for (const ticker of tickers) total += (sharesFor(ticker) * (priceOverTime[ticker]?.[i] ?? 0)) / fxFor(ticker);
        seriesValues.push(Math.round(total * 100) / 100);
      }
      let prevCloseTotal = 0;
      for (const ticker of tickers) prevCloseTotal += (sharesFor(ticker) * (prevCloseMap[ticker] ?? 0)) / fxFor(ticker);
      prevCloseTotal = Math.round(prevCloseTotal * 100) / 100;
      const lastVal = seriesValues.findLast((v) => v !== null) ?? 0;
      const isUp    = lastVal >= prevCloseTotal;
      const lineClr = isUp ? 'var(--c-pos)' : 'var(--c-neg)';
      const areaClr = isUp ? 'rgba(52,211,153,' : 'rgba(248,113,113,';
      const markLineData = [
        { name: 'Vorige slotkoers', yAxis: prevCloseTotal, lineStyle: { color: themeStore.isDark ? '#3a3f46' : '#c8c8c8', type: 'dashed', width: 1 }, label: { formatter: () => themeStore.privacyMode ? '●●' : (prevCloseTotal >= 1000 ? `€${(prevCloseTotal / 1000).toFixed(1)}k` : `€${Math.round(prevCloseTotal)}`), position: 'insideEndTop', fontSize: 10, color: text } },
        ...sessionMarks,
      ];
      const actualValues = seriesValues.filter((v): v is number => v !== null);
      const maxDev = Math.max(...actualValues.map((v) => Math.abs(v - prevCloseTotal)), prevCloseTotal * 0.005);
      const yPad1D = maxDev * 1.1;
      return {
        backgroundColor: 'transparent', ...commonAxes,
        yAxis: { type: 'value', scale: true, min: prevCloseTotal > 0 ? prevCloseTotal - yPad1D : undefined, max: prevCloseTotal > 0 ? prevCloseTotal + yPad1D : undefined, splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, fontSize: 10, formatter: (n: number) => themeStore.privacyMode ? '●●' : (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`) } },
        tooltip: {
          trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { color: themeStore.isDark ? '#f2f4f7' : '#101216', fontSize: 11 },
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
      const fx   = fxFor(t);
      const prices = priceOverTime[t] ?? [];
      const data: (number | null)[] = prices.map((p, i) => {
        if (sortedTs[i]! > nowSec) return null;
        if (v === 'individual') return Math.round(((shr * p) / fx) * 100) / 100;
        if (v === 'pct')        return prev > 0 ? +(((p - prev) / prev) * 100).toFixed(3) : 0;
        return Math.round((((p - prev) * shr) / fx) * 100) / 100;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = { name: t, type: 'line', data, smooth: false, symbol: 'none', lineStyle: { color: getColor(t), width: v === 'pct' ? 2 : 1.5 } };
      if (stacked) { s.stack = 'total'; s.areaStyle = { color: getColor(t) + '28' }; }
      if (idx === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markData: any[] = [...sessionMarks];
        if (v === 'pct' || v === 'pl') markData.push({ name: 'Nul', yAxis: 0, lineStyle: { color: themeStore.isDark ? '#3a3f46' : '#c8c8c8', type: 'dashed', width: 1 }, label: { show: false } });
        s.markLine = { silent: true, symbol: 'none', data: markData };
      }
      return s;
    });
    return {
      backgroundColor: 'transparent', ...commonAxes,
      yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, fontSize: 10, formatter: v === 'pct' ? (n: number) => `${+n.toFixed(1)}%` : (n: number) => themeStore.privacyMode ? '●●' : (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`) } },
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBord, borderWidth: 1, textStyle: { fontSize: 11, color: themeStore.isDark ? '#f2f4f7' : '#101216' } },
      series,
    };
  }

  const chartOption   = $derived(period === '1d' ? build1DOption(view) : buildOption(filtered, view, period));
  const periodPlValue = $derived(period === '1d' ? day1Pl() : periodPl());
  const periodLabel   = $derived(PERIODS.find((p) => p.key === period)?.label ?? '');

  // ── Allocation from currency exposure ───────────────────────────────────────
  const allocationItems = $derived(() => {
    const entries = Object.entries(portfolioStore.currencyExposure ?? {});
    if (!entries.length) return [];
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries
      .map(([name, val]) => ({ name, pct: (val / total) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  });

  const ALLOC_COLORS = ['var(--accent)', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#10b981', '#f97316'];

  // ── Recent transactions ─────────────────────────────────────────────────────
  const recentTx = $derived([...portfolioStore.rawTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6));

  function stateLabel(s: string) {
    if (s === 'REGULAR') return 'Open'; if (s === 'PRE') return 'Pre'; if (s === 'POST') return 'Post'; return 'Gesloten';
  }
  function stateClass(s: string) {
    if (s === 'REGULAR') return 'badge-open'; if (s === 'PRE' || s === 'POST') return 'badge-ext'; return 'badge-closed';
  }

  function signed(v: number) { return `${v >= 0 ? '+' : ''}${fmt(v)}`; }
</script>

<div class="page-root">

  <!-- ── Hero C: 3-card split ─────────────────────────────────────────────── -->
  {#if portfolioStore.loaded}
    <div class="hero-c">

      <!-- Card 1: Total value -->
      <div class="card hero-total">
        <div class="h-eyebrow" style="margin-bottom:8px">Totale waarde</div>
        <div class="h-xl mono privacy-val" style="margin-bottom:10px">
          <PrivacyValue value={fmt(totalValue)} />
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="pill-badge" class:pos={totalPlPct >= 0} class:neg={totalPlPct < 0}>
            {totalPlPct >= 0 ? '▲' : '▼'} {Math.abs(totalPlPct).toFixed(1)}%
          </span>
          <span class="mono h-sm" style="color:{totalPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'};font-weight:600">
            <PrivacyValue value="{signed(totalPl)} totaal" />
          </span>
        </div>
      </div>

      <!-- Card 2: Today -->
      <div class="card hero-today">
        <div class="h-eyebrow" style="margin-bottom:8px">{intradayStore.loaded ? intradayDateLabel() : 'Vandaag'}</div>
        {#if intradayStore.loaded}
          <div class="mono" style="font-size:22px;font-weight:600;line-height:1;color:{totalDayPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
            <PrivacyValue value={signed(totalDayPl)} />
          </div>
          <div class="mono h-sm" style="margin-top:6px;color:{totalDayPl >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
            {fmtPct(totalDayPlPct)}
          </div>
        {:else}
          <div class="h-sm c-muted">Laden…</div>
        {/if}
      </div>

      <!-- Card 3: Movers -->
      <div class="card hero-movers">
        {#if movers().top}
          <div class="mover-row">
            <div class="mover-avatar" style="background:{getColor(movers().top!.ticker)}22;color:{getColor(movers().top!.ticker)}">{movers().top!.ticker.slice(0,2)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700">{movers().top!.ticker}</div>
              <div class="h-sm" style="font-size:10px">Top winner</div>
            </div>
            <div style="text-align:right">
              <div class="mono c-pos" style="font-size:12px;font-weight:700">{fmtPct(movers().top!.changePct ?? 0)}</div>
              <div class="mono h-sm" style="font-size:10px">{signed(movers().top!.changeEur ?? 0)}</div>
            </div>
          </div>
        {/if}
        {#if movers().bot && movers().bot!.ticker !== movers().top!?.ticker}
          <div class="hero-movers-sep"></div>
          <div class="mover-row">
            <div class="mover-avatar" style="background:{getColor(movers().bot!.ticker)}22;color:{getColor(movers().bot!.ticker)}">{movers().bot!.ticker.slice(0,2)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700">{movers().bot!.ticker}</div>
              <div class="h-sm" style="font-size:10px">Top loser</div>
            </div>
            <div style="text-align:right">
              <div class="mono c-neg" style="font-size:12px;font-weight:700">{fmtPct(movers().bot!.changePct ?? 0)}</div>
              <div class="mono h-sm" style="font-size:10px">{signed(movers().bot!.changeEur ?? 0)}</div>
            </div>
          </div>
        {/if}
        {#if !movers().top}
          <div class="h-sm c-muted" style="padding:4px 0">Intraday data laden…</div>
        {/if}
      </div>

    </div>
  {/if}

  <!-- ── Chart card ─────────────────────────────────────────────────────────── -->
  <div class="chart-card" style="margin-bottom:12px">
    <div class="chart-headline">
      <div class="headline-pl {(periodPlValue?.pl ?? 0) >= 0 ? 'c-pos' : 'c-neg'}" style:visibility={periodPlValue ? 'visible' : 'hidden'}>
        {#if periodPlValue}
          <PrivacyValue value={`${periodPlValue.pl >= 0 ? '+' : ''}${fmt(periodPlValue.pl)}`} />
          <span class="headline-pct">{fmtPct(periodPlValue.pct)}</span>
        {:else}&nbsp;{/if}
      </div>
      <div class="headline-caption">{period === '1d' && intradayStore.loaded ? intradayDateLabel() : periodLabel}</div>
    </div>

    <div class="chart-header">
      <div class="seg desktop-only">
        <button class="seg-btn" class:on={view === 'total'} onclick={() => (view = 'total')}>Totaal</button>
        <button class="seg-btn" class:on={view !== 'total'} onclick={() => (view = 'pct')}>Per positie</button>
      </div>
      {#if view !== 'total'}
        <div class="seg seg-sub desktop-only">
          {#each UNITS as u}
            <button class="seg-btn" class:on={view === u.key} onclick={() => (view = u.key)}>{u.label}</button>
          {/each}
        </div>
      {/if}
      <div class="period-pills desktop-only">
        {#each PERIODS as p}
          <button class="pill" class:on={period === p.key} onclick={() => (period = p.key)}>{p.label}</button>
        {/each}
      </div>
      <div class="chart-controls-mobile">
        <select class="mobile-select" bind:value={view}>
          {#each VIEWS as v}<option value={v.key}>{v.label}</option>{/each}
        </select>
        <select class="mobile-select" bind:value={period}>
          {#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}
        </select>
      </div>
    </div>

    <div class="chart-wrap">
      {#if chartOption}
        <Chart option={chartOption} height="340px" />
      {:else if period === '1d'}
        <div class="chart-empty" style="height:340px">Intraday data laden…</div>
      {:else if filtered.length <= 1}
        <div class="chart-empty" style="height:340px">Niet genoeg data voor deze periode</div>
      {/if}
    </div>

    <div class="chart-legend">
      {#if view !== 'total'}
        {#each visibleTickers as t}
          <a class="legend-item" href="/stock/{t}">
            <span class="legend-dot" style="background:{getColor(t)}"></span>{t}
          </a>
        {/each}
      {:else}
        <div class="legend-item"><span class="legend-line" style="background:var(--accent)"></span>Portefeuille</div>
        {#if period !== '1d'}
          <div class="legend-item"><span class="legend-line dashed"></span>Kostprijs</div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- ── Positions: A/B toggle ─────────────────────────────────────────────── -->
  {#if portfolioStore.positions.length > 0}
    <div class="card" style="overflow:hidden;margin-bottom:12px">
      <!-- Header with toggle -->
      <div class="pos-section-header">
        <div>
          <div class="h-md">Posities</div>
          <div class="h-sm" style="margin-top:2px">{portfolioStore.positions.length} actieve · <PrivacyValue value={fmt(totalValue)} /></div>
        </div>
        <div class="seg">
          <button class="seg-btn" class:on={posView === 'table'} onclick={() => (posView = 'table')} title="Tabel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <button class="seg-btn" class:on={posView === 'cards'} onclick={() => (posView = 'cards')} title="Cards">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
          </button>
        </div>
      </div>

      <!-- View A: Table with sparklines -->
      {#if posView === 'table'}
        <div class="pos-table-scroll">
          <table class="pos-table">
            <thead>
              <tr>
                <th onclick={() => portfolioStore.sortPositions('ticker')} class="sortable left">
                  Ticker {portfolioStore.posSort.col === 'ticker' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onclick={() => portfolioStore.sortPositions('value')} class="sortable right">
                  Waarde {portfolioStore.posSort.col === 'value' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onclick={() => portfolioStore.sortPositions('pl')} class="sortable right desktop-only">
                  P&amp;L {portfolioStore.posSort.col === 'pl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onclick={() => portfolioStore.sortPositions('dayPl')} class="sortable right">
                  Dag% {portfolioStore.posSort.col === 'dayPl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onclick={() => portfolioStore.sortPositions('dayPl')} class="sortable right desktop-only">
                  Vandaag {portfolioStore.posSort.col === 'dayPl' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="right desktop-only">30D</th>
                <th onclick={() => portfolioStore.sortPositions('cost')} class="sortable right desktop-only">
                  Ingelegd {portfolioStore.posSort.col === 'cost' ? (portfolioStore.posSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {#each portfolioStore.sortedPositions as pos}
                <tr onclick={() => (window.location.href = `/stock/${pos.ticker}`)}>
                  <td class="left">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="ticker-dot" style="background:{getColor(pos.ticker)}"></span>
                      <div>
                        <div style="font-weight:700;font-size:12px">{pos.ticker}</div>
                        {#if pos.label && pos.label !== pos.ticker}
                          <div class="h-sm desktop-only" style="font-size:10px">{pos.label}</div>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td class="right mono"><PrivacyValue value={fmt(pos.value)} /></td>
                  <td class="right mono desktop-only {pos.pl >= 0 ? 'c-pos' : 'c-neg'}">
                    <PrivacyValue value={signed(pos.pl)} />
                  </td>
                  <td class="right">
                    {@const dayInfo = intradayChangePctMap()[pos.ticker]}
                    {#if dayInfo?.pct != null}
                      <span class="pill-badge sm" class:pos={dayInfo.pct >= 0} class:neg={dayInfo.pct < 0}>
                        {dayInfo.pct >= 0 ? '▲' : '▼'} {Math.abs(dayInfo.pct).toFixed(1)}%
                      </span>
                    {:else}
                      <span class="c-muted">—</span>
                    {/if}
                  </td>
                  <td class="right mono desktop-only {(dayPlMap()[pos.ticker] ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
                    {#if dayPlMap()[pos.ticker] != null}
                      <PrivacyValue value={signed(dayPlMap()[pos.ticker] ?? 0)} />
                    {:else}<span class="c-muted">—</span>{/if}
                  </td>
                  <td class="right desktop-only">
                    <!-- svelte-ignore html-self-closing-tags -->
                    {@html miniSparkSvg(pos.ticker)}
                  </td>
                  <td class="right mono desktop-only c-muted"><PrivacyValue value={fmt(pos.costEur)} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

      <!-- View B: Card grid -->
      {:else}
        <div class="pos-cards-grid">
          {#each portfolioStore.sortedPositions as pos}
            <a href="/stock/{pos.ticker}" class="pos-card hover-lift" style="border-left:3px solid {getColor(pos.ticker)}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <div>
                  <div style="font-size:13px;font-weight:700;letter-spacing:-0.01em">{pos.ticker}</div>
                  <div class="h-sm" style="font-size:10px">{pos.label}</div>
                </div>
                {#if dayPlMap()[pos.ticker] != null}
                  <span class="pill-badge sm" class:pos={(dayPlMap()[pos.ticker] ?? 0) >= 0} class:neg={(dayPlMap()[pos.ticker] ?? 0) < 0}>
                    {(dayPlMap()[pos.ticker] ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(cards().find(c => c.ticker === pos.ticker)?.changePct ?? 0).toFixed(2)}%
                  </span>
                {/if}
              </div>
              <div class="mono" style="font-size:16px;font-weight:600;margin-bottom:6px">
                <PrivacyValue value={fmt(pos.value)} />
              </div>
              <!-- svelte-ignore html-self-closing-tags -->
              <div style="margin:4px 0">
                {@html miniSparkSvg(pos.ticker)}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;font-size:10px;color:var(--fg-muted)">
                <span>{pos.shares}×</span>
                <span class="mono" style="font-weight:700;color:{pos.plPct >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}">
                  {fmtPct(pos.plPct)}
                </span>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- ── Bottom row: allocation + recent transactions ──────────────────────── -->
  {#if portfolioStore.loaded}
    <div class="bottom-grid">

      <!-- Allocation by currency -->
      <div class="card" style="padding:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="h-md">Allocatie</div>
          <div class="h-sm">Valuta</div>
        </div>
        {#each allocationItems() as item, i}
          <div style="display:grid;grid-template-columns:60px 1fr 48px;gap:10px;align-items:center;margin-bottom:10px">
            <div style="font-size:12px;font-weight:600">{item.name}</div>
            <div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
              <div style="width:{item.pct}%;height:100%;background:{ALLOC_COLORS[i % ALLOC_COLORS.length]};border-radius:3px;transition:width .3s"></div>
            </div>
            <div class="mono" style="font-size:11px;font-weight:600;text-align:right">{item.pct.toFixed(1)}%</div>
          </div>
        {/each}
        {#if !allocationItems().length}
          <div class="h-sm c-muted">Geen data beschikbaar</div>
        {/if}
      </div>

      <!-- Recent transactions -->
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
          <div class="h-md">Recente transacties</div>
          <a href="/transactions" class="h-sm" style="cursor:pointer;text-decoration:underline;color:var(--fg-muted)">Alle bekijken</a>
        </div>
        {#each recentTx as tx, i}
          {@const isBuy = (tx.shares ?? 0) > 0}
          <div class="tx-row" style="border-bottom:{i < recentTx.length - 1 ? '1px solid var(--border)' : 'none'}">
            <div class="mono h-sm" style="font-size:11px;width:64px;flex-shrink:0">{tx.date.slice(5)}</div>
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
              <span class="dot" style="background:{getColor(tx.ticker)}"></span>
              <span style="font-size:12px;font-weight:600">{tx.ticker}</span>
            </div>
            <span class="tx-kind-pill" class:buy={isBuy} class:sell={!isBuy}>{isBuy ? 'KOOP' : 'VERKOOP'}</span>
            <div class="mono" style="font-size:12px;font-weight:600;text-align:right"><PrivacyValue value={fmt(tx.costEur)} /></div>
          </div>
        {/each}
        {#if !recentTx.length}
          <div style="padding:16px 18px" class="h-sm c-muted">Geen transacties</div>
        {/if}
      </div>

    </div>
  {/if}

  <div class="footer">
    Actief: {portfolioStore.currentTickers.join(', ')} · Geen financieel advies · Zelf gehosted
  </div>
</div>

<style>
  /* ── Hero C: 3-card split ─────────────────────────────── */
  .hero-c {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  .hero-total, .hero-today, .hero-movers { padding: 18px 20px; }
  .hero-movers { padding: 14px 16px; display: flex; flex-direction: column; justify-content: center; gap: 0; }
  .mover-row { display: flex; align-items: center; gap: 10px; }
  .mover-avatar {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 11px; flex-shrink: 0;
  }
  .hero-movers-sep { height: 1px; background: var(--border); margin: 10px 0; }

  @media (max-width: 860px) {
    .hero-c { grid-template-columns: 1fr 1fr; }
    .hero-movers { grid-column: 1 / -1; }
  }
  @media (max-width: 540px) {
    .hero-c { grid-template-columns: 1fr; }
    .hero-movers { grid-column: auto; }
  }

  /* ── Chart card internals ─────────────────────────────── */
  .chart-headline {
    display: flex; align-items: baseline; gap: 10px;
    padding: 14px 16px 10px; border-bottom: 1px solid var(--border); min-height: 40px;
  }
  .headline-pl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px; font-weight: 700; line-height: 1.1; white-space: nowrap;
  }
  .headline-pct { font-size: 14px; font-weight: 600; opacity: 0.8; margin-left: 8px; }
  .headline-caption { margin-left: auto; font-size: 12px; color: var(--fg-muted); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.04em; }

  .chart-wrap { position: relative; }
  .chart-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--fg-muted); font-size: 13px; }

  .chart-legend {
    display: flex; flex-wrap: wrap; gap: 10px 16px;
    padding: 10px 16px; border-top: 1px solid var(--border);
  }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg-muted); text-decoration: none; }
  .legend-item:hover { color: var(--fg); }
  .legend-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .legend-line { width: 16px; height: 2px; border-radius: 1px; flex-shrink: 0; background: var(--accent); }
  .legend-line.dashed { background: none !important; border-top: 2px dashed var(--fg-muted); height: 0; margin-top: 1px; }

  .seg-sub { background: transparent; border-color: transparent; padding: 0; }

  @media (max-width: 640px) {
    .chart-headline { padding: 10px 12px 8px; min-height: 34px; }
    .headline-pl { font-size: 17px; }
    .headline-pct { font-size: 12px; }
  }

  /* ── Positions section header ─────────────────────────── */
  .pos-section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px; border-bottom: 1px solid var(--border);
  }

  /* ── Positions table ──────────────────────────────────── */
  .pos-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .pos-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 520px; }
  .pos-table th {
    padding: 9px 12px; font-size: 10px; font-weight: 600;
    color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.07em;
    border-bottom: 1px solid var(--border); white-space: nowrap; vertical-align: bottom;
  }
  .pos-table th.sortable { cursor: pointer; user-select: none; }
  .pos-table th.sortable:hover { color: var(--fg); }
  .pos-table th.left, .pos-table td.left { text-align: left; }
  .pos-table th.right, .pos-table td.right { text-align: right; }
  .pos-table tbody tr:hover td { background: var(--surface-hover); cursor: pointer; }
  .pos-table td {
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    white-space: nowrap; vertical-align: middle;
    font-family: 'JetBrains Mono', monospace;
  }
  .pos-table td.left { font-family: inherit; }
  .pos-table tbody tr:last-child td { border-bottom: none; }
  .ticker-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 0; flex-shrink: 0; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }

  /* ── Position cards (view B) ──────────────────────────── */
  .pos-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    padding: 14px;
  }
  .pos-card {
    display: block; padding: 13px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    text-decoration: none; color: inherit; cursor: pointer;
  }
  .pos-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-hover); }

  @media (max-width: 640px) {
    .pos-table td, .pos-table th { padding: 8px 8px; }
    .pos-table { min-width: 360px; }
    .pos-cards-grid { grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; }
  }

  /* ── Bottom grid ──────────────────────────────────────── */
  .bottom-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; }

  @media (max-width: 700px) {
    .bottom-grid { grid-template-columns: 1fr; }
  }

  /* ── Recent tx rows ───────────────────────────────────── */
  .tx-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 18px;
  }
  .tx-kind-pill {
    display: inline-flex; align-items: center;
    padding: 2px 7px; border-radius: 999px;
    font-size: 9px; font-weight: 700; letter-spacing: 0.03em; flex-shrink: 0;
  }
  .tx-kind-pill.buy  { background: var(--c-pos-bg); color: var(--c-pos); }
  .tx-kind-pill.sell { background: var(--c-neg-bg); color: var(--c-neg); }

  /* ── Badges ───────────────────────────────────────────── */
  .badge { font-size: 9px; font-weight: 600; letter-spacing: 0.05em; padding: 2px 5px; border-radius: 3px; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; }
  .badge-open   { background: var(--c-pos-bg);                       color: var(--c-pos); }
  .badge-ext    { background: rgba(251,191,36,0.15);                  color: #d97706; }
  .badge-closed { background: rgba(100,116,139,0.12);                 color: #64748b; }

  /* ── Desktop-only hiding ──────────────────────────────── */
  @media (max-width: 640px) {
    .desktop-only { display: none !important; }
    .chart-controls-mobile { display: flex !important; }
  }
  .chart-controls-mobile { display: none; }

  /* ── Footer ───────────────────────────────────────────── */
  .footer { margin-top: 24px; padding: 12px 0; text-align: center; font-size: 11px; color: var(--fg-muted); }
</style>
