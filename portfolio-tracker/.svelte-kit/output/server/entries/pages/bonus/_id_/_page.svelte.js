import { c as attr_class, h as stringify, e as escape_html, a as attr, d as derived, s as store_get, u as unsubscribe_stores } from "../../../../chunks/renderer.js";
import { p as page } from "../../../../chunks/stores.js";
import { p as portfolioStore } from "../../../../chunks/portfolio.svelte.js";
import { t as themeStore } from "../../../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct, b as fmtNum } from "../../../../chunks/fmt.js";
import { C as Chart } from "../../../../chunks/Chart.js";
import { P as PrivacyValue } from "../../../../chunks/PrivacyValue.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const id = derived(() => store_get($$store_subs ??= {}, "$page", page).params["id"] ?? "");
    const item = derived(() => portfolioStore.bonusItems.find((b) => b.id === id()) ?? null);
    let history = [];
    let showPrior = true;
    const plChartOption = derived(() => () => {
      if (!history.length || !item()) return {};
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const totalCost = item().totalCost ?? 0;
      const shownHistory = history;
      return {
        backgroundColor: "transparent",
        grid: { top: 16, right: 16, bottom: 32, left: 64 },
        xAxis: {
          type: "category",
          data: shownHistory.map((p) => p.date),
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
            formatter: (v) => themeStore.privacyMode ? "●●" : Math.abs(v) >= 1e3 ? `€${+(v / 1e3).toFixed(1)}k` : `€${Math.round(v)}`
          }
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          borderWidth: 1,
          textStyle: { fontSize: 11, color: isDark ? "#e2e8f0" : "#1c1c1c" }
        },
        series: [
          {
            name: "Waarde",
            type: "line",
            data: shownHistory.map((p) => p.value),
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
          ...totalCost > 0 ? [
            {
              name: "Kostprijs",
              type: "line",
              data: shownHistory.map(() => totalCost),
              smooth: false,
              symbol: "none",
              lineStyle: {
                color: isDark ? "#334155" : "#94a3b8",
                width: 1,
                type: "dashed"
              }
            }
          ] : []
        ]
      };
    });
    const underlyingOption = derived(() => () => {
      if (!history.length) return {};
      const withUnderlying = history.filter((p) => p.underlyingPrice != null);
      if (withUnderlying.length < 2) return {};
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const first = withUnderlying[0].underlyingPrice;
      return {
        backgroundColor: "transparent",
        grid: { top: 16, right: 16, bottom: 32, left: 60 },
        xAxis: {
          type: "category",
          data: withUnderlying.map((p) => p.date),
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
          textStyle: { fontSize: 11, color: isDark ? "#e2e8f0" : "#1c1c1c" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (p) => {
            const first2 = p[0];
            if (!first2) return "";
            return `${first2.axisValue}: ${first2.value >= 0 ? "+" : ""}${first2.value.toFixed(2)}%`;
          }
        },
        series: [
          {
            name: item()?.symbol ?? "",
            type: "line",
            data: withUnderlying.map((p) => +((p.underlyingPrice / first - 1) * 100).toFixed(2)),
            smooth: false,
            symbol: "none",
            connectNulls: true,
            lineStyle: { color: "#34d399", width: 1.5 }
          }
        ]
      };
    });
    $$renderer2.push(`<div class="page-root">`);
    if (!item()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="c-muted" style="padding:24px;text-align:center">Bonus niet gevonden</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="stats-grid card svelte-1lko5y8"><div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Totale waarde</div> <div class="stat-val svelte-1lko5y8">`);
      if (item().totalValue != null) {
        $$renderer2.push("<!--[0-->");
        PrivacyValue($$renderer2, { value: fmt(item().totalValue) });
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`—`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">P&amp;L</div> <div${attr_class(`stat-val ${stringify((item().pl ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1lko5y8")}>`);
      if (item().pl != null) {
        $$renderer2.push("<!--[0-->");
        PrivacyValue($$renderer2, { value: `${item().pl >= 0 ? "+" : ""}${fmt(item().pl)}` });
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`—`);
      }
      $$renderer2.push(`<!--]--></div> `);
      if (item().plPct != null) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div${attr_class(`stat-sub ${stringify(item().plPct >= 0 ? "c-pos" : "c-neg")}`, "svelte-1lko5y8")}>${escape_html(fmtPct(item().plPct))}</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> <div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Kostprijs</div> <div class="stat-val svelte-1lko5y8">`);
      if (item().totalCost != null) {
        $$renderer2.push("<!--[0-->");
        PrivacyValue($$renderer2, { value: fmt(item().totalCost) });
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`—`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Huidig / toekenning</div> <div class="stat-val mono svelte-1lko5y8">${escape_html((item().currentPrice ?? item().grantPrice).toFixed(2))} / ${escape_html(item().grantPrice.toFixed(2))}</div></div> <div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Aantal</div> <div class="stat-val svelte-1lko5y8">`);
      PrivacyValue($$renderer2, { value: String(item().quantity) });
      $$renderer2.push(`<!----></div></div> `);
      if (item().expiryDate) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Vervaldatum</div> <div class="stat-val mono svelte-1lko5y8">${escape_html(item().expiryDate)}</div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (item().strikePrice) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Strike</div> <div class="stat-val mono svelte-1lko5y8">${escape_html(item().strikePrice)}</div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (item().intrinsicValue != null) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Intrinsieke waarde</div> <div class="stat-val mono svelte-1lko5y8">${escape_html(item().intrinsicValue.toFixed(4))}</div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (item().timeValue != null) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Tijdswaarde</div> <div class="stat-val mono svelte-1lko5y8">${escape_html(item().timeValue.toFixed(4))}</div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (item().type === "call_option" && (item().delta != null || item().gamma != null)) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="stats-grid card svelte-1lko5y8" style="margin-top:12px">`);
        if (item().delta != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Delta</div><div class="stat-val mono svelte-1lko5y8">${escape_html(fmtNum(item().delta, 4))}</div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item().gamma != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Gamma</div><div class="stat-val mono svelte-1lko5y8">${escape_html(fmtNum(item().gamma, 4))}</div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item().theta != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Theta</div><div class="stat-val mono svelte-1lko5y8">${escape_html(fmtNum(item().theta, 4))}</div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item().vega != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Vega</div><div class="stat-val mono svelte-1lko5y8">${escape_html(fmtNum(item().vega, 4))}</div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item().impliedVol != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">Impl. vol.</div><div class="stat-val mono svelte-1lko5y8">${escape_html(fmtPct(item().impliedVol))}</div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (item().type === "warrant" && (item().vaa != null || item().atn != null)) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="tax-card card svelte-1lko5y8" style="margin-top:12px"><div class="card-title" style="margin-bottom:10px">Belgische belasting</div> <div class="stats-grid svelte-1lko5y8" style="padding:0">`);
        if (item().vaa != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">VAA (belastbare basis)</div><div class="stat-val svelte-1lko5y8">`);
          PrivacyValue($$renderer2, { value: fmt(item().vaa) });
          $$renderer2.push(`<!----></div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item().atn != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="stat svelte-1lko5y8"><div class="stat-label svelte-1lko5y8">ATN (voordeel)</div><div class="stat-val svelte-1lko5y8">`);
          PrivacyValue($$renderer2, { value: fmt(item().atn) });
          $$renderer2.push(`<!----></div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div class="card chart-card" style="margin-top:12px"><div class="chart-header svelte-1lko5y8"><span class="card-title">Waardeverloop</span> `);
      if (history.length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<label class="toggle-label svelte-1lko5y8"><input type="checkbox"${attr("checked", showPrior, true)}/> Toon vorige jaren</label>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (history.length > 1) {
        $$renderer2.push("<!--[1-->");
        Chart($$renderer2, { option: plChartOption()(), height: "260px" });
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="chart-placeholder svelte-1lko5y8">Geen historische data</div>`);
      }
      $$renderer2.push(`<!--]--></div> `);
      if (history.some((p) => p.underlyingPrice != null)) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="card chart-card" style="margin-top:12px"><div class="chart-header svelte-1lko5y8"><span class="card-title">Onderliggende (${escape_html(item().symbol)})</span></div> `);
        Chart($$renderer2, { option: underlyingOption()(), height: "200px" });
        $$renderer2.push(`<!----></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
