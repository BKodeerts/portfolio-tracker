import { e as ensure_array_like, a as attr, b as attr_class, c as escape_html, s as store_get, u as unsubscribe_stores, d as stringify, f as derived } from "../../chunks/renderer.js";
import { p as page } from "../../chunks/stores.js";
import { p as portfolioStore } from "../../chunks/portfolio.svelte.js";
import { t as themeStore } from "../../chunks/theme.svelte.js";
import { f as fmt, a as fmtPct } from "../../chunks/fmt.js";
import { P as PrivacyValue } from "../../chunks/PrivacyValue.js";
function Nav($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const tabs = [
      { path: "/", label: "Portfolio" },
      { path: "/analyse", label: "Analysis" },
      { path: "/intraday", label: "Intraday" },
      { path: "/transactions", label: "Transactions" },
      { path: "/bonus", label: "Bonus" }
    ];
    function isActive(path) {
      if (path === "/") return store_get($$store_subs ??= {}, "$page", page).url.pathname === "/";
      return store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith(path);
    }
    $$renderer2.push(`<nav class="app-nav" aria-label="Navigation"><!--[-->`);
    const each_array = ensure_array_like(tabs);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tab = each_array[$$index];
      $$renderer2.push(`<a${attr("href", tab.path)}${attr_class("nav-btn", void 0, { "active": isActive(tab.path) })}>${escape_html(tab.label)}</a>`);
    }
    $$renderer2.push(`<!--]--></nav>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function SummaryBar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const totalValue = derived(() => portfolioStore.positions.reduce((s, p) => s + p.value, 0));
    const totalPl = derived(() => totalValue() - portfolioStore.totalInvested);
    const totalPlPct = derived(() => portfolioStore.totalInvested > 0 ? totalPl() / portfolioStore.totalInvested * 100 : 0);
    const dayPl = derived(() => portfolioStore.positions.reduce((s, p) => s + (p.dayPl ?? 0), 0));
    const dayPlPct = derived(() => totalValue() - dayPl() > 0 ? dayPl() / (totalValue() - dayPl()) * 100 : 0);
    if (portfolioStore.loaded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="summary-bar-inner"><div class="summary-hero"><div class="summary-hero-main"><div class="summary-hero-value">`);
      PrivacyValue($$renderer2, { value: fmt(totalValue()) });
      $$renderer2.push(`<!----></div> <div class="summary-hero-label">Totale waarde</div></div> <div class="summary-secondary"><div class="summary-secondary-item"><div class="metric-label">Rendement</div> <div class="metric-value">`);
      PrivacyValue($$renderer2, {
        value: fmt(totalPl()),
        class: totalPl() >= 0 ? "c-pos" : "c-neg"
      });
      $$renderer2.push(`<!----></div> <div${attr_class(`metric-sub ${stringify(totalPlPct() >= 0 ? "c-pos" : "c-neg")}`)}>${escape_html(fmtPct(totalPlPct()))}</div></div> <div class="summary-secondary-item"><div class="metric-label">Ingelegd</div> <div class="metric-value">`);
      PrivacyValue($$renderer2, { value: fmt(portfolioStore.totalInvested) });
      $$renderer2.push(`<!----></div></div> `);
      if (portfolioStore.twrPct !== null) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="summary-secondary-item"><div class="metric-label">TWR</div> <div${attr_class(`metric-value ${stringify((portfolioStore.twrPct ?? 0) >= 0 ? "c-pos" : "c-neg")}`)}>${escape_html(fmtPct(portfolioStore.twrPct ?? 0))}</div></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> <div class="summary-hero-today"><div class="summary-today-label">Vandaag</div> <div${attr_class(`summary-today-value ${stringify(dayPl() >= 0 ? "c-pos" : "c-neg")}`)}>`);
      PrivacyValue($$renderer2, { value: fmt(dayPl()) });
      $$renderer2.push(`<!----></div> <div${attr_class(`summary-today-pct ${stringify(dayPl() >= 0 ? "c-pos" : "c-neg")}`)}>${escape_html(fmtPct(dayPlPct()))}</div></div></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const { children } = $$props;
    const isDetailPage = derived(() => store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/aandeel/") || store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/bonus/") && store_get($$store_subs ??= {}, "$page", page).url.pathname !== "/bonus");
    const isSettingsPage = derived(() => store_get($$store_subs ??= {}, "$page", page).url.pathname === "/settings");
    $$renderer2.push(`<header class="top-bar"><div class="top-bar-inner">`);
    if (portfolioStore.loaded) {
      $$renderer2.push("<!--[0-->");
      SummaryBar($$renderer2);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="nav-with-controls"><div class="nav-slot">`);
    if (isDetailPage()) {
      $$renderer2.push("<!--[0-->");
    } else {
      $$renderer2.push("<!--[-1-->");
      Nav($$renderer2);
    }
    $$renderer2.push(`<!--]--></div> <div class="display-controls"><button${attr_class("icon-toggle", void 0, { "on": themeStore.privacyMode })} title="Privacy mode" aria-label="Toggle privacy mode"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path></svg></button> <a href="/settings"${attr_class("icon-toggle", void 0, { "on": isSettingsPage() })} title="Settings" aria-label="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"></path><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path></svg></a></div></div></div></header> <main>`);
    if (portfolioStore.error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="page-root"><div class="error-box"><div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div> <div style="font-size:12px;color:var(--fg-muted)">${escape_html(portfolioStore.error)}</div> <button class="btn" style="margin-top:16px">Opnieuw</button></div></div>`);
    } else if (!portfolioStore.loaded && portfolioStore.loading) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="page-root"><div class="loading"><div style="color:var(--fg-muted);font-size:13px;margin-bottom:12px">Laden…</div> <div class="progress-bar"><div class="progress-fill" style="width:40%"></div></div></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      children($$renderer2);
      $$renderer2.push(`<!---->`);
    }
    $$renderer2.push(`<!--]--></main>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
