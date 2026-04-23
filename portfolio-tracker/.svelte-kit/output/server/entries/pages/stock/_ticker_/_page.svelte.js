import { i as attr_style, h as stringify, e as escape_html, c as attr_class, b as ensure_array_like, d as derived, s as store_get, u as unsubscribe_stores } from "../../../../chunks/renderer.js";
import { p as page } from "../../../../chunks/stores.js";
import { p as portfolioStore } from "../../../../chunks/portfolio.svelte.js";
import { i as intradayStore } from "../../../../chunks/intraday.svelte.js";
import { t as themeStore } from "../../../../chunks/theme.svelte.js";
import { f as fmt } from "../../../../chunks/fmt.js";
import { g as getColor } from "../../../../chunks/color.js";
import { n as normalizeMarketState, i as isExchangeOpen } from "../../../../chunks/exchange.js";
import { C as Chart } from "../../../../chunks/Chart.js";
import { P as PrivacyValue } from "../../../../chunks/PrivacyValue.js";
function periodCutoff(period) {
  const now = /* @__PURE__ */ new Date();
  const d = new Date(now);
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const PERIODS = [
      { key: "1m", label: "1M" },
      { key: "3m", label: "3M" },
      { key: "6m", label: "6M" },
      { key: "ytd", label: "YTD" },
      { key: "1y", label: "1J" },
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
    const nativeCcy = derived(() => meta()["currency"] ?? "EUR");
    const ccySym = derived(() => nativeCcy() === "EUR" ? "€" : nativeCcy() === "GBP" ? "£" : nativeCcy() === "USD" ? "$" : nativeCcy());
    const iData = derived(() => intradayStore.data[yahoo()]);
    const pts = derived(() => iData()?.points ?? []);
    const allPts = derived(() => iData()?.allPoints ?? pts());
    const prevClose = derived(() => iData()?.previousClose ?? null);
    const lastAllPt = derived(() => allPts()[allPts().length - 1] ?? null);
    const currentPrice = derived(() => lastAllPt()?.close ?? prevClose() ?? null);
    const lastRegularClose = derived(() => pts()[pts().length - 1]?.close ?? null);
    const rawMarketState = derived(() => iData()?.marketState ?? (isExchangeOpen(yahoo()) ? "REGULAR" : "CLOSED"));
    const marketState = derived(() => normalizeMarketState(yahoo(), rawMarketState()));
    const regularChangePct = derived(() => lastRegularClose() != null && prevClose() && prevClose() !== 0 ? (lastRegularClose() - prevClose()) / prevClose() * 100 : null);
    const extChangePct = derived(() => currentPrice() != null && lastRegularClose() && lastRegularClose() !== 0 && marketState() !== "REGULAR" ? (currentPrice() - lastRegularClose()) / lastRegularClose() * 100 : null);
    const dayChangePct = derived(() => currentPrice() != null && prevClose() && prevClose() !== 0 ? (currentPrice() - prevClose()) / prevClose() * 100 : null);
    const priceEur = derived(() => shares() > 0 && currentPrice() != null && currentPrice() > 0 ? val() / shares() : null);
    const impliedFx = derived(() => priceEur() && priceEur() > 0 && currentPrice() != null ? currentPrice() / priceEur() : null);
    const avgCostNative = derived(() => pos()?.avgCost != null && impliedFx() != null ? pos().avgCost * impliedFx() : null);
    let period = "3m";
    let candles = [];
    const chartOption = derived(() => () => {
      const isDark = themeStore.isDark;
      const textColor = isDark ? "#94a3b8" : "#64748b";
      const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      const tooltipBg = isDark ? "#1e293b" : "#ffffff";
      const tooltipBord = isDark ? "#334155" : "#e2e8f0";
      const cutoff = periodCutoff();
      const visible = cutoff ? candles.filter((c) => c.date >= cutoff) : candles;
      if (!visible.length) return {};
      return {
        backgroundColor: "transparent",
        grid: { top: 16, right: 16, bottom: 32, left: 64 },
        xAxis: {
          type: "category",
          data: visible.map((c) => c.date),
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
            formatter: (v) => `${ccySym()}${v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : v.toFixed(2)}`
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
            const p = params[0];
            if (!p) return "";
            return `${p.axisValue}<br>${ccySym()}${p.value.toFixed(2)}`;
          }
        },
        series: [
          {
            name: ticker(),
            type: "line",
            data: visible.map((c) => c.close),
            smooth: false,
            symbol: "none",
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
          }
        ]
      };
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
    $$renderer2.push(`<div class="page-root"><div class="mobile-topbar svelte-1fn2yme"><a href="/" class="mobile-circle-btn svelte-1fn2yme" aria-label="Terug"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg></a> <div class="mobile-topbar-title svelte-1fn2yme"><span class="mobile-avatar svelte-1fn2yme"${attr_style(`background:${stringify(color())}`)}>${escape_html(ticker().slice(0, 2))}</span> <span class="mobile-topbar-ticker svelte-1fn2yme">${escape_html(ticker())}</span></div> <button class="mobile-circle-btn svelte-1fn2yme" aria-label="Meer opties"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg></button></div> <div class="sd-desktop-header svelte-1fn2yme"><div class="sd-identity svelte-1fn2yme"><span class="color-dot svelte-1fn2yme"${attr_style(`background:${stringify(color())}`)}></span> <span class="sd-ticker svelte-1fn2yme">${escape_html(ticker())}</span> `);
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
    if (extChangePct() != null && regularChangePct() != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="sd-change-group svelte-1fn2yme"><span class="sd-change-lbl svelte-1fn2yme">Markt</span> <span${attr_class(`sd-change ${stringify(regularChangePct() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(regularChangePct() >= 0 ? "+" : "")}${escape_html(regularChangePct().toFixed(2))}%</span> <span class="sd-change-sep svelte-1fn2yme">·</span> <span class="sd-change-lbl svelte-1fn2yme">${escape_html(marketState() === "PRE" ? "Pre" : "Post")}</span> <span${attr_class(`sd-change ${stringify(extChangePct() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(extChangePct() >= 0 ? "+" : "")}${escape_html(extChangePct().toFixed(2))}%</span></span>`);
    } else if (dayChangePct() != null) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<span${attr_class(`sd-change ${stringify(dayChangePct() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(dayChangePct() >= 0 ? "+" : "")}${escape_html(dayChangePct().toFixed(2))}%</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <span${attr_class(`badge ${stringify(msBadgeClass(marketState()))}`, "svelte-1fn2yme")}>${escape_html(msBadgeLabel(marketState()))}</span></div></div> <div class="sd-hero svelte-1fn2yme">`);
    if (meta()["label"]) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="h-eyebrow" style="margin-bottom:6px">${escape_html(meta()["label"].toUpperCase())}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="sd-hero-value svelte-1fn2yme">`);
    PrivacyValue($$renderer2, { value: fmt(val()) });
    $$renderer2.push(`<!----></div> <div class="sd-hero-pl svelte-1fn2yme">`);
    if (pl() !== 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span${attr_class(`sd-pl-pill ${stringify(pl() >= 0 ? "pos" : "neg")}`, "svelte-1fn2yme")}>${escape_html(pl() >= 0 ? "▲" : "▼")} ${escape_html(Math.abs(plPct()).toFixed(2))}%</span> <span${attr_class(`sd-pl-total ${stringify(pl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(pl() >= 0 ? "+" : "")}`);
      PrivacyValue($$renderer2, { value: fmt(pl()) });
      $$renderer2.push(`<!----> totaal</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div> <div class="sd-chart-wrap svelte-1fn2yme">`);
    if (candles.length > 1) {
      $$renderer2.push("<!--[1-->");
      Chart($$renderer2, { option: chartOption()(), height: "240px" });
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="chart-placeholder svelte-1fn2yme">Geen data voor deze periode</div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="sd-periods card svelte-1fn2yme"><!--[-->`);
    const each_array = ensure_array_like(PERIODS);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let p = each_array[$$index];
      $$renderer2.push(`<button${attr_class("sd-period-btn svelte-1fn2yme", void 0, { "on": period === p.key })}>${escape_html(p.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="sd-stats svelte-1fn2yme"><div class="sd-stat card svelte-1fn2yme"><div class="sd-stat-label svelte-1fn2yme">Aantal</div> <div class="sd-stat-val mono svelte-1fn2yme">`);
    PrivacyValue($$renderer2, { value: String(shares()) });
    $$renderer2.push(`<!----></div> `);
    if (currentPrice() != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="sd-stat-sub svelte-1fn2yme">${escape_html(nativeCcy())} ${escape_html(currentPrice().toFixed(2))}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="sd-stat card svelte-1fn2yme"><div class="sd-stat-label svelte-1fn2yme">Gem. kost</div> `);
    if (avgCostNative() != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="sd-stat-val mono svelte-1fn2yme">${escape_html(nativeCcy())} ${escape_html(avgCostNative().toFixed(2))}</div>`);
    } else if (pos()?.avgCost) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="sd-stat-val mono svelte-1fn2yme">€ ${escape_html(pos().avgCost.toFixed(2))}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="sd-stat-sub svelte-1fn2yme">`);
    PrivacyValue($$renderer2, { value: fmt(cost()) });
    $$renderer2.push(`<!----></div></div> <div class="sd-stat card svelte-1fn2yme"><div class="sd-stat-label svelte-1fn2yme">Vandaag</div> `);
    if (pos()?.dayPl != null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div${attr_class(`sd-stat-val ${stringify(pos().dayPl >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>`);
      PrivacyValue($$renderer2, {
        value: `€ ${stringify(pos().dayPl >= 0 ? "+" : "")}${stringify(pos().dayPl.toFixed(0))}`
      });
      $$renderer2.push(`<!----></div> <div${attr_class(`sd-stat-sub ${stringify(pos().dayPl >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html((pos().dayPlPct ?? 0) >= 0 ? "+" : "")}${escape_html((pos().dayPlPct ?? 0).toFixed(2))}%</div>`);
    } else if (dayChangePct() != null) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div${attr_class(`sd-stat-val ${stringify(dayChangePct() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(dayChangePct() >= 0 ? "+" : "")}${escape_html(dayChangePct().toFixed(2))}%</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="sd-stat-val c-muted svelte-1fn2yme">—</div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="sd-stat card svelte-1fn2yme"><div class="sd-stat-label svelte-1fn2yme">P&amp;L %</div> <div${attr_class(`sd-stat-val ${stringify(pl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>${escape_html(pl() >= 0 ? "+" : "")}${escape_html(plPct().toFixed(1))}%</div> <div${attr_class(`sd-stat-sub ${stringify(pl() >= 0 ? "c-pos" : "c-neg")}`, "svelte-1fn2yme")}>`);
    PrivacyValue($$renderer2, {
      value: `${stringify(pl() >= 0 ? "+" : "")}${stringify(fmt(pl()))}`
    });
    $$renderer2.push(`<!----></div></div></div> `);
    if (txs().length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card sd-tx-card svelte-1fn2yme"><div class="sd-tx-title svelte-1fn2yme">Laatste transacties</div> <!--[-->`);
      const each_array_1 = ensure_array_like(txs());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let tx = each_array_1[$$index_1];
        const isDividend = tx.shares === 0;
        const isSale = !isDividend && tx.shares < 0;
        $$renderer2.push(`<div class="sd-tx-row svelte-1fn2yme"><div class="sd-tx-left svelte-1fn2yme"><div class="sd-tx-type svelte-1fn2yme">${escape_html(isDividend ? "Dividend" : isSale ? "Verkoop" : "Koop")}`);
        if (!isDividend) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`· ${escape_html(Math.abs(tx.shares).toLocaleString("nl-BE", { maximumFractionDigits: 4 }))} aandelen`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="sd-tx-date svelte-1fn2yme">${escape_html(tx.date)}</div></div> <div class="sd-tx-amount mono svelte-1fn2yme">`);
        PrivacyValue($$renderer2, { value: fmt(tx.costEur) });
        $$renderer2.push(`<!----></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
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
