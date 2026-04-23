import { e as ensure_array_like, b as attr_class, d as stringify, i as attr_style, c as escape_html, f as derived, a as attr } from "../../chunks/renderer.js";
import { p as portfolioStore } from "../../chunks/portfolio.svelte.js";
import { i as intradayStore, E as EU_EXCHANGE_RE, n as normalizeMarketState, a as isExchangeOpen, s as sparklineSVG, g as getTradingMins } from "../../chunks/exchange.js";
import { t as themeStore } from "../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct } from "../../chunks/fmt.js";
import { g as getColor } from "../../chunks/color.js";
import { P as PrivacyValue } from "../../chunks/PrivacyValue.js";
import { C as Chart } from "../../chunks/Chart.js";
import { h as html } from "../../chunks/html.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let period = "1d";
    let view = "total";
    const day1Pl = derived(() => () => {
      const tickers = portfolioStore.currentTickers;
      if (!tickers.length || !intradayStore.loaded) return null;
      const fxRate = intradayStore.liveEurUsd ?? 1.1;
      let prevCloseTotal = 0;
      let currentTotal = 0;
      for (const ticker of tickers) {
        const yahoo = portfolioStore.tickerMeta[ticker]?.["yahoo"] ?? ticker;
        const intra = intradayStore.data[yahoo];
        if (!intra) continue;
        const shares = portfolioStore.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
        const prevClose = intra.previousClose ?? 0;
        const pts = intra.allPoints ?? intra.points ?? [];
        const lastPrice = pts[pts.length - 1]?.close ?? prevClose;
        const fx = EU_EXCHANGE_RE.test(yahoo) ? 1 : fxRate;
        prevCloseTotal += shares * prevClose / fx;
        currentTotal += shares * lastPrice / fx;
      }
      if (prevCloseTotal <= 0) return null;
      const diff = currentTotal - prevCloseTotal;
      return { pl: diff, pct: diff / prevCloseTotal * 100 };
    });
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
        const changeEur = price != null && prevClose && shares ? (price - prevClose) * shares / (EU_EXCHANGE_RE.test(yahoo) ? 1 : intradayStore.liveEurUsd ?? 1.1) : null;
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
    function stateLabel(s) {
      if (s === "REGULAR") return "Open";
      if (s === "PRE") return "Pre";
      if (s === "POST") return "Post";
      return "Gesloten";
    }
    function stateClass(s) {
      if (s === "REGULAR") return "badge-open";
      if (s === "PRE" || s === "POST") return "badge-ext";
      return "badge-closed";
    }
    const totalDayPl = derived(() => cards()().reduce((s, c) => s + (c.changeEur ?? 0), 0));
    const totalValue = derived(() => portfolioStore.positions.reduce((s, p) => s + p.value, 0));
    const totalDayPlPct = derived(() => totalValue() - totalDayPl() > 0 ? totalDayPl() / (totalValue() - totalDayPl()) * 100 : 0);
    const dayPlMap = derived(() => () => {
      const m = {};
      for (const c of cards()()) m[c.ticker] = c.changeEur;
      return m;
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
    function build1DOption(v) {
      const tickers = portfolioStore.currentTickers;
      if (!tickers.length || !intradayStore.loaded) return null;
      const fxRate = intradayStore.liveEurUsd ?? 1.1;
      const isDark = themeStore.isDark;
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const tooltipBg = isDark ? "#1e293b" : "#ffffff";
      const tooltipBord = isDark ? "#334155" : "#e2e8f0";
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
        const pts = intra.allPoints ?? intra.points ?? [];
        priceMap[ticker] = new Map(pts.map((p) => [p.ts, p.close]));
        for (const pt of pts) allTsSet.add(pt.ts);
        regionsPresent.add(EU_EXCHANGE_RE.test(yahoo) ? "EU" : "US");
        if (!sessionDate && intra.date) sessionDate = intra.date;
      }
      if (allTsSet.size === 0) return null;
      const sortedTs = [...allTsSet].sort((a, b) => a - b);
      const labels = sortedTs.map((ts) => new Date(ts * 1e3).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }));
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
      const sessionMarks = [];
      if (sessionDate) {
        const firstTs = sortedTs[0];
        const lastTs = sortedTs[sortedTs.length - 1];
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
        for (const { region, open, close } of sessions) {
          if (open >= firstTs && open <= lastTs) {
            const openIdx = sortedTs.findIndex((ts) => ts >= open);
            if (openIdx >= 0) sessionMarks.push({
              name: `${region} Open`,
              xAxis: openIdx,
              lineStyle: { color: "#4ade80", type: "dashed", width: 1, opacity: 0.6 },
              label: {
                formatter: `${region} open`,
                fontSize: 9,
                color: "#4ade80",
                position: "insideStartTop"
              }
            });
          }
          if (close >= firstTs && close <= lastTs) {
            const closeIdx = sortedTs.findIndex((ts) => ts >= close);
            if (closeIdx >= 0) sessionMarks.push({
              name: `${region} Sluit`,
              xAxis: closeIdx,
              lineStyle: { color: "#f87171", type: "dashed", width: 1, opacity: 0.6 },
              label: {
                formatter: `${region} sluit`,
                fontSize: 9,
                color: "#f87171",
                position: "insideEndBottom"
              }
            });
          }
        }
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
          axisLabel: { color: textColor, fontSize: 10, interval: hourInterval }
        },
        grid: {
          top: 16,
          right: 16,
          bottom: 32,
          left: 60,
          containLabel: false
        }
      };
      {
        const seriesValues = [];
        for (let i = 0; i < sortedTs.length; i++) {
          let total = 0;
          for (const ticker of tickers) {
            total += sharesFor(ticker) * (priceOverTime[ticker]?.[i] ?? 0) / fxFor(ticker);
          }
          seriesValues.push(Math.round(total * 100) / 100);
        }
        let prevCloseTotal = 0;
        for (const ticker of tickers) {
          prevCloseTotal += sharesFor(ticker) * (prevCloseMap[ticker] ?? 0) / fxFor(ticker);
        }
        prevCloseTotal = Math.round(prevCloseTotal * 100) / 100;
        const lastVal = seriesValues[seriesValues.length - 1] ?? 0;
        const isUp = lastVal >= prevCloseTotal;
        const lineClr = isUp ? "#4ade80" : "#f87171";
        const areaClr = isUp ? "rgba(74,222,128," : "rgba(248,113,113,";
        const markLineData = [
          {
            name: "Vorige slotkoers",
            yAxis: prevCloseTotal,
            lineStyle: {
              color: isDark ? "#475569" : "#94a3b8",
              type: "dashed",
              width: 1
            },
            label: {
              formatter: () => themeStore.privacyMode ? "●●" : prevCloseTotal >= 1e3 ? `€${(prevCloseTotal / 1e3).toFixed(1)}k` : `€${Math.round(prevCloseTotal)}`,
              position: "insideEndTop",
              fontSize: 10,
              color: textColor
            }
          },
          ...sessionMarks
        ];
        return {
          backgroundColor: "transparent",
          ...commonAxes,
          yAxis: {
            type: "value",
            scale: true,
            splitLine: { lineStyle: { color: gridColor } },
            axisLabel: {
              color: textColor,
              fontSize: 10,
              formatter: (n) => themeStore.privacyMode ? "●●" : Math.abs(n) >= 1e3 ? `€${+(n / 1e3).toFixed(1)}k` : `€${Math.round(n)}`
            }
          },
          tooltip: {
            trigger: "axis",
            backgroundColor: tooltipBg,
            borderColor: tooltipBord,
            borderWidth: 1,
            textStyle: { color: isDark ? "#e2e8f0" : "#1c1c1c", fontSize: 11 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (params) => {
              if (!Array.isArray(params) || !params[0]) return "";
              const val = params[0].value;
              const diff = val - prevCloseTotal;
              const pct = prevCloseTotal > 0 ? diff / prevCloseTotal * 100 : 0;
              const sign = diff >= 0 ? "+" : "";
              const clr = diff >= 0 ? "#4ade80" : "#f87171";
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
    $$renderer2.push(`<div class="page-root svelte-1uha8ag"><div class="day-strip svelte-1uha8ag">`);
    if (intradayStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="day-lbl svelte-1uha8ag">Vandaag</span> <span${attr_class(`day-pl ${stringify(totalDayPl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
      PrivacyValue($$renderer2, { value: `${totalDayPl() >= 0 ? "+" : ""}${fmt(totalDayPl())}` });
      $$renderer2.push(`<!----></span> <span${attr_class(`day-pct ${stringify(totalDayPl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>${escape_html(fmtPct(totalDayPlPct()))}</span> `);
      if (intradayStore.liveEurUsd) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="fx-rate svelte-1uha8ag">EUR/USD ${escape_html(intradayStore.liveEurUsd.toFixed(4))}</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<span class="day-lbl c-muted svelte-1uha8ag">Laden…</span>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="ticker-scroll-wrap svelte-1uha8ag">`);
    if (intradayStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(cards()());
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let card = each_array[$$index];
        $$renderer2.push(`<a class="spark-card card svelte-1uha8ag"${attr("href", `/stock/${stringify(card.ticker)}`)}><div class="spark-header svelte-1uha8ag"><div class="spark-ticker svelte-1uha8ag">${escape_html(card.ticker)}</div> <span${attr_class(`badge ${stringify(stateClass(card.marketState))}`, "svelte-1uha8ag")}>${escape_html(stateLabel(card.marketState))}</span></div> <div class="spark-price svelte-1uha8ag">`);
        if (card.price != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="price-val svelte-1uha8ag">${escape_html(card.price.toFixed(2))}</span> `);
          if (card.changePct != null) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span${attr_class(`price-chg ${stringify(card.changePct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>${escape_html(card.changePct >= 0 ? "+" : "")}${escape_html(card.changePct.toFixed(2))}%</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="c-muted svelte-1uha8ag">—</span>`);
        }
        $$renderer2.push(`<!--]--></div> ${html(card.sparkHtml)}</a>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_1 = ensure_array_like(Array(4));
      for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
        each_array_1[i];
        $$renderer2.push(`<div class="spark-card card skeleton svelte-1uha8ag"></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> <div class="dashboard-grid svelte-1uha8ag"><div class="chart-panel svelte-1uha8ag"><div class="chart-card svelte-1uha8ag"><div class="chart-headline svelte-1uha8ag"><div${attr_class(`headline-pl ${stringify((periodPlValue()?.pl ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}${attr_style("", { visibility: periodPlValue() ? "visible" : "hidden" })}>`);
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
    $$renderer2.push(`<!--]--></div> <div class="headline-caption svelte-1uha8ag">${escape_html(periodLabel())}</div></div> <div class="chart-header svelte-1uha8ag"><div class="seg desktop-only svelte-1uha8ag"><button${attr_class("seg-btn svelte-1uha8ag", void 0, { "on": view === "total" })}>Totaal</button> <button${attr_class("seg-btn svelte-1uha8ag", void 0, { "on": view !== "total" })}>Per positie</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="period-pills desktop-only svelte-1uha8ag"><!--[-->`);
    const each_array_3 = ensure_array_like(PERIODS);
    for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
      let p = each_array_3[$$index_3];
      $$renderer2.push(`<button${attr_class("pill svelte-1uha8ag", void 0, { "on": period === p.key })}>${escape_html(p.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="chart-controls-mobile svelte-1uha8ag">`);
    $$renderer2.select(
      { class: "mobile-select", value: view },
      ($$renderer3) => {
        $$renderer3.push(`<!--[-->`);
        const each_array_4 = ensure_array_like(VIEWS);
        for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
          let v = each_array_4[$$index_4];
          $$renderer3.option(
            { value: v.key, class: "" },
            ($$renderer4) => {
              $$renderer4.push(`${escape_html(v.label)}`);
            },
            "svelte-1uha8ag"
          );
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-1uha8ag"
    );
    $$renderer2.push(` `);
    $$renderer2.select(
      { class: "mobile-select", value: period },
      ($$renderer3) => {
        $$renderer3.push(`<!--[-->`);
        const each_array_5 = ensure_array_like(PERIODS);
        for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
          let p = each_array_5[$$index_5];
          $$renderer3.option(
            { value: p.key, class: "" },
            ($$renderer4) => {
              $$renderer4.push(`${escape_html(p.label)}`);
            },
            "svelte-1uha8ag"
          );
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-1uha8ag"
    );
    $$renderer2.push(`</div></div> <div class="chart-wrap svelte-1uha8ag">`);
    if (chartOption()) {
      $$renderer2.push("<!--[0-->");
      Chart($$renderer2, { option: chartOption(), height: "380px" });
    } else {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="chart-empty svelte-1uha8ag" style="height:380px">Intraday data laden…</div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="legend svelte-1uha8ag"><div class="legend-item svelte-1uha8ag"><span class="legend-line svelte-1uha8ag" style="background:#818cf8"></span> Portefeuille</div> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="tickers-sidebar svelte-1uha8ag"><div class="sidebar-cards svelte-1uha8ag">`);
    if (intradayStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_7 = ensure_array_like(cards()());
      for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
        let card = each_array_7[$$index_7];
        $$renderer2.push(`<a class="spark-card card svelte-1uha8ag"${attr("href", `/stock/${stringify(card.ticker)}`)}><div class="spark-header svelte-1uha8ag"><div class="spark-ticker svelte-1uha8ag">${escape_html(card.ticker)}</div> <span${attr_class(`badge ${stringify(stateClass(card.marketState))}`, "svelte-1uha8ag")}>${escape_html(stateLabel(card.marketState))}</span></div> <div class="spark-price svelte-1uha8ag">`);
        if (card.price != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="price-val svelte-1uha8ag">${escape_html(card.price.toFixed(2))}</span> `);
          if (card.changePct != null) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span${attr_class(`price-chg ${stringify(card.changePct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>${escape_html(card.changePct >= 0 ? "+" : "")}${escape_html(card.changePct.toFixed(2))}%</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="c-muted svelte-1uha8ag">—</span>`);
        }
        $$renderer2.push(`<!--]--></div> ${html(card.sparkHtml)}</a>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_8 = ensure_array_like(Array(4));
      for (let i = 0, $$length = each_array_8.length; i < $$length; i++) {
        each_array_8[i];
        $$renderer2.push(`<div class="spark-card card skeleton svelte-1uha8ag"></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div></div></div> `);
    if (portfolioStore.positions.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="pos-table-card card svelte-1uha8ag"><table class="pos-table svelte-1uha8ag"><thead class="svelte-1uha8ag"><tr class="svelte-1uha8ag"><th class="sortable svelte-1uha8ag">Ticker ${escape_html(portfolioStore.posSort.col === "ticker" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right mobile-hide svelte-1uha8ag">Waarde ${escape_html(portfolioStore.posSort.col === "value" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">P&amp;L ${escape_html(portfolioStore.posSort.col === "pl" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right svelte-1uha8ag">% ${escape_html(portfolioStore.posSort.col === "plPct" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">Vandaag ${escape_html(portfolioStore.posSort.col === "dayPl" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">Ingelegd ${escape_html(portfolioStore.posSort.col === "cost" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th></tr></thead><tbody class="svelte-1uha8ag"><!--[-->`);
      const each_array_9 = ensure_array_like(portfolioStore.sortedPositions);
      for (let $$index_9 = 0, $$length = each_array_9.length; $$index_9 < $$length; $$index_9++) {
        let pos = each_array_9[$$index_9];
        $$renderer2.push(`<tr style="cursor:pointer" class="svelte-1uha8ag"><td class="svelte-1uha8ag"><span class="ticker-dot svelte-1uha8ag"${attr_style(`background:${stringify(getColor(pos.ticker))}`)}></span> <span class="ticker-name svelte-1uha8ag">${escape_html(pos.ticker)}</span> `);
        if (pos.label && pos.label !== pos.ticker) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="ticker-label desktop-only svelte-1uha8ag">${escape_html(pos.label)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></td><td class="right mono mobile-hide svelte-1uha8ag">`);
        PrivacyValue($$renderer2, { value: fmt(pos.value) });
        $$renderer2.push(`<!----></td><td${attr_class(`right mono desktop-only ${stringify(pos.pl >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
        PrivacyValue($$renderer2, { value: `${pos.pl >= 0 ? "+" : ""}${fmt(pos.pl)}` });
        $$renderer2.push(`<!----></td><td${attr_class(`right mono ${stringify(pos.plPct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>${escape_html(fmtPct(pos.plPct))}</td><td${attr_class(`right mono desktop-only ${stringify((dayPlMap()()[pos.ticker] ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
        if (dayPlMap()()[pos.ticker] != null) {
          $$renderer2.push("<!--[0-->");
          PrivacyValue($$renderer2, {
            value: `${(dayPlMap()()[pos.ticker] ?? 0) >= 0 ? "+" : ""}${fmt(dayPlMap()()[pos.ticker] ?? 0)}`
          });
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="c-muted svelte-1uha8ag">—</span>`);
        }
        $$renderer2.push(`<!--]--></td><td class="right mono desktop-only svelte-1uha8ag">`);
        PrivacyValue($$renderer2, { value: fmt(pos.costEur) });
        $$renderer2.push(`<!----></td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="footer svelte-1uha8ag">Actief: ${escape_html(portfolioStore.currentTickers.join(", "))} · Geen financieel advies · Zelf gehosted</div></div>`);
  });
}
export {
  _page as default
};
