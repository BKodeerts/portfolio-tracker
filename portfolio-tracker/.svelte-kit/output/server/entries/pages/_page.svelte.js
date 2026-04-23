import { c as attr_class, h as stringify, i as attr_style, e as escape_html, b as ensure_array_like, d as derived } from "../../chunks/renderer.js";
import { p as portfolioStore } from "../../chunks/portfolio.svelte.js";
import { i as intradayStore } from "../../chunks/intraday.svelte.js";
import { t as themeStore } from "../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct } from "../../chunks/fmt.js";
import { g as getColor } from "../../chunks/color.js";
import { n as normalizeMarketState, i as isExchangeOpen, s as sparklineSVG, E as EU_EXCHANGE_RE, g as getTradingMins } from "../../chunks/exchange.js";
import { P as PrivacyValue } from "../../chunks/PrivacyValue.js";
import { C as Chart } from "../../chunks/Chart.js";
import { h as html } from "../../chunks/html.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let period = "1d";
    let view = "total";
    let posView = "table";
    const liveData = derived(() => () => {
      if (!intradayStore.loaded || portfolioStore.positions.length === 0) return null;
      const fxRate = intradayStore.liveEurUsd;
      let liveValue = 0;
      let prevValue = 0;
      for (const pos of portfolioStore.positions) {
        const yahoo = pos.yahoo ?? pos.ticker;
        const intra = intradayStore.data[yahoo];
        const isEu = EU_EXCHANGE_RE.test(yahoo);
        const fx = isEu ? 1 : fxRate;
        if (!intra?.previousClose || !isEu && fx == null) {
          liveValue += pos.value;
          prevValue += pos.value;
          continue;
        }
        const pts = intra.points ?? [];
        const currentPrice = pts.at(-1)?.close ?? intra.previousClose;
        liveValue += pos.shares * currentPrice / fx;
        prevValue += pos.shares * intra.previousClose / fx;
      }
      return { value: liveValue, dayPl: liveValue - prevValue };
    });
    const totalValue = derived(() => liveData()()?.value ?? portfolioStore.positions.reduce((s, p) => s + p.value, 0));
    const totalPl = derived(() => totalValue() - portfolioStore.totalInvested);
    const totalPlPct = derived(() => portfolioStore.totalInvested > 0 ? totalPl() / portfolioStore.totalInvested * 100 : 0);
    const totalDayPl = derived(() => liveData()()?.dayPl ?? portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0));
    const totalDayPlPct = derived(() => totalValue() - totalDayPl() > 0 ? totalDayPl() / (totalValue() - totalDayPl()) * 100 : 0);
    const cards = derived(() => () => {
      return portfolioStore.currentTickers.map((ticker) => {
        const meta = portfolioStore.tickerMeta[ticker];
        const yahoo = meta?.["yahoo"] ?? ticker;
        const label = meta?.["label"] ?? ticker;
        const pos = portfolioStore.positions.find((p) => p.ticker === ticker);
        const shares = pos?.shares ?? 0;
        const intra = intradayStore.data[yahoo];
        const prevClose = intra?.previousClose ?? null;
        const pts = intra?.points ?? [];
        const lastPt = pts[pts.length - 1];
        const price = lastPt?.close ?? null;
        const tradingMins = getTradingMins(yahoo);
        const changePct = price != null && prevClose ? (price - prevClose) / prevClose * 100 : null;
        const isEu = EU_EXCHANGE_RE.test(yahoo);
        const fx = isEu ? 1 : intradayStore.liveEurUsd;
        const changeEur = price != null && prevClose && shares && fx != null ? (price - prevClose) * shares / fx : null;
        const rawState = intra?.marketState ?? "";
        const marketState = normalizeMarketState(yahoo, rawState || (isExchangeOpen(yahoo) ? "REGULAR" : "CLOSED"));
        const muted = marketState !== "REGULAR";
        const sparkHtml = pts.length >= 2 && prevClose ? sparklineSVG(pts, prevClose, tradingMins, muted) : "";
        return {
          ticker,
          yahoo,
          label,
          shares,
          prevClose,
          price,
          changePct,
          changeEur,
          marketState,
          sparkHtml
        };
      });
    });
    const movers = derived(() => () => {
      const cs = cards()().filter((c) => c.changePct != null);
      const sorted = [...cs].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
      return {
        top: sorted[0] ?? null,
        bot: sorted[sorted.length - 1] ?? null
      };
    });
    const dayPlMap = derived(() => () => {
      const m = {};
      for (const c of cards()()) m[c.ticker] = c.changeEur;
      return m;
    });
    function posSparkValues(ticker, n = 12) {
      return portfolioStore.chartData.slice(-n).map((pt) => pt[ticker] ?? 0).filter((v) => v > 0);
    }
    function miniSparkSvg(ticker) {
      const values = posSparkValues(ticker);
      if (values.length < 2) return "";
      const w = 72;
      const h = 22;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const step = w / (values.length - 1);
      const pts = values.map((v, i) => [i * step, h - (v - min) / range * (h - 3) - 1]);
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
      const up = values[values.length - 1] >= values[0];
      const color = up ? "var(--c-pos)" : "var(--c-neg)";
      const fill = up ? "var(--c-pos-bg)" : "var(--c-neg-bg)";
      const fillD = `${d} L${w} ${h} L0 ${h} Z`;
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><path d="${fillD}" fill="${fill}" /><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
    }
    const day1Pl = derived(() => () => {
      const tickers = portfolioStore.currentTickers;
      if (!tickers.length || !intradayStore.loaded) return null;
      const fxRate = intradayStore.liveEurUsd;
      if (fxRate === null && tickers.some((t) => !EU_EXCHANGE_RE.test(portfolioStore.tickerMeta[t]?.["yahoo"] ?? t))) return null;
      let prevCloseTotal = 0;
      let currentTotal = 0;
      for (const ticker of tickers) {
        const yahoo = portfolioStore.tickerMeta[ticker]?.["yahoo"] ?? ticker;
        const intra = intradayStore.data[yahoo];
        if (!intra) continue;
        const isEu = EU_EXCHANGE_RE.test(yahoo);
        const fx = isEu ? 1 : fxRate;
        const shares = portfolioStore.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
        const prevClose = intra.previousClose ?? 0;
        const pts = intra.points ?? [];
        const lastPrice = pts[pts.length - 1]?.close ?? prevClose;
        prevCloseTotal += shares * prevClose / fx;
        currentTotal += shares * lastPrice / fx;
      }
      if (prevCloseTotal <= 0) return null;
      const diff = currentTotal - prevCloseTotal;
      return { pl: diff, pct: diff / prevCloseTotal * 100 };
    });
    const PERIODS = [
      { key: "1d", label: "1D" },
      { key: "1m", label: "1M" },
      { key: "3m", label: "3M" },
      { key: "6m", label: "6M" },
      { key: "ytd", label: "YTD" },
      { key: "1y", label: "1Y" },
      { key: "2y", label: "2Y" },
      { key: "3y", label: "3Y" },
      { key: "total", label: "Max" }
    ];
    const VIEWS = [
      { key: "total", label: "Totaal" },
      { key: "individual", label: "Per positie" },
      { key: "pct", label: "Rendement %" },
      { key: "pl", label: "Winst €" }
    ];
    function chartColors() {
      const isDark = themeStore.isDark;
      return {
        grid: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        text: isDark ? "#8b929c" : "#6a6f78",
        tooltipBg: isDark ? "#15181c" : "#ffffff",
        tooltipBord: isDark ? "rgba(255,255,255,0.12)" : "rgba(16,18,22,0.12)"
      };
    }
    function build1DOption(v) {
      const tickers = portfolioStore.currentTickers;
      if (!tickers.length || !intradayStore.loaded) return null;
      const fxRateRaw = intradayStore.liveEurUsd;
      if (fxRateRaw === null && tickers.some((t) => !EU_EXCHANGE_RE.test(portfolioStore.tickerMeta[t]?.["yahoo"] ?? t))) return null;
      const fxRate = fxRateRaw ?? 1;
      const { grid, text, tooltipBg, tooltipBord } = chartColors();
      const allTsSet = /* @__PURE__ */ new Set();
      const priceMap = {};
      const prevCloseMap = {};
      const regionsPresent = /* @__PURE__ */ new Set();
      let sessionDate = null;
      for (const ticker of tickers) {
        const yahoo = portfolioStore.tickerMeta[ticker]?.["yahoo"] ?? ticker;
        const intra = intradayStore.data[yahoo];
        if (!intra) continue;
        prevCloseMap[ticker] = intra.previousClose ?? 0;
        const pts = intra.points ?? [];
        priceMap[ticker] = new Map(pts.map((p) => [p.ts, p.close]));
        for (const pt of pts) allTsSet.add(pt.ts);
        regionsPresent.add(EU_EXCHANGE_RE.test(yahoo) ? "EU" : "US");
        if (!sessionDate && intra.date) sessionDate = intra.date;
      }
      const unixAtLocal = (dateStr, h, m, tz) => {
        const [y, mo, d] = dateStr.split("-").map(Number);
        const naiveUtc = Date.UTC(y, mo - 1, d, h, m);
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }).formatToParts(new Date(naiveUtc));
        const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
        const tzAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
        return Math.floor((naiveUtc - (tzAsUtc - naiveUtc)) / 1e3);
      };
      const sessions = [];
      if (sessionDate) {
        if (regionsPresent.has("EU")) sessions.push({
          region: "EU",
          open: unixAtLocal(sessionDate, 9, 0, "Europe/Berlin"),
          close: unixAtLocal(sessionDate, 17, 30, "Europe/Berlin")
        });
        if (regionsPresent.has("US")) sessions.push({
          region: "US",
          open: unixAtLocal(sessionDate, 9, 30, "America/New_York"),
          close: unixAtLocal(sessionDate, 16, 0, "America/New_York")
        });
        if (sessions.length > 0) {
          const fullStart = Math.min(...sessions.map((s) => s.open));
          const fullEnd = Math.max(...sessions.map((s) => s.close));
          for (let ts = fullStart; ts <= fullEnd; ts += 300) allTsSet.add(ts);
        }
      }
      if (allTsSet.size === 0) return null;
      const nowSec = Date.now() / 1e3;
      const sortedTs = [...allTsSet].sort((a, b) => a - b);
      const labels = sortedTs.map((ts) => new Date(ts * 1e3).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }));
      const sessionMarks = [];
      for (const { region, open, close } of sessions) {
        const openIdx = sortedTs.findIndex((ts) => ts >= open);
        const closeIdx = sortedTs.findIndex((ts) => ts >= close);
        if (openIdx >= 0) sessionMarks.push({
          name: `${region} Open`,
          xAxis: openIdx,
          lineStyle: {
            color: "var(--c-pos)",
            type: "dashed",
            width: 1,
            opacity: 0.5
          },
          label: {
            formatter: `${region} open`,
            fontSize: 9,
            color: "var(--c-pos)",
            position: "insideStartTop"
          }
        });
        if (closeIdx >= 0) sessionMarks.push({
          name: `${region} Sluit`,
          xAxis: closeIdx,
          lineStyle: {
            color: "var(--c-neg)",
            type: "dashed",
            width: 1,
            opacity: 0.5
          },
          label: {
            formatter: `${region} sluit`,
            fontSize: 9,
            color: "var(--c-neg)",
            position: "insideEndBottom"
          }
        });
      }
      const hourInterval = (index) => {
        const ts = sortedTs[index];
        return ts !== void 0 && new Date(ts * 1e3).getMinutes() === 0;
      };
      const commonAxes = {
        xAxis: {
          type: "category",
          data: labels,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: text, fontSize: 10, interval: hourInterval }
        },
        grid: {
          top: 16,
          right: 16,
          bottom: 32,
          left: 60,
          containLabel: false
        }
      };
      const fxFor = (t) => EU_EXCHANGE_RE.test(portfolioStore.tickerMeta[t]?.["yahoo"] ?? t) ? 1 : fxRate;
      const sharesFor = (t) => portfolioStore.positions.find((p) => p.ticker === t)?.shares ?? 0;
      const priceOverTime = {};
      for (const ticker of tickers) {
        const pm = priceMap[ticker];
        const arr = [];
        let last = prevCloseMap[ticker] ?? 0;
        for (const ts of sortedTs) {
          const p = pm?.get(ts);
          if (p != null) last = p;
          arr.push(last);
        }
        priceOverTime[ticker] = arr;
      }
      {
        const seriesValues = [];
        for (let i = 0; i < sortedTs.length; i++) {
          if (sortedTs[i] > nowSec) {
            seriesValues.push(null);
            continue;
          }
          let total = 0;
          for (const ticker of tickers) total += sharesFor(ticker) * (priceOverTime[ticker]?.[i] ?? 0) / fxFor(ticker);
          seriesValues.push(Math.round(total * 100) / 100);
        }
        let prevCloseTotal = 0;
        for (const ticker of tickers) prevCloseTotal += sharesFor(ticker) * (prevCloseMap[ticker] ?? 0) / fxFor(ticker);
        prevCloseTotal = Math.round(prevCloseTotal * 100) / 100;
        const lastVal = seriesValues.findLast((v2) => v2 !== null) ?? 0;
        const isUp = lastVal >= prevCloseTotal;
        const lineClr = isUp ? "var(--c-pos)" : "var(--c-neg)";
        const areaClr = isUp ? "rgba(52,211,153," : "rgba(248,113,113,";
        const markLineData = [
          {
            name: "Vorige slotkoers",
            yAxis: prevCloseTotal,
            lineStyle: {
              color: themeStore.isDark ? "#3a3f46" : "#c8c8c8",
              type: "dashed",
              width: 1
            },
            label: {
              formatter: () => themeStore.privacyMode ? "●●" : prevCloseTotal >= 1e3 ? `€${(prevCloseTotal / 1e3).toFixed(1)}k` : `€${Math.round(prevCloseTotal)}`,
              position: "insideEndTop",
              fontSize: 10,
              color: text
            }
          },
          ...sessionMarks
        ];
        const actualValues = seriesValues.filter((v2) => v2 !== null);
        const maxDev = Math.max(...actualValues.map((v2) => Math.abs(v2 - prevCloseTotal)), prevCloseTotal * 5e-3);
        const yPad1D = maxDev * 1.1;
        return {
          backgroundColor: "transparent",
          ...commonAxes,
          yAxis: {
            type: "value",
            scale: true,
            min: prevCloseTotal > 0 ? prevCloseTotal - yPad1D : void 0,
            max: prevCloseTotal > 0 ? prevCloseTotal + yPad1D : void 0,
            splitLine: { lineStyle: { color: grid } },
            axisLabel: {
              color: text,
              fontSize: 10,
              formatter: (n) => themeStore.privacyMode ? "●●" : Math.abs(n) >= 1e3 ? `€${+(n / 1e3).toFixed(1)}k` : `€${Math.round(n)}`
            }
          },
          tooltip: {
            trigger: "axis",
            backgroundColor: tooltipBg,
            borderColor: tooltipBord,
            borderWidth: 1,
            textStyle: {
              color: themeStore.isDark ? "#f2f4f7" : "#101216",
              fontSize: 11
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (params) => {
              if (!Array.isArray(params) || !params[0]) return "";
              const val = params[0].value;
              const diff = val - prevCloseTotal;
              const pct = prevCloseTotal > 0 ? diff / prevCloseTotal * 100 : 0;
              const sign = diff >= 0 ? "+" : "";
              const clr = diff >= 0 ? "var(--c-pos)" : "var(--c-neg)";
              const valStr = themeStore.privacyMode ? "●●●" : fmt(val);
              const diffStr = themeStore.privacyMode ? "●●" : fmt(diff);
              return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div><div>${valStr}</div><div style="color:${clr}">${sign}${diffStr} (${sign}${pct.toFixed(2)}%)</div>`;
            }
          },
          series: [
            {
              name: "Portefeuille",
              type: "line",
              data: seriesValues,
              smooth: false,
              symbol: "none",
              lineStyle: { color: lineClr, width: 2 },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: areaClr + "0.2)" },
                    { offset: 1, color: areaClr + "0.02)" }
                  ]
                }
              },
              markLine: { silent: true, symbol: "none", data: markLineData }
            }
          ]
        };
      }
    }
    const chartOption = derived(
      () => build1DOption()
    );
    const periodPlValue = derived(() => day1Pl()());
    const periodLabel = derived(() => PERIODS.find((p) => p.key === period)?.label ?? "");
    const allocationItems = derived(() => () => {
      const entries = Object.entries(portfolioStore.currencyExposure ?? {});
      if (!entries.length) return [];
      const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
      return entries.map(([name, val]) => ({ name, pct: val / total * 100 })).sort((a, b) => b.pct - a.pct);
    });
    const ALLOC_COLORS = [
      "var(--accent)",
      "#8b5cf6",
      "#14b8a6",
      "#f59e0b",
      "#ec4899",
      "#10b981",
      "#f97316"
    ];
    const recentTx = derived(() => [...portfolioStore.rawTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6));
    function signed(v) {
      return `${v >= 0 ? "+" : ""}${fmt(v)}`;
    }
    $$renderer2.push(`<div class="page-root">`);
    if (portfolioStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="hero-c svelte-1uha8ag"><div class="card hero-total svelte-1uha8ag"><div class="h-eyebrow" style="margin-bottom:8px">Totale waarde</div> <div class="h-xl mono privacy-val svelte-1uha8ag" style="margin-bottom:10px">`);
      PrivacyValue($$renderer2, { value: fmt(totalValue()) });
      $$renderer2.push(`<!----></div> <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span${attr_class("pill-badge", void 0, { "pos": totalPlPct() >= 0, "neg": totalPlPct() < 0 })}>${escape_html(totalPlPct() >= 0 ? "▲" : "▼")} ${escape_html(Math.abs(totalPlPct()).toFixed(1))}%</span> <span class="mono h-sm svelte-1uha8ag"${attr_style(`color:${stringify(totalPl() >= 0 ? "var(--c-pos)" : "var(--c-neg)")};font-weight:600`)}>`);
      PrivacyValue($$renderer2, { value: `${stringify(signed(totalPl()))} totaal` });
      $$renderer2.push(`<!----></span></div></div> <div class="card hero-today svelte-1uha8ag"><div class="h-eyebrow" style="margin-bottom:8px">Vandaag</div> `);
      if (intradayStore.loaded) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="mono svelte-1uha8ag"${attr_style(`font-size:22px;font-weight:600;line-height:1;color:${stringify(totalDayPl() >= 0 ? "var(--c-pos)" : "var(--c-neg)")}`)}>`);
        PrivacyValue($$renderer2, { value: signed(totalDayPl()) });
        $$renderer2.push(`<!----></div> <div class="mono h-sm svelte-1uha8ag"${attr_style(`margin-top:6px;color:${stringify(totalDayPl() >= 0 ? "var(--c-pos)" : "var(--c-neg)")}`)}>${escape_html(fmtPct(totalDayPlPct()))}</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="h-sm c-muted svelte-1uha8ag">Laden…</div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="card hero-movers svelte-1uha8ag">`);
      if (movers()().top) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="mover-row svelte-1uha8ag"><div class="mover-avatar svelte-1uha8ag"${attr_style(`background:${stringify(getColor(movers()().top.ticker))}22;color:${stringify(getColor(movers()().top.ticker))}`)}>${escape_html(movers()().top.ticker.slice(0, 2))}</div> <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700">${escape_html(movers()().top.ticker)}</div> <div class="h-sm" style="font-size:10px">Top winner</div></div> <div style="text-align:right"><div class="mono c-pos svelte-1uha8ag" style="font-size:12px;font-weight:700">${escape_html(fmtPct(movers()().top.changePct ?? 0))}</div> <div class="mono h-sm svelte-1uha8ag" style="font-size:10px">${escape_html(signed(movers()().top.changeEur ?? 0))}</div></div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (movers()().bot && movers()().bot.ticker !== movers()().top?.ticker) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="hero-movers-sep svelte-1uha8ag"></div> <div class="mover-row svelte-1uha8ag"><div class="mover-avatar svelte-1uha8ag"${attr_style(`background:${stringify(getColor(movers()().bot.ticker))}22;color:${stringify(getColor(movers()().bot.ticker))}`)}>${escape_html(movers()().bot.ticker.slice(0, 2))}</div> <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700">${escape_html(movers()().bot.ticker)}</div> <div class="h-sm" style="font-size:10px">Top loser</div></div> <div style="text-align:right"><div class="mono c-neg svelte-1uha8ag" style="font-size:12px;font-weight:700">${escape_html(fmtPct(movers()().bot.changePct ?? 0))}</div> <div class="mono h-sm svelte-1uha8ag" style="font-size:10px">${escape_html(signed(movers()().bot.changeEur ?? 0))}</div></div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (!movers()().top) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="h-sm c-muted svelte-1uha8ag" style="padding:4px 0">Intraday data laden…</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="chart-card" style="margin-bottom:12px"><div class="chart-headline svelte-1uha8ag"><div${attr_class(`headline-pl ${stringify((periodPlValue()?.pl ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}${attr_style("", { visibility: periodPlValue() ? "visible" : "hidden" })}>`);
    if (periodPlValue()) {
      $$renderer2.push("<!--[0-->");
      PrivacyValue($$renderer2, {
        value: `${periodPlValue().pl >= 0 ? "+" : ""}${fmt(periodPlValue().pl)}`
      });
      $$renderer2.push(`<!----> <span class="headline-pct svelte-1uha8ag">${escape_html(fmtPct(periodPlValue().pct))}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(` `);
    }
    $$renderer2.push(`<!--]--></div> <div class="headline-caption svelte-1uha8ag">${escape_html(periodLabel())}</div></div> <div class="chart-header"><div class="seg desktop-only svelte-1uha8ag"><button${attr_class("seg-btn", void 0, { "on": view === "total" })}>Totaal</button> <button${attr_class("seg-btn", void 0, { "on": view !== "total" })}>Per positie</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="period-pills desktop-only svelte-1uha8ag"><!--[-->`);
    const each_array_1 = ensure_array_like(PERIODS);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let p = each_array_1[$$index_1];
      $$renderer2.push(`<button${attr_class("pill", void 0, { "on": period === p.key })}>${escape_html(p.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="chart-controls-mobile svelte-1uha8ag">`);
    $$renderer2.select({ class: "mobile-select", value: view }, ($$renderer3) => {
      $$renderer3.push(`<!--[-->`);
      const each_array_2 = ensure_array_like(VIEWS);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let v = each_array_2[$$index_2];
        $$renderer3.option({ value: v.key }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(v.label)}`);
        });
      }
      $$renderer3.push(`<!--]-->`);
    });
    $$renderer2.push(` `);
    $$renderer2.select({ class: "mobile-select", value: period }, ($$renderer3) => {
      $$renderer3.push(`<!--[-->`);
      const each_array_3 = ensure_array_like(PERIODS);
      for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
        let p = each_array_3[$$index_3];
        $$renderer3.option({ value: p.key }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(p.label)}`);
        });
      }
      $$renderer3.push(`<!--]-->`);
    });
    $$renderer2.push(`</div></div> <div class="chart-wrap svelte-1uha8ag">`);
    if (chartOption()) {
      $$renderer2.push("<!--[0-->");
      Chart($$renderer2, { option: chartOption(), height: "340px" });
    } else {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="chart-empty svelte-1uha8ag" style="height:340px">Intraday data laden…</div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="chart-legend svelte-1uha8ag">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="legend-item svelte-1uha8ag"><span class="legend-line svelte-1uha8ag" style="background:var(--accent)"></span>Portefeuille</div> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    if (portfolioStore.positions.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card" style="overflow:hidden;margin-bottom:12px"><div class="pos-section-header svelte-1uha8ag"><div><div class="h-md">Posities</div> <div class="h-sm" style="margin-top:2px">${escape_html(portfolioStore.positions.length)} actieve · `);
      PrivacyValue($$renderer2, { value: fmt(totalValue()) });
      $$renderer2.push(`<!----></div></div> <div class="seg"><button${attr_class("seg-btn", void 0, { "on": posView === "table" })} title="Tabel"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"></path></svg></button> <button${attr_class("seg-btn", void 0, { "on": posView === "cards" })} title="Cards"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="1.5"></rect><rect x="13" y="3" width="8" height="8" rx="1.5"></rect><rect x="3" y="13" width="8" height="8" rx="1.5"></rect><rect x="13" y="13" width="8" height="8" rx="1.5"></rect></svg></button></div></div> `);
      {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="pos-table-scroll svelte-1uha8ag"><table class="pos-table svelte-1uha8ag"><thead><tr><th class="sortable left svelte-1uha8ag">Ticker ${escape_html(portfolioStore.posSort.col === "ticker" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right svelte-1uha8ag">Waarde ${escape_html(portfolioStore.posSort.col === "value" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">P&amp;L ${escape_html(portfolioStore.posSort.col === "pl" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right svelte-1uha8ag">% ${escape_html(portfolioStore.posSort.col === "plPct" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">Vandaag ${escape_html(portfolioStore.posSort.col === "dayPl" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="right desktop-only svelte-1uha8ag">30D</th><th class="sortable right desktop-only svelte-1uha8ag">Ingelegd ${escape_html(portfolioStore.posSort.col === "cost" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th></tr></thead><tbody class="svelte-1uha8ag"><!--[-->`);
        const each_array_5 = ensure_array_like(portfolioStore.sortedPositions);
        for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
          let pos = each_array_5[$$index_5];
          $$renderer2.push(`<tr class="svelte-1uha8ag"><td class="left svelte-1uha8ag"><div style="display:flex;align-items:center;gap:8px"><span class="ticker-dot svelte-1uha8ag"${attr_style(`background:${stringify(getColor(pos.ticker))}`)}></span> <div><div style="font-weight:700;font-size:12px">${escape_html(pos.ticker)}</div> `);
          if (pos.label && pos.label !== pos.ticker) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<div class="h-sm desktop-only svelte-1uha8ag" style="font-size:10px">${escape_html(pos.label)}</div>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--></div></div></td><td class="right mono svelte-1uha8ag">`);
          PrivacyValue($$renderer2, { value: fmt(pos.value) });
          $$renderer2.push(`<!----></td><td${attr_class(`right mono desktop-only ${stringify(pos.pl >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
          PrivacyValue($$renderer2, { value: signed(pos.pl) });
          $$renderer2.push(`<!----></td><td class="right svelte-1uha8ag"><span${attr_class("pill-badge sm", void 0, { "pos": pos.plPct >= 0, "neg": pos.plPct < 0 })}>${escape_html(pos.plPct >= 0 ? "▲" : "▼")} ${escape_html(Math.abs(pos.plPct).toFixed(1))}%</span></td><td${attr_class(`right mono desktop-only ${stringify((dayPlMap()()[pos.ticker] ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
          if (dayPlMap()()[pos.ticker] != null) {
            $$renderer2.push("<!--[0-->");
            PrivacyValue($$renderer2, { value: signed(dayPlMap()()[pos.ticker] ?? 0) });
          } else {
            $$renderer2.push("<!--[-1-->");
            $$renderer2.push(`<span class="c-muted svelte-1uha8ag">—</span>`);
          }
          $$renderer2.push(`<!--]--></td><td class="right desktop-only svelte-1uha8ag">${html(miniSparkSvg(pos.ticker))}</td><td class="right mono desktop-only c-muted svelte-1uha8ag">`);
          PrivacyValue($$renderer2, { value: fmt(pos.costEur) });
          $$renderer2.push(`<!----></td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (portfolioStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="bottom-grid svelte-1uha8ag"><div class="card" style="padding:18px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div class="h-md">Allocatie</div> <div class="h-sm">Valuta</div></div> <!--[-->`);
      const each_array_7 = ensure_array_like(allocationItems()());
      for (let i = 0, $$length = each_array_7.length; i < $$length; i++) {
        let item = each_array_7[i];
        $$renderer2.push(`<div style="display:grid;grid-template-columns:60px 1fr 48px;gap:10px;align-items:center;margin-bottom:10px"><div style="font-size:12px;font-weight:600">${escape_html(item.name)}</div> <div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden"><div${attr_style(`width:${stringify(item.pct)}%;height:100%;background:${stringify(ALLOC_COLORS[i % ALLOC_COLORS.length])};border-radius:3px;transition:width .3s`)}></div></div> <div class="mono svelte-1uha8ag" style="font-size:11px;font-weight:600;text-align:right">${escape_html(item.pct.toFixed(1))}%</div></div>`);
      }
      $$renderer2.push(`<!--]--> `);
      if (!allocationItems()().length) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="h-sm c-muted svelte-1uha8ag">Geen data beschikbaar</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> <div class="card" style="overflow:hidden"><div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)"><div class="h-md">Recente transacties</div> <a href="/transactions" class="h-sm" style="cursor:pointer;text-decoration:underline;color:var(--fg-muted)">Alle bekijken</a></div> <!--[-->`);
      const each_array_8 = ensure_array_like(recentTx());
      for (let i = 0, $$length = each_array_8.length; i < $$length; i++) {
        let tx = each_array_8[i];
        const isBuy = (tx.shares ?? 0) > 0;
        $$renderer2.push(`<div class="tx-row svelte-1uha8ag"${attr_style(`border-bottom:${stringify(i < recentTx().length - 1 ? "1px solid var(--border)" : "none")}`)}><div class="mono h-sm svelte-1uha8ag" style="font-size:11px;width:64px;flex-shrink:0">${escape_html(tx.date.slice(5))}</div> <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0"><span class="dot"${attr_style(`background:${stringify(getColor(tx.ticker))}`)}></span> <span style="font-size:12px;font-weight:600">${escape_html(tx.ticker)}</span></div> <span${attr_class("tx-kind-pill svelte-1uha8ag", void 0, { "buy": isBuy, "sell": !isBuy })}>${escape_html(isBuy ? "KOOP" : "VERKOOP")}</span> <div class="mono svelte-1uha8ag" style="font-size:12px;font-weight:600;text-align:right">`);
        PrivacyValue($$renderer2, { value: fmt(tx.costEur) });
        $$renderer2.push(`<!----></div></div>`);
      }
      $$renderer2.push(`<!--]--> `);
      if (!recentTx().length) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div style="padding:16px 18px" class="h-sm c-muted svelte-1uha8ag">Geen transacties</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="footer svelte-1uha8ag">Actief: ${escape_html(portfolioStore.currentTickers.join(", "))} · Geen financieel advies · Zelf gehosted</div></div>`);
  });
}
export {
  _page as default
};
