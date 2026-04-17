import { i as attr_style, d as stringify, c as escape_html, b as attr_class, e as ensure_array_like, f as derived, s as store_get, u as unsubscribe_stores } from "../../../../chunks/renderer.js";
import { p as page } from "../../../../chunks/stores.js";
import { p as portfolioStore, g as getColor } from "../../../../chunks/portfolio.svelte.js";
import { n as normalizeMarketState, i as intradayStore, a as isExchangeOpen } from "../../../../chunks/exchange.js";
import { t as themeStore } from "../../../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct } from "../../../../chunks/fmt.js";
import { C as Chart } from "../../../../chunks/Chart.js";
import { P as PrivacyValue } from "../../../../chunks/PrivacyValue.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
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
    const ticker = derived(() => store_get($$store_subs ??= {}, "$page", page).params["ticker"] ?? "");
    const meta = derived(() => portfolioStore.tickerMeta[ticker()] ?? {});
    const yahoo = derived(() => meta()["yahoo"] ?? ticker());
    const color = derived(() => getColor(ticker()));
    const pos = derived(() => portfolioStore.positions.find((p) => p.ticker === ticker()));
    const latest = derived(() => portfolioStore.chartData[portfolioStore.chartData.length - 1]);
    const val = derived(() => latest()?.[ticker()] ?? 0);
    const cost = derived(() => latest()?.[`${ticker()}_cost`] ?? 0);
    const pl = derived(() => val() - cost());
    const plPct = derived(() => cost() > 0 ? pl() / cost() * 100 : 0);
    const shares = derived(() => latest()?.[`${ticker()}_shares`] ?? pos()?.shares ?? 0);
    const realPl = derived(() => portfolioStore.realizedPlPerTicker[ticker()] ?? 0);
    const divInc = derived(() => portfolioStore.dividendsPerTicker[ticker()] ?? 0);
    const nativeCcy = derived(() => meta()["currency"] ?? "EUR");
    const ccySym = derived(() => nativeCcy() === "EUR" ? "€" : nativeCcy() === "GBP" ? "£" : nativeCcy() === "USD" ? "$" : nativeCcy());
    const iData = derived(() => intradayStore.data[yahoo()]);
    const pts = derived(() => iData()?.points ?? []);
    const prevClose = derived(() => iData()?.previousClose ?? null);
    const lastPt = derived(() => pts()[pts().length - 1] ?? null);
    const currentPrice = derived(() => lastPt()?.close ?? prevClose() ?? null);
    const dayChangePct = derived(() => currentPrice() != null && prevClose() && prevClose() !== 0 ? (currentPrice() - prevClose()) / prevClose() * 100 : null);
    const rawMarketState = derived(() => iData()?.marketState ?? (isExchangeOpen(yahoo()) ? "REGULAR" : "CLOSED"));
    const marketState = derived(() => normalizeMarketState(yahoo(), rawMarketState()));
    let period = "1d";
    const chartOption = derived(() => () => {
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const tooltipBg = isDark ? "#1e293b" : "#ffffff";
      const tooltipBord = isDark ? "#334155" : "#e2e8f0";
      {
        if (!pts().length || !prevClose()) return {};
        const allPts = iData()?.allPoints ?? pts();
        const tradingPeriods = iData()?.tradingPeriods;
        const regularStart = tradingPeriods?.regular?.[0]?.start;
        const regularEnd = tradingPeriods?.regular?.[0]?.end;
        const labels = allPts.map((p) => new Date(p.ts * 1e3).toISOString());
        const regularData = allPts.map((p) => {
          if (regularStart && regularEnd && p.ts >= regularStart && p.ts <= regularEnd) {
            return (p.close - prevClose()) / prevClose() * 100;
          }
          return null;
        });
        const extData = allPts.map((p) => {
          const inRegular = regularStart && regularEnd && p.ts >= regularStart && p.ts <= regularEnd;
          return !inRegular ? (p.close - prevClose()) / prevClose() * 100 : null;
        });
        const zeroLine = allPts.map(() => 0);
        return {
          backgroundColor: "transparent",
          grid: { top: 16, right: 16, bottom: 32, left: 56 },
          xAxis: {
            type: "category",
            data: labels,
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: {
              color: textColor,
              fontSize: 9,
              formatter: (v) => new Date(v).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }),
              interval: Math.floor(allPts.length / 6)
            }
          },
          yAxis: {
            type: "value",
            splitLine: { lineStyle: { color: gridColor } },
            axisLabel: {
              color: textColor,
              fontSize: 10,
              formatter: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`
            }
          },
          tooltip: {
            trigger: "axis",
            backgroundColor: tooltipBg,
            borderColor: tooltipBord,
            borderWidth: 1,
            textStyle: { fontSize: 11, color: isDark ? "#e2e8f0" : "#1c1c1c" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (params) => {
              const time = new Date(params[0]?.axisValue ?? "").toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
              const pct = params.find((p) => p.value != null)?.value;
              if (pct == null) return time;
              const absChange = pct / 100 * (prevClose() ?? 0);
              return `${time}<br>${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%<br>${themeStore.privacyMode ? "●●●" : `${ccySym()}${absChange.toFixed(2)}`}`;
            }
          },
          series: [
            {
              name: "Regulier",
              type: "line",
              data: regularData,
              smooth: false,
              symbol: "none",
              connectNulls: false,
              lineStyle: { color: color(), width: 2 },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: color() + "33" },
                    { offset: 1, color: color() + "05" }
                  ]
                }
              }
            },
            {
              name: "Extended",
              type: "line",
              data: extData,
              smooth: false,
              symbol: "none",
              connectNulls: false,
              lineStyle: { color: color() + "88", width: 1.5, type: "dashed" }
            },
            {
              name: "__zero",
              type: "line",
              data: zeroLine,
              smooth: false,
              symbol: "none",
              lineStyle: {
                color: isDark ? "#334155" : "#94a3b8",
                width: 1,
                type: "dashed"
              },
              tooltip: { show: false }
            }
          ]
        };
      }
    });
    const txs = derived(() => portfolioStore.rawTransactions.filter((t) => t.ticker === ticker()).slice().sort((a, b) => b.date.localeCompare(a.date)));
    function msBadgeClass(s) {
      if (s === "REGULAR") return "badge-open";
      if (s === "PRE" || s === "POST") return "badge-ext";
      return "badge-closed";
    }
    function msBadgeLabel(s) {
      if (s === "REGULAR") return "Open";
      if (s === "PRE") return "Pre";
      if (s === "POST") return "Post";
      return "Gesloten";
    }
    $$renderer2.push(`<header class="detail-header svelte-1fn2yme"><a href="/" class="back-btn svelte-1fn2yme">← Portfolio</a> <div class="sd-identity svelte-1fn2yme"><span class="color-dot svelte-1fn2yme"${attr_style(`background:${stringify(color())}`)}></span> <span class="sd-ticker svelte-1fn2yme">${escape_html(ticker())}</span> `);
    if (meta()["label"]) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="sd-name svelte-1fn2yme">${escape_html(meta()["label"])}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="sd-price-row svelte-1fn2yme">`);
    if (currentPrice() != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="sd-price svelte-1fn2yme">`);
      PrivacyValue($$renderer2, {
        value: `${stringify(ccySym())}${stringify(currentPrice().toFixed(2))}`
      });
      $$renderer2.push(`<!----></span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (dayChangePct() != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span${attr_class(`sd-change ${stringify(dayChangePct() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(dayChangePct() >= 0 ? "+" : "")}${escape_html(dayChangePct().toFixed(2))}%</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <span${attr_class(`badge ${stringify(msBadgeClass(marketState()))}`, "svelte-1fn2yme")}>${escape_html(msBadgeLabel(marketState()))}</span></div></header> <div class="page-root"><div class="stats-grid card svelte-1fn2yme"><div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">Waarde</div> <div class="stat-val svelte-1fn2yme">`);
    PrivacyValue($$renderer2, { value: fmt(val()) });
    $$renderer2.push(`<!----></div></div> <div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">P&amp;L</div> <div${attr_class(`stat-val ${stringify(pl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>`);
    PrivacyValue($$renderer2, {
      value: `${stringify(pl() >= 0 ? "+" : "")}${stringify(fmt(pl()))}`
    });
    $$renderer2.push(`<!----></div> <div${attr_class(`stat-sub ${stringify(pl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(fmtPct(plPct()))}</div></div> <div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">Ingelegd</div> <div class="stat-val svelte-1fn2yme">`);
    PrivacyValue($$renderer2, { value: fmt(cost()) });
    $$renderer2.push(`<!----></div></div> <div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">Aandelen</div> <div class="stat-val mono svelte-1fn2yme">`);
    PrivacyValue($$renderer2, { value: String(shares()) });
    $$renderer2.push(`<!----></div></div> `);
    if (pos()?.avgCost) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">Gem. kostprijs</div> <div class="stat-val mono svelte-1fn2yme">${escape_html(ccySym())}${escape_html(pos().avgCost.toFixed(2))}</div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (realPl() !== 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">Gerealiseerd</div> <div${attr_class(`stat-val ${stringify(realPl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>`);
      PrivacyValue($$renderer2, {
        value: `${stringify(realPl() >= 0 ? "+" : "")}${stringify(fmt(realPl()))}`
      });
      $$renderer2.push(`<!----></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (divInc() > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">Dividenden</div> <div class="stat-val c-pos svelte-1fn2yme">`);
      PrivacyValue($$renderer2, { value: `+${stringify(fmt(divInc()))}` });
      $$renderer2.push(`<!----></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (meta()["high52"] != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">52W Hoog</div> <div class="stat-val mono svelte-1fn2yme">${escape_html(ccySym())}${escape_html(meta()["high52"].toFixed(2))}</div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (meta()["low52"] != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">52W Laag</div> <div class="stat-val mono svelte-1fn2yme">${escape_html(ccySym())}${escape_html(meta()["low52"].toFixed(2))}</div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (meta()["pe"] != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="stat svelte-1fn2yme"><div class="stat-label svelte-1fn2yme">P/E</div> <div class="stat-val mono svelte-1fn2yme">${escape_html(meta()["pe"].toFixed(1))}</div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="card chart-card" style="margin-top:12px"><div class="chart-header svelte-1fn2yme"><div class="period-pills"><!--[-->`);
    const each_array = ensure_array_like(PERIODS);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let p = each_array[$$index];
      $$renderer2.push(`<button${attr_class("pill", void 0, { "on": period === p.key })}>${escape_html(p.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    if (pts().length > 1) {
      $$renderer2.push("<!--[1-->");
      Chart($$renderer2, { option: chartOption()(), height: "280px" });
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="chart-placeholder svelte-1fn2yme">Geen data voor deze periode</div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (txs().length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card" style="margin-top:12px;overflow-x:auto"><div class="card-title" style="padding:10px 14px;border-bottom:1px solid var(--border)">Transacties</div> <table class="tx-table svelte-1fn2yme"><thead><tr><th class="svelte-1fn2yme">Datum</th><th class="svelte-1fn2yme">Type</th><th class="right svelte-1fn2yme">Aandelen</th><th class="right svelte-1fn2yme">Kosten €</th><th class="right desktop-only svelte-1fn2yme">Prijs</th></tr></thead><tbody class="svelte-1fn2yme"><!--[-->`);
      const each_array_1 = ensure_array_like(txs());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let tx = each_array_1[$$index_1];
        const isDividend = tx.shares === 0;
        const isSale = !isDividend && tx.shares < 0;
        const price = !isDividend && tx.shares !== 0 ? Math.abs(tx.costEur / tx.shares) : null;
        $$renderer2.push(`<tr class="svelte-1fn2yme"><td class="mono svelte-1fn2yme">${escape_html(tx.date)}</td><td${attr_class(isDividend ? "c-div" : isSale ? "c-neg" : "c-pos", "svelte-1fn2yme")}>${escape_html(isDividend ? "Dividend" : isSale ? "Verkoop" : "Koop")}</td><td class="right mono svelte-1fn2yme">${escape_html(isDividend ? "—" : Math.abs(tx.shares).toLocaleString("nl-BE", { maximumFractionDigits: 4 }))}</td><td class="right mono svelte-1fn2yme">`);
        PrivacyValue($$renderer2, { value: fmt(Math.abs(tx.costEur)) });
        $$renderer2.push(`<!----></td><td class="right mono desktop-only svelte-1fn2yme">${escape_html(price != null ? `${ccySym()}${price.toFixed(2)}` : "—")}</td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
