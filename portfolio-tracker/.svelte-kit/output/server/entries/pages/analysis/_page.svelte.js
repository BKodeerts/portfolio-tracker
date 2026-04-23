import { e as escape_html, c as attr_class, h as stringify, b as ensure_array_like, i as attr_style, d as derived } from "../../../chunks/renderer.js";
import { p as portfolioStore } from "../../../chunks/portfolio.svelte.js";
import { t as themeStore } from "../../../chunks/theme.svelte.js";
import { a as fmtPct, b as fmtNum, f as fmt } from "../../../chunks/fmt.js";
import { g as getColor } from "../../../chunks/color.js";
import { C as Chart } from "../../../chunks/Chart.js";
import { P as PrivacyValue } from "../../../chunks/PrivacyValue.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const SECTOR_COLORS = [
      "var(--accent)",
      "#8b5cf6",
      "#14b8a6",
      "#f59e0b",
      "#ec4899",
      "#10b981",
      "#f97316",
      "#06b6d4",
      "#e11d48",
      "#84cc16"
    ];
    const GEO_COLORS = [
      "var(--accent)",
      "#8b5cf6",
      "#14b8a6",
      "#f59e0b",
      "#ec4899",
      "#10b981",
      "#f97316"
    ];
    const CCY_COLORS = [
      "var(--accent)",
      "#8b5cf6",
      "#14b8a6",
      "#f59e0b",
      "#ec4899",
      "#10b981",
      "#f97316"
    ];
    function chartColors() {
      const isDark = themeStore.isDark;
      return {
        text: isDark ? "#8b929c" : "#6a6f78",
        grid: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
        tooltipBg: isDark ? "#15181c" : "#ffffff",
        tooltipBord: isDark ? "rgba(255,255,255,0.12)" : "rgba(16,18,22,0.12)",
        tooltipText: isDark ? "#f2f4f7" : "#101216",
        posBar: isDark ? "#34d399" : "#047857",
        negBar: isDark ? "#f87171" : "#b91c1c"
      };
    }
    const startYear = derived(() => () => {
      const d = portfolioStore.chartData[0];
      return d ? new Date(d.date).getFullYear() : null;
    });
    const totalValue = derived(() => portfolioStore.positions.reduce((s, p) => s + p.value, 0));
    const twr = derived(() => () => {
      const cost = portfolioStore.totalInvested;
      if (cost <= 0) return null;
      return (totalValue() - cost) / cost * 100;
    });
    const rm = derived(() => portfolioStore.riskMetrics);
    const PERIOD_ORDER = [
      ["1w", "1W"],
      ["1m", "1M"],
      ["3m", "3M"],
      ["ytd", "YTD"],
      ["1y", "1Y"],
      ["inception", "Max"]
    ];
    const orderedRolling = derived(() => () => {
      const rr = portfolioStore.rollingReturns;
      if (!rr) return [];
      return PERIOD_ORDER.map(([key, label]) => {
        const r = rr[key];
        return r && r.portfolio != null ? { period: label, portfolio: r.portfolio, vwce: r.vwce } : null;
      }).filter((r) => r != null);
    });
    const rollingChartOption = derived(() => () => {
      const rows = orderedRolling()();
      if (!rows.length) return {};
      const { text, grid, posBar, negBar } = chartColors();
      const values = rows.map((r) => +(r.portfolio ?? 0));
      return {
        backgroundColor: "transparent",
        grid: {
          top: 36,
          right: 12,
          bottom: 24,
          left: 44,
          containLabel: false
        },
        xAxis: {
          type: "category",
          data: rows.map((r) => r.period),
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: text, fontSize: 10 }
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: grid } },
          axisLabel: {
            color: text,
            fontSize: 10,
            formatter: (v) => `${v.toFixed(0)}%`
          }
        },
        tooltip: { show: false },
        series: [
          {
            type: "bar",
            barMaxWidth: 36,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: values.map((v) => ({
              value: v,
              itemStyle: {
                color: v >= 0 ? posBar : negBar,
                borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3]
              },
              label: {
                show: true,
                position: v >= 0 ? "top" : "bottom",
                color: v >= 0 ? posBar : negBar,
                fontSize: 9,
                fontWeight: 600,
                formatter: () => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
              }
            }))
          }
        ]
      };
    });
    const riskBars = derived(() => () => {
      if (!rm()) return [];
      const isDark = themeStore.isDark;
      const pos = isDark ? "#34d399" : "#047857";
      const neg = isDark ? "#f87171" : "#b91c1c";
      const neu = isDark ? "#8b929c" : "#6a6f78";
      const acc = isDark ? "#818cf8" : "#6366f1";
      const bars = [];
      if (rm().volatility != null) bars.push({
        label: "Volatiliteit (1J)",
        display: fmtPct(rm().volatility),
        barPct: Math.min(100, Math.abs(rm().volatility) / 130 * 100),
        color: neg
      });
      if (rm().beta != null) bars.push({
        label: "Beta",
        display: fmtNum(rm().beta),
        barPct: Math.min(100, Math.abs(rm().beta) / 2 * 100),
        color: acc
      });
      if (rm().sharpe != null) bars.push({
        label: "Sharpe",
        display: fmtNum(rm().sharpe),
        barPct: Math.min(100, Math.max(0, rm().sharpe) / 3 * 100),
        color: rm().sharpe >= 1 ? pos : neu
      });
      if (portfolioStore.irrPct != null) bars.push({
        label: "Annual return",
        display: fmtPct(portfolioStore.irrPct),
        barPct: Math.min(100, Math.abs(portfolioStore.irrPct) / 100 * 100),
        color: portfolioStore.irrPct >= 0 ? pos : neg
      });
      return bars;
    });
    const riskNarrative = derived(() => () => {
      if (!rm()) return "";
      const parts = [];
      if (rm().sharpe != null) parts.push(rm().sharpe > 1 ? "Hoog rendement" : rm().sharpe < 0.5 ? "Laag rendement" : "Gemiddeld rendement");
      if (rm().volatility != null) parts.push(rm().volatility > 30 ? "hoge volatiliteit" : rm().volatility < 10 ? "lage volatiliteit" : "gemiddelde volatiliteit");
      const top3 = [...portfolioStore.positions].sort((a, b) => b.value - a.value).slice(0, 3);
      const top3val = top3.reduce((s, p) => s + p.value, 0);
      const conc = totalValue() > 0 ? Math.round(top3val / totalValue() * 100) : 0;
      if (conc > 50 && top3.length >= 3) parts.push(`Concentratierisico: ${conc}% van portefeuille in ${top3.length} namen`);
      if (!parts.length) return "";
      return parts.join(", ") + ".";
    });
    const latest = derived(() => portfolioStore.chartData[portfolioStore.chartData.length - 1]);
    function toAllocItems(map, colors) {
      const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
      return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, val], i) => ({
        name,
        pct: val / total * 100,
        color: colors[i % colors.length]
      }));
    }
    const sectorItems = derived(() => () => {
      if (!latest()) return [];
      const map = {};
      for (const t of portfolioStore.currentTickers) {
        const s = portfolioStore.tickerMeta[t]?.["sector"] ?? "Overig";
        map[s] = (map[s] ?? 0) + (latest()[t] ?? 0);
      }
      return toAllocItems(map, SECTOR_COLORS);
    });
    const geoItems = derived(() => () => {
      if (!latest()) return [];
      const map = {};
      for (const t of portfolioStore.currentTickers) {
        const g = portfolioStore.tickerMeta[t]?.["geo"] ?? "Overig";
        map[g] = (map[g] ?? 0) + (latest()[t] ?? 0);
      }
      return toAllocItems(map, GEO_COLORS);
    });
    const currencyItems = derived(() => () => {
      const exp = portfolioStore.currencyExposure ?? {};
      if (!Object.keys(exp).length) {
        const usd = portfolioStore.usdExposurePct ?? 0;
        return [
          { name: "USD", pct: usd, color: CCY_COLORS[0] },
          { name: "EUR", pct: 100 - usd, color: CCY_COLORS[1] }
        ];
      }
      return toAllocItems(exp, CCY_COLORS);
    });
    const contributionItems = derived(() => () => {
      const positions = portfolioStore.positions;
      if (!positions.length) return [];
      const maxAbs = Math.max(...positions.map((p) => Math.abs(p.pl)), 1);
      return [...positions].sort((a, b) => b.pl - a.pl).map((p) => ({
        ticker: p.ticker,
        pl: p.pl,
        plPct: p.plPct,
        barPct: Math.abs(p.pl) / maxAbs * 78
      }));
    });
    function fmtContrib(pl) {
      const abs = Math.abs(Math.round(pl));
      return `${pl >= 0 ? "+" : "-"}€ ${abs.toLocaleString("nl-BE")}`;
    }
    $$renderer2.push(`<div class="page-root"><div style="margin-bottom:20px"><div class="h-eyebrow" style="margin-bottom:4px">Analyse</div> <div class="h-xl">Prestaties &amp; risico</div></div> `);
    if (portfolioStore.loaded && portfolioStore.positions.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="kpi-grid svelte-8pceb3"><div class="card kpi-card svelte-8pceb3"><div class="h-eyebrow">TWR${escape_html(startYear()() ? ` SINDS ${startYear()()}` : "")}</div> <div${attr_class(`kpi-val mono ${stringify((twr()() ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>`);
      PrivacyValue($$renderer2, {
        value: twr()() != null ? `${twr()() >= 0 ? "+" : ""}${twr()().toFixed(1)}%` : "—"
      });
      $$renderer2.push(`<!----></div> <div class="h-sm">Tijd-gewogen</div></div> <div class="card kpi-card svelte-8pceb3"><div class="h-eyebrow">IRR (GELD-GEWOGEN)</div> <div${attr_class(`kpi-val mono ${stringify((portfolioStore.irrPct ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>`);
      PrivacyValue($$renderer2, {
        value: portfolioStore.irrPct != null ? fmtPct(portfolioStore.irrPct) : "—"
      });
      $$renderer2.push(`<!----></div> <div class="h-sm">Jaarlijks</div></div> `);
      if (rm()) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="card kpi-card svelte-8pceb3"><div class="h-eyebrow">SHARPE</div> <div class="kpi-val mono svelte-8pceb3">${escape_html(rm().sharpe != null ? fmtNum(rm().sharpe) : "—")}</div> <div class="h-sm">Rendement / risico</div></div> <div class="card kpi-card svelte-8pceb3"><div class="h-eyebrow">MAX DRAWDOWN</div> <div class="kpi-val mono c-neg svelte-8pceb3">`);
        PrivacyValue($$renderer2, {
          value: rm().maxDrawdown != null ? fmtPct(rm().maxDrawdown) : "—"
        });
        $$renderer2.push(`<!----></div> <div class="h-sm">Worst stretch</div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> <div class="analysis-split svelte-8pceb3"><div class="card"><div class="split-card-head svelte-8pceb3"><div class="h-md">Rolling returns</div> <div class="h-sm" style="margin-top:1px">Portefeuille per periode</div></div> `);
      if (orderedRolling()().length > 0) {
        $$renderer2.push("<!--[0-->");
        Chart($$renderer2, { option: rollingChartOption()(), height: "220px" });
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="empty-msg svelte-8pceb3">Geen rolling returns beschikbaar</div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="card risk-card svelte-8pceb3"><div class="split-card-head svelte-8pceb3"><div class="h-md">Risico-profiel</div></div> `);
      if (riskBars()().length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="risk-bars svelte-8pceb3"><!--[-->`);
        const each_array = ensure_array_like(riskBars()());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let bar = each_array[$$index];
          $$renderer2.push(`<div class="risk-row svelte-8pceb3"><div class="risk-label svelte-8pceb3">${escape_html(bar.label)}</div> <div class="risk-track svelte-8pceb3"><div class="risk-fill svelte-8pceb3"${attr_style(`width:${stringify(bar.barPct)}%;background:${stringify(bar.color)}`)}></div></div> <div class="risk-val mono svelte-8pceb3"${attr_style(`color:${stringify(bar.color)}`)}>${escape_html(bar.display)}</div></div>`);
        }
        $$renderer2.push(`<!--]--></div> `);
        if (rm()) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="risk-extra svelte-8pceb3"><div class="risk-extra-row svelte-8pceb3"><span class="h-sm">Sortino</span> <span class="mono svelte-8pceb3" style="font-size:12px;font-weight:600">${escape_html(rm().sortino != null ? fmtNum(rm().sortino) : "—")}</span></div> <div class="risk-extra-row svelte-8pceb3"><span class="h-sm">Calmar</span> <span class="mono svelte-8pceb3" style="font-size:12px;font-weight:600">${escape_html(rm().calmar != null ? fmtNum(rm().calmar) : "—")}</span></div> <div class="risk-extra-row svelte-8pceb3"><span class="h-sm">Gerealiseerd</span> <span${attr_class(`mono ${stringify(portfolioStore.realizedPl >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")} style="font-size:12px;font-weight:600">`);
          PrivacyValue($$renderer2, {
            value: `${portfolioStore.realizedPl >= 0 ? "+" : ""}${fmt(portfolioStore.realizedPl)}`
          });
          $$renderer2.push(`<!----></span></div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (riskNarrative()()) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="risk-narrative svelte-8pceb3">${escape_html(riskNarrative()())}</div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="empty-msg svelte-8pceb3">Onvoldoende data</div>`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="alloc-grid svelte-8pceb3"><!--[-->`);
      const each_array_1 = ensure_array_like([
        { title: "Sector", items: sectorItems()() },
        { title: "Regio", items: geoItems()() },
        { title: "Munt", items: currencyItems()() }
      ]);
      for (let $$index_3 = 0, $$length = each_array_1.length; $$index_3 < $$length; $$index_3++) {
        let panel = each_array_1[$$index_3];
        $$renderer2.push(`<div class="card alloc-card svelte-8pceb3"><div class="h-md" style="margin-bottom:10px">${escape_html(panel.title)}</div> <div class="alloc-stack svelte-8pceb3"><!--[-->`);
        const each_array_2 = ensure_array_like(panel.items);
        for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
          let item = each_array_2[$$index_1];
          $$renderer2.push(`<div class="alloc-seg svelte-8pceb3"${attr_style(`width:${stringify(item.pct)}%;background:${stringify(item.color)}`)}></div>`);
        }
        $$renderer2.push(`<!--]--></div> <div class="alloc-list svelte-8pceb3"><!--[-->`);
        const each_array_3 = ensure_array_like(panel.items);
        for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
          let item = each_array_3[$$index_2];
          $$renderer2.push(`<div class="alloc-row svelte-8pceb3"><span class="dot"${attr_style(`background:${stringify(item.color)}`)}></span> <span class="alloc-name svelte-8pceb3">${escape_html(item.name)}</span> <span class="alloc-pct mono svelte-8pceb3">${escape_html(item.pct.toFixed(1))}%</span></div>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      }
      $$renderer2.push(`<!--]--></div> `);
      if (contributionItems()().length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="card contrib-card svelte-8pceb3"><div style="padding:14px 18px 12px;border-bottom:1px solid var(--border)"><div class="h-md">Bijdrage aan rendement</div> <div class="h-sm" style="margin-top:2px">Welke posities dreven de performance</div></div> <!--[-->`);
        const each_array_4 = ensure_array_like(contributionItems()());
        for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
          let item = each_array_4[$$index_4];
          $$renderer2.push(`<div class="contrib-row svelte-8pceb3"><span class="dot"${attr_style(`background:${stringify(getColor(item.ticker))}`)}></span> <span class="contrib-ticker svelte-8pceb3">${escape_html(item.ticker)}</span> <div class="contrib-track svelte-8pceb3"><div${attr_class(`contrib-fill ${stringify(item.pl >= 0 ? "pos" : "neg")}`, "svelte-8pceb3")}${attr_style(`width:${stringify(item.barPct)}%`)}></div> <span${attr_class(`contrib-amount mono ${stringify(item.pl >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>`);
          PrivacyValue($$renderer2, { value: fmtContrib(item.pl) });
          $$renderer2.push(`<!----></span></div> <span${attr_class(`contrib-pct mono ${stringify(item.plPct >= 0 ? "c-pos" : "c-neg")}`, "svelte-8pceb3")}>${escape_html(fmtPct(item.plPct))}</span></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else if (portfolioStore.loaded) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="empty-msg svelte-8pceb3" style="padding:32px 0">Voeg transacties toe om de analyse te zien.</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
