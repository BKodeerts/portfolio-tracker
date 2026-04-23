import { a as attr, e as escape_html, b as ensure_array_like, c as attr_class, s as store_get, d as derived, u as unsubscribe_stores } from "../../chunks/renderer.js";
import { p as page } from "../../chunks/stores.js";
import { p as portfolioStore } from "../../chunks/portfolio.svelte.js";
import { i as intradayStore } from "../../chunks/intraday.svelte.js";
import { t as themeStore } from "../../chunks/theme.svelte.js";
function Nav($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const tabs = [
      { path: "/", label: "Dashboard" },
      { path: "/analysis", label: "Analyse" },
      { path: "/transactions", label: "Transacties" },
      { path: "/import", label: "Import" },
      { path: "/bonus", label: "Bonus" }
    ];
    function isActive(path) {
      if (path === "/") return store_get($$store_subs ??= {}, "$page", page).url.pathname === "/";
      return store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith(path);
    }
    const isStockDetail = derived(() => store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/stock/"));
    const isBonusDetail = derived(() => store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/bonus/") && store_get($$store_subs ??= {}, "$page", page).url.pathname !== "/bonus");
    const isDetailPage = derived(() => isStockDetail() || isBonusDetail());
    const backHref = derived(() => isBonusDetail() ? "/bonus" : "/");
    const backLabel = derived(() => isBonusDetail() ? "← Bonus" : "← Portfolio");
    $$renderer2.push(`<nav class="app-nav svelte-1h32yp1" aria-label="Navigatie">`);
    if (isDetailPage()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<a${attr("href", backHref())} class="nav-btn back-btn svelte-1h32yp1">${escape_html(backLabel())}</a>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(tabs);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tab = each_array[$$index];
      $$renderer2.push(`<a${attr("href", tab.path)}${attr_class("nav-btn", void 0, { "active": isActive(tab.path) })}>${escape_html(tab.label)}</a>`);
    }
    $$renderer2.push(`<!--]--></nav>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const { children } = $$props;
    const isSettingsPage = derived(() => store_get($$store_subs ??= {}, "$page", page).url.pathname === "/settings");
    $$renderer2.push(`<header class="top-bar"><div class="top-bar-inner"><div class="top-logo"><div class="top-logo-mark">P</div> <span class="top-logo-name">Portefeuille</span></div> `);
    Nav($$renderer2);
    $$renderer2.push(`<!----> <div class="top-bar-right">`);
    if (intradayStore.liveEurUsd) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="fx-badge"><span class="fx-dot"></span> EUR/USD ${escape_html(intradayStore.liveEurUsd.toFixed(3))}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button${attr_class("icon-toggle", void 0, { "on": themeStore.privacyMode })} title="Privacy mode" aria-label="Toggle privacy mode"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`);
    if (themeStore.privacyMode) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path>`);
    }
    $$renderer2.push(`<!--]--></svg></button> <button class="icon-toggle" title="Thema wisselen" aria-label="Toggle theme">`);
    if (themeStore.isDark) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path></svg>`);
    }
    $$renderer2.push(`<!--]--></button> <a href="/settings"${attr_class("icon-toggle", void 0, { "on": isSettingsPage() })} title="Instellingen" aria-label="Instellingen"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"></path><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path></svg></a></div></div></header> <nav class="mobile-tab-bar svelte-12qhfyh" aria-label="Navigatie"><a href="/"${attr_class("mtab svelte-12qhfyh", void 0, {
      "active": store_get($$store_subs ??= {}, "$page", page).url.pathname === "/"
    })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"${attr("stroke-width", store_get($$store_subs ??= {}, "$page", page).url.pathname === "/" ? 2.3 : 1.7)} stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"></path></svg> <span>Portefeuille</span></a> <a href="/analysis"${attr_class("mtab svelte-12qhfyh", void 0, {
      "active": store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/analysis")
    })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"${attr("stroke-width", store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/analysis") ? 2.3 : 1.7)} stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M7 15l4-6 3 4 5-8" stroke-linecap="round" stroke-linejoin="round"></path></svg> <span>Analyse</span></a> <a href="/transactions"${attr_class("mtab svelte-12qhfyh", void 0, {
      "active": store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/transactions")
    })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"${attr("stroke-width", store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/transactions") ? 2.3 : 1.7)} stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"></path></svg> <span>Transacties</span></a> <a href="/import"${attr_class("mtab svelte-12qhfyh", void 0, {
      "active": store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/import") || store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/bonus") || store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/settings")
    })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"${attr("stroke-width", store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/import") || store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/bonus") || store_get($$store_subs ??= {}, "$page", page).url.pathname.startsWith("/settings") ? 2.3 : 1.7)} stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg> <span>Meer</span></a></nav> <main>`);
    if (portfolioStore.error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="page-root"><div class="error-box"><div style="font-size:14px;color:var(--c-neg);margin-bottom:8px;font-weight:600">Laden mislukt</div> <div style="font-size:12px;color:var(--fg-muted)">${escape_html(portfolioStore.error)}</div> <button class="btn" style="margin-top:16px">Opnieuw proberen</button></div></div>`);
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
