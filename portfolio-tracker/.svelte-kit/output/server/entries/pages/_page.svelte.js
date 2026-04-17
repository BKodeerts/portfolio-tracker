import { e as ensure_array_like, b as attr_class, c as escape_html, i as attr_style, d as stringify, f as derived } from "../../chunks/renderer.js";
import { p as portfolioStore, g as getColor } from "../../chunks/portfolio.svelte.js";
import { t as themeStore } from "../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct } from "../../chunks/fmt.js";
import { f as filterByPeriod } from "../../chunks/period.js";
import { P as PrivacyValue } from "../../chunks/PrivacyValue.js";
import { C as Chart } from "../../chunks/Chart.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let period = "total";
    let view = "total";
    const filtered = derived(() => filterByPeriod(portfolioStore.chartData));
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
    function buildOption(data, v) {
      const isDark = themeStore.isDark;
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const tooltipBg = isDark ? "#1e293b" : "#ffffff";
      const tooltipBord = isDark ? "#334155" : "#e2e8f0";
      {
        return {
          backgroundColor: "transparent",
          grid: {
            top: 16,
            right: 16,
            bottom: 32,
            left: 60,
            containLabel: false
          },
          xAxis: {
            type: "category",
            data: data.map((d) => d.date),
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
              formatter: (v2) => {
                if (themeStore.privacyMode) return "●●";
                return Math.abs(v2) >= 1e3 ? `€${+(v2 / 1e3).toFixed(1)}k` : `€${Math.round(v2)}`;
              }
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
              const date = new Date(params[0].axisValue).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
              const lines = params.filter((p) => p.seriesName !== "__cost").map((p) => `<div>${p.marker}${p.seriesName}: ${themeStore.privacyMode ? "●●●" : fmt(p.value)}</div>`);
              return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines.join("")}`;
            }
          },
          series: [
            {
              name: "Portefeuille",
              type: "line",
              data: data.map((d) => d.value),
              smooth: false,
              symbol: "none",
              lineStyle: { color: "#818cf8", width: 2 },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(99,102,241,0.2)" },
                    { offset: 1, color: "rgba(99,102,241,0.01)" }
                  ]
                }
              }
            },
            {
              name: "__cost",
              type: "line",
              data: data.map((d) => d.invested),
              smooth: false,
              symbol: "none",
              lineStyle: {
                color: isDark ? "#334155" : "#94a3b8",
                width: 1,
                type: "dashed"
              },
              areaStyle: {
                color: isDark ? "rgba(51,65,85,0.15)" : "rgba(148,163,184,0.1)"
              }
            }
          ]
        };
      }
    }
    const chartOption = derived(() => buildOption(filtered()));
    $$renderer2.push(`<div class="page-root"><div class="chart-card"><div class="chart-header svelte-1uha8ag"><div class="seg desktop-only svelte-1uha8ag"><!--[-->`);
    const each_array = ensure_array_like(VIEWS);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let v = each_array[$$index];
      $$renderer2.push(`<button${attr_class("seg-btn", void 0, { "on": view === v.key })}>${escape_html(v.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="period-pills desktop-only svelte-1uha8ag"><!--[-->`);
    const each_array_1 = ensure_array_like(PERIODS);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let p = each_array_1[$$index_1];
      $$renderer2.push(`<button${attr_class("pill", void 0, { "on": period === p.key })}>${escape_html(p.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="chart-controls-mobile svelte-1uha8ag"><select class="mobile-select"><!--[-->`);
    const each_array_2 = ensure_array_like(VIEWS);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let v = each_array_2[$$index_2];
      $$renderer2.option({ value: v.key, selected: view === v.key }, ($$renderer3) => {
        $$renderer3.push(`${escape_html(v.label)}`);
      });
    }
    $$renderer2.push(`<!--]--></select> <select class="mobile-select"><!--[-->`);
    const each_array_3 = ensure_array_like(PERIODS);
    for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
      let p = each_array_3[$$index_3];
      $$renderer2.option({ value: p.key, selected: period === p.key }, ($$renderer3) => {
        $$renderer3.push(`${escape_html(p.label)}`);
      });
    }
    $$renderer2.push(`<!--]--></select></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="chart-wrap svelte-1uha8ag">`);
    if (filtered().length > 1) {
      $$renderer2.push("<!--[0-->");
      Chart($$renderer2, { option: chartOption(), height: "380px" });
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="chart-empty svelte-1uha8ag" style="height:380px">Niet genoeg data voor deze periode</div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="legend svelte-1uha8ag"><div class="legend-item svelte-1uha8ag"><span class="legend-line svelte-1uha8ag" style="background:#818cf8"></span> Portefeuille</div> `);
      {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="legend-item svelte-1uha8ag"><span class="legend-line dashed svelte-1uha8ag" style="background:var(--fg-muted)"></span> Kostprijs</div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (portfolioStore.positions.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card" style="margin-top:16px;overflow-x:auto"><table class="pos-table svelte-1uha8ag"><thead><tr><th class="sortable svelte-1uha8ag">Ticker ${escape_html(portfolioStore.posSort.col === "ticker" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right svelte-1uha8ag">Waarde ${escape_html(portfolioStore.posSort.col === "value" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">P&amp;L ${escape_html(portfolioStore.posSort.col === "pl" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right svelte-1uha8ag">% ${escape_html(portfolioStore.posSort.col === "plPct" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">Vandaag ${escape_html(portfolioStore.posSort.col === "dayPl" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th><th class="sortable right desktop-only svelte-1uha8ag">Ingelegd ${escape_html(portfolioStore.posSort.col === "cost" ? portfolioStore.posSort.dir === "asc" ? "↑" : "↓" : "")}</th></tr></thead><tbody class="svelte-1uha8ag"><!--[-->`);
      const each_array_5 = ensure_array_like(portfolioStore.sortedPositions);
      for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
        let pos = each_array_5[$$index_5];
        $$renderer2.push(`<tr style="cursor:pointer" class="svelte-1uha8ag"><td class="svelte-1uha8ag"><span class="ticker-dot svelte-1uha8ag"${attr_style(`background:${stringify(getColor(pos.ticker))}`)}></span> <span class="ticker-name">${escape_html(pos.ticker)}</span> `);
        if (pos.label && pos.label !== pos.ticker) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="ticker-label desktop-only svelte-1uha8ag">${escape_html(pos.label)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></td><td class="right mono svelte-1uha8ag">`);
        PrivacyValue($$renderer2, { value: fmt(pos.value) });
        $$renderer2.push(`<!----></td><td${attr_class(`right mono desktop-only ${stringify(pos.pl >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
        PrivacyValue($$renderer2, { value: `${pos.pl >= 0 ? "+" : ""}${fmt(pos.pl)}` });
        $$renderer2.push(`<!----></td><td${attr_class(`right mono ${stringify(pos.plPct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>${escape_html(fmtPct(pos.plPct))}</td><td${attr_class(`right mono desktop-only ${stringify((pos.dayPl ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1uha8ag")}>`);
        if (pos.dayPl != null) {
          $$renderer2.push("<!--[0-->");
          PrivacyValue($$renderer2, { value: `${pos.dayPl >= 0 ? "+" : ""}${fmt(pos.dayPl)}` });
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
