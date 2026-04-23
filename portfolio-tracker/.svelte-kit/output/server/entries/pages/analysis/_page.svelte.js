import { e as ensure_array_like, b as attr_class, c as escape_html, i as attr_style, d as stringify, f as derived } from "../../../chunks/renderer.js";
import { p as portfolioStore } from "../../../chunks/portfolio.svelte.js";
import { t as themeStore } from "../../../chunks/theme.svelte.js";
import { a as fmtPct, f as fmt, b as fmtNum } from "../../../chunks/fmt.js";
import { g as getColor } from "../../../chunks/color.js";
import { C as Chart } from "../../../chunks/Chart.js";
import { P as PrivacyValue } from "../../../chunks/PrivacyValue.js";
function periodCutoff(period) {
  return null;
}
function filterByPeriod(data, period) {
  const cutoff = periodCutoff();
  if (!cutoff) return data;
  return data.filter((d) => d.date >= cutoff);
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let analysePeriod = "total";
    const SECTOR_COLORS = [
      "#818cf8",
      "#34d399",
      "#fbbf24",
      "#f87171",
      "#60a5fa",
      "#a78bfa",
      "#fb923c",
      "#4ade80",
      "#38bdf8",
      "#f472b6"
    ];
    const PALETTE = [
      "#fbbf24",
      "#818cf8",
      "#34d399",
      "#f87171",
      "#60a5fa",
      "#a78bfa",
      "#fb923c",
      "#4ade80",
      "#f472b6",
      "#22d3ee"
    ];
    const PERIODS = [
      { key: "1m", label: "1M" },
      { key: "3m", label: "3M" },
      { key: "6m", label: "6M" },
      { key: "ytd", label: "YTD" },
      { key: "1y", label: "1Y" },
      { key: "2y", label: "2Y" },
      { key: "3y", label: "3Y" },
      { key: "total", label: "Max" }
    ];
    const latest = derived(() => portfolioStore.chartData[portfolioStore.chartData.length - 1]);
    function donutOption(labels, values, colors) {
      const total = values.reduce((a, b) => a + b, 0);
      const isDark = themeStore.isDark;
      return {
        backgroundColor: "transparent",
        series: [
          {
            type: "pie",
            radius: ["58%", "80%"],
            avoidLabelOverlap: false,
            label: { show: false },
            emphasis: { scale: false },
            data: labels.map((l, i) => ({
              name: l,
              value: values[i],
              itemStyle: { color: colors[i % colors.length] }
            }))
          }
        ],
        tooltip: {
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          borderWidth: 1,
          textStyle: { color: isDark ? "#e2e8f0" : "#1c1c1c", fontSize: 11 },
          formatter: (p) => `${p.name}: ${themeStore.privacyMode ? "●●●" : fmt(p.value)} (${total > 0 ? (p.value / total * 100).toFixed(1) : 0}%)`
        }
      };
    }
    const allocationLabels = derived(() => [...portfolioStore.currentTickers].sort((a, b) => (latest()?.[b] ?? 0) - (latest()?.[a] ?? 0)));
    const allocationValues = derived(() => allocationLabels().map((t) => latest()?.[t] ?? 0));
    const allocationColors = derived(() => allocationLabels().map((t) => getColor(t)));
    const allocationOption = derived(() => donutOption(allocationLabels(), allocationValues(), allocationColors()));
    const sectorData = derived(() => () => {
      if (!latest()) return { labels: [], values: [], colors: [] };
      const map = {};
      for (const t of portfolioStore.currentTickers) {
        const sector = portfolioStore.tickerMeta[t]?.["sector"] ?? "Overig";
        map[sector] = (map[sector] ?? 0) + (latest()[t] ?? 0);
      }
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
      return {
        labels: sorted.map(([s]) => s),
        values: sorted.map(([, v]) => v),
        colors: sorted.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length])
      };
    });
    const sectorOption = derived(() => donutOption(sectorData()().labels, sectorData()().values, sectorData()().colors));
    const geoData = derived(() => () => {
      if (!latest()) return { labels: [], values: [], colors: [] };
      const map = {};
      for (const t of portfolioStore.currentTickers) {
        const geo = portfolioStore.tickerMeta[t]?.["geo"] ?? "Overig";
        map[geo] = (map[geo] ?? 0) + (latest()[t] ?? 0);
      }
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
      return {
        labels: sorted.map(([g]) => g),
        values: sorted.map(([, v]) => v),
        colors: sorted.map((_, i) => PALETTE[i % PALETTE.length])
      };
    });
    const geoOption = derived(() => donutOption(geoData()().labels, geoData()().values, geoData()().colors));
    const currencyData = derived(() => () => {
      const exp = portfolioStore.currencyExposure;
      if (Object.keys(exp).length === 0) {
        const usd = portfolioStore.usdExposurePct ?? 0;
        return {
          labels: ["USD", "EUR"],
          values: [usd, 100 - usd],
          colors: [PALETTE[0], PALETTE[1]]
        };
      }
      const sorted = Object.entries(exp).sort((a, b) => b[1] - a[1]);
      return {
        labels: sorted.map(([c]) => c),
        values: sorted.map(([, v]) => v),
        colors: sorted.map((_, i) => PALETTE[i % PALETTE.length])
      };
    });
    const currencyOption = derived(() => donutOption(currencyData()().labels, currencyData()().values, currencyData()().colors));
    const barOption = derived(() => () => {
      if (!latest()) return {};
      const tickers = [...portfolioStore.currentTickers].sort((a, b) => (latest()[b] ?? 0) - (latest()[a] ?? 0));
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      return {
        backgroundColor: "transparent",
        grid: { top: 8, right: 16, bottom: 8, left: 16, containLabel: true },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v) => themeStore.privacyMode ? "●●" : `€${Math.round(v / 1e3)}k`
          }
        },
        yAxis: {
          type: "category",
          data: tickers,
          axisLabel: { color: textColor, fontSize: 11 },
          splitLine: { show: false }
        },
        tooltip: {
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          borderWidth: 1,
          textStyle: { color: isDark ? "#e2e8f0" : "#1c1c1c", fontSize: 11 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params) => params.map((p) => `${p.marker}${p.seriesName}: ${themeStore.privacyMode ? "●●●" : fmt(p.value)}`).join("<br>")
        },
        series: [
          {
            name: "Geïnvesteerd",
            type: "bar",
            data: tickers.map((t) => latest()[`${t}_cost`] ?? 0),
            itemStyle: {
              color: isDark ? "rgba(71,85,105,0.6)" : "rgba(148,163,184,0.5)",
              borderRadius: [0, 3, 3, 0]
            }
          },
          {
            name: "Huidig",
            type: "bar",
            data: tickers.map((t) => latest()[t] ?? 0),
            itemStyle: {
              color: (p) => getColor(tickers[p.dataIndex]) + "CC",
              borderRadius: [0, 3, 3, 0]
            }
          }
        ]
      };
    });
    const annualOption = derived(() => () => {
      if (!portfolioStore.annualPl.length) return {};
      const rows = [...portfolioStore.annualPl].sort((a, b) => a.year.localeCompare(b.year));
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      return {
        backgroundColor: "transparent",
        grid: { top: 24, right: 16, bottom: 32, left: 64 },
        legend: {
          data: ["Gerealiseerd", "Dividenden"],
          textStyle: { color: textColor, fontSize: 11 },
          itemWidth: 10,
          itemHeight: 10,
          top: 0
        },
        xAxis: {
          type: "category",
          data: rows.map((a) => a.year),
          axisLabel: { color: textColor, fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v) => themeStore.privacyMode ? "●●" : Math.abs(v) >= 1e3 ? `€${+(v / 1e3).toFixed(0)}k` : `€${Math.round(v)}`
          }
        },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          borderWidth: 1,
          textStyle: { fontSize: 11, color: isDark ? "#e2e8f0" : "#1c1c1c" },
          formatter: (params) => {
            const arr = params;
            const year = arr[0]?.name ?? "";
            const lines = arr.filter((p) => p.value !== 0 && p.value != null).map((p) => `${p.marker}${p.seriesName}: ${themeStore.privacyMode ? "●●●" : fmt(p.value)}`);
            const total = arr.reduce((s, p) => s + (p.value ?? 0), 0);
            lines.push(`<b>Totaal: ${themeStore.privacyMode ? "●●●" : fmt(total)}</b>`);
            return `${year}<br>${lines.join("<br>")}`;
          }
        },
        series: [
          {
            name: "Gerealiseerd",
            type: "bar",
            stack: "pl",
            data: rows.map((a) => ({
              value: a.realizedPl,
              itemStyle: { color: a.realizedPl >= 0 ? "#4ade80" : "#f87171" }
            }))
          },
          {
            name: "Dividenden",
            type: "bar",
            stack: "pl",
            data: rows.map((a) => a.dividends),
            itemStyle: { color: "#818cf8" }
          }
        ]
      };
    });
    const benchmarkOption = derived(() => () => {
      const filtered = filterByPeriod(portfolioStore.chartData);
      if (filtered.length < 2) return {};
      const vwceMap = Object.fromEntries(portfolioStore.benchmarkData.map((b) => [b.date, b.value]));
      const sp500Map = Object.fromEntries(portfolioStore.sp500Data.map((b) => [b.date, b.value]));
      const ab = portfolioStore.activeBenchmark;
      const first = filtered[0];
      const startDate = first.date;
      const startCost = first.invested ?? 1;
      const startTotal = first.value ?? 0;
      const baseReturn = startCost > 0 ? startTotal / startCost : 1;
      const vwceBase = vwceMap[startDate] ?? null;
      const sp500Base = sp500Map[startDate] ?? null;
      const portfolioPoints = [[startDate, 0]];
      const vwcePoints = [[startDate, 0]];
      const sp500Points = [[startDate, 0]];
      for (let i = 1; i < filtered.length; i++) {
        const row = filtered[i];
        const cost = row.invested ?? 0;
        const absReturn = cost > 0 ? row.value / cost : baseReturn;
        portfolioPoints.push([row.date, +((absReturn / baseReturn - 1) * 100).toFixed(2)]);
        const vwce = vwceMap[row.date];
        vwcePoints.push([
          row.date,
          vwce != null && vwceBase ? +((vwce / vwceBase - 1) * 100).toFixed(2) : null
        ]);
        const sp = sp500Map[row.date];
        sp500Points.push([
          row.date,
          sp != null && sp500Base ? +((sp / sp500Base - 1) * 100).toFixed(2) : null
        ]);
      }
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const series = [
        {
          name: "Portefeuille",
          type: "line",
          data: portfolioPoints.map(([, v]) => v),
          smooth: false,
          symbol: "none",
          connectNulls: true,
          lineStyle: { color: "#818cf8", width: 2 }
        }
      ];
      if (ab === "vwce" || ab === "both") {
        series.push({
          name: "VWCE",
          type: "line",
          data: vwcePoints.map(([, v]) => v),
          smooth: false,
          symbol: "none",
          connectNulls: true,
          lineStyle: { color: "#34d399", width: 1.5, type: "dashed" }
        });
      }
      if (ab === "sp500" || ab === "both") {
        series.push({
          name: "S&P 500",
          type: "line",
          data: sp500Points.map(([, v]) => v),
          smooth: false,
          symbol: "none",
          connectNulls: true,
          lineStyle: { color: "#fbbf24", width: 1.5, type: "dashed" }
        });
      }
      return {
        backgroundColor: "transparent",
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: {
          type: "category",
          data: portfolioPoints.map(([d]) => d),
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: textColor, fontSize: 10, interval: "auto" }
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v) => `${+v.toFixed(1)}%`
          }
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          borderWidth: 1,
          textStyle: { color: isDark ? "#e2e8f0" : "#1c1c1c", fontSize: 11 }
        },
        series
      };
    });
    $$renderer2.push(`<div class="page-root"><div class="section-header svelte-8pceb3"><h2 class="section-title svelte-8pceb3">Analyse</h2> <div class="period-pills"><!--[-->`);
    const each_array = ensure_array_like(PERIODS);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let p = each_array[$$index];
      $$renderer2.push(`<button${attr_class("pill", void 0, { "on": analysePeriod === p.key })}>${escape_html(p.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="donut-grid svelte-8pceb3"><div class="card donut-card svelte-8pceb3"><div class="card-title">Allocatie</div> <div class="donut-wrap svelte-8pceb3">`);
    Chart($$renderer2, { option: allocationOption(), height: "160px" });
    $$renderer2.push(`<!----></div> <div class="donut-legend svelte-8pceb3"><!--[-->`);
    const each_array_1 = ensure_array_like(allocationLabels());
    for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
      let t = each_array_1[i];
      const total = allocationValues().reduce((a, b) => a + b, 0);
      $$renderer2.push(`<div class="donut-legend-item svelte-8pceb3"><span class="donut-dot svelte-8pceb3"${attr_style(`background:${stringify(allocationColors()[i])}`)}></span> <span class="donut-ticker svelte-8pceb3">${escape_html(t)}</span> <span class="donut-pct svelte-8pceb3">${escape_html(total > 0 ? (allocationValues()[i] / total * 100).toFixed(1) : 0)}%</span></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="card donut-card svelte-8pceb3"><div class="card-title">Sector</div> <div class="donut-wrap svelte-8pceb3">`);
    Chart($$renderer2, { option: sectorOption(), height: "160px" });
    $$renderer2.push(`<!----></div> <div class="donut-legend svelte-8pceb3"><!--[-->`);
    const each_array_2 = ensure_array_like(sectorData()().labels);
    for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
      let s = each_array_2[i];
      const total = sectorData()().values.reduce((a, b) => a + b, 0);
      $$renderer2.push(`<div class="donut-legend-item svelte-8pceb3"><span class="donut-dot svelte-8pceb3"${attr_style(`background:${stringify(sectorData()().colors[i])}`)}></span> <span class="donut-ticker svelte-8pceb3">${escape_html(s)}</span> <span class="donut-pct svelte-8pceb3">${escape_html(total > 0 ? (sectorData()().values[i] / total * 100).toFixed(1) : 0)}%</span></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="card donut-card svelte-8pceb3"><div class="card-title">Geografie</div> <div class="donut-wrap svelte-8pceb3">`);
    Chart($$renderer2, { option: geoOption(), height: "160px" });
    $$renderer2.push(`<!----></div> <div class="donut-legend svelte-8pceb3"><!--[-->`);
    const each_array_3 = ensure_array_like(geoData()().labels);
    for (let i = 0, $$length = each_array_3.length; i < $$length; i++) {
      let g = each_array_3[i];
      const total = geoData()().values.reduce((a, b) => a + b, 0);
      $$renderer2.push(`<div class="donut-legend-item svelte-8pceb3"><span class="donut-dot svelte-8pceb3"${attr_style(`background:${stringify(geoData()().colors[i])}`)}></span> <span class="donut-ticker svelte-8pceb3">${escape_html(g)}</span> <span class="donut-pct svelte-8pceb3">${escape_html(total > 0 ? (geoData()().values[i] / total * 100).toFixed(1) : 0)}%</span></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="card donut-card svelte-8pceb3"><div class="card-title">Valuta</div> <div class="donut-wrap svelte-8pceb3">`);
    Chart($$renderer2, { option: currencyOption(), height: "160px" });
    $$renderer2.push(`<!----></div> <div class="donut-legend svelte-8pceb3"><!--[-->`);
    const each_array_4 = ensure_array_like(currencyData()().labels);
    for (let i = 0, $$length = each_array_4.length; i < $$length; i++) {
      let c = each_array_4[i];
      $$renderer2.push(`<div class="donut-legend-item svelte-8pceb3"><span class="donut-dot svelte-8pceb3"${attr_style(`background:${stringify(currencyData()().colors[i])}`)}></span> <span class="donut-ticker svelte-8pceb3">${escape_html(c)}</span> <span class="donut-pct svelte-8pceb3">${escape_html(currencyData()().values[i].toFixed(1))}%</span></div>`);
    }
    $$renderer2.push(`<!--]--></div></div></div> `);
    if (latest()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card chart-card" style="margin-top:16px"><div class="card-title" style="padding:12px 16px">Geïnvesteerd vs. huidig</div> `);
      Chart($$renderer2, { option: barOption()(), height: "280px" });
      $$renderer2.push(`<!----></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="card chart-card" style="margin-top:16px"><div class="chart-header svelte-8pceb3"><span class="card-title">Benchmark</span> <div class="seg"><button${attr_class("seg-btn", void 0, { "on": portfolioStore.activeBenchmark === "vwce" })}>VWCE</button> <button${attr_class("seg-btn", void 0, { "on": portfolioStore.activeBenchmark === "sp500" })}>S&amp;P 500</button> <button${attr_class("seg-btn", void 0, { "on": portfolioStore.activeBenchmark === "both" })}>Beide</button></div></div> `);
    Chart($$renderer2, { option: benchmarkOption()(), height: "260px" });
    $$renderer2.push(`<!----> <div class="legend svelte-8pceb3" style="padding:10px 16px;border-top:1px solid var(--border)"><div class="legend-item svelte-8pceb3"><span class="legend-line svelte-8pceb3" style="background:#818cf8"></span>Portefeuille</div> `);
    if (portfolioStore.activeBenchmark === "vwce" || portfolioStore.activeBenchmark === "both") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="legend-item svelte-8pceb3"><span class="legend-line dashed svelte-8pceb3" style="border-color:#34d399"></span>VWCE</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (portfolioStore.activeBenchmark === "sp500" || portfolioStore.activeBenchmark === "both") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="legend-item svelte-8pceb3"><span class="legend-line dashed svelte-8pceb3" style="border-color:#fbbf24"></span>S&amp;P 500</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div> `);
    if (portfolioStore.riskMetrics) {
      $$renderer2.push("<!--[0-->");
      const rm = portfolioStore.riskMetrics;
      $$renderer2.push(`<div class="card" style="margin-top:16px;padding:16px"><div class="card-title" style="margin-bottom:12px">Risico</div> <div class="metrics-grid svelte-8pceb3"><div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Sharpe</div> <div class="metric-value svelte-8pceb3">${escape_html(rm.sharpe != null ? fmtNum(rm.sharpe) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Sortino</div> <div class="metric-value svelte-8pceb3">${escape_html(rm.sortino != null ? fmtNum(rm.sortino) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Max Drawdown</div> <div${attr_class(`metric-value ${stringify((rm.maxDrawdown ?? 0) < 0 ? "c-neg" : "")}`, "svelte-8pceb3")}>${escape_html(rm.maxDrawdown != null ? fmtPct(rm.maxDrawdown) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Volatiliteit</div> <div class="metric-value svelte-8pceb3">${escape_html(rm.volatility != null ? fmtPct(rm.volatility) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Beta</div> <div class="metric-value svelte-8pceb3">${escape_html(rm.beta != null ? fmtNum(rm.beta) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Calmar</div> <div class="metric-value svelte-8pceb3">${escape_html(rm.calmar != null ? fmtNum(rm.calmar) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">IRR</div> <div${attr_class(`metric-value ${stringify((portfolioStore.irrPct ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>${escape_html(portfolioStore.irrPct != null ? fmtPct(portfolioStore.irrPct) : "—")}</div></div> <div class="metric-item svelte-8pceb3"><div class="metric-label svelte-8pceb3">Gerealiseerd</div> <div${attr_class(`metric-value ${stringify(portfolioStore.realizedPl >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>`);
      PrivacyValue($$renderer2, {
        value: `${portfolioStore.realizedPl >= 0 ? "+" : ""}${fmt(portfolioStore.realizedPl)}`
      });
      $$renderer2.push(`<!----></div></div></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (portfolioStore.rollingReturns.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card" style="margin-top:16px;overflow-x:auto"><div class="card-title" style="padding:12px 16px">Rolling returns</div> <table class="pos-table svelte-8pceb3"><thead><tr><th class="svelte-8pceb3">Periode</th><th class="right svelte-8pceb3">Portefeuille</th><th class="right svelte-8pceb3">VWCE</th><th class="right svelte-8pceb3">S&amp;P 500</th></tr></thead><tbody class="svelte-8pceb3"><!--[-->`);
      const each_array_5 = ensure_array_like(portfolioStore.rollingReturns);
      for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
        let r = each_array_5[$$index_5];
        $$renderer2.push(`<tr class="svelte-8pceb3"><td class="svelte-8pceb3">${escape_html(r.period)}</td><td${attr_class(`right mono ${stringify((r.portfolio ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>${escape_html(r.portfolio != null ? fmtPct(r.portfolio) : "—")}</td><td class="right mono svelte-8pceb3">${escape_html(r.benchmark != null ? fmtPct(r.benchmark) : "—")}</td><td class="right mono svelte-8pceb3">${escape_html(r.sp500 != null ? fmtPct(r.sp500) : "—")}</td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (portfolioStore.annualPl.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card chart-card" style="margin-top:16px"><div class="card-title" style="padding:12px 16px">Jaarlijks resultaat</div> `);
      Chart($$renderer2, { option: annualOption()(), height: "220px" });
      $$renderer2.push(`<!----></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
