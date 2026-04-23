import { a as attr, c as escape_html, e as ensure_array_like, b as attr_class, ad as clsx, f as derived } from "../../../chunks/renderer.js";
import { f as fmt } from "../../../chunks/fmt.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let search = "";
    let txs = [];
    const filtered = derived(() => search.trim() ? txs.filter((t) => [t.ticker, t.yahoo ?? "", t.label ?? "", t.isin ?? ""].some((v) => v.toLowerCase().includes(search.toLowerCase()))) : txs);
    (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    function typeLabel(t) {
      if (t.shares === 0) return "Div";
      return t.shares > 0 ? "Koop" : "Verk";
    }
    function typeClass(t) {
      if (t.shares === 0) return "c-neutral";
      return t.shares > 0 ? "c-pos" : "c-neg";
    }
    $$renderer2.push(`<div class="page-root"><div class="tx-toolbar svelte-1q0dtg6"><input class="search-input svelte-1q0dtg6" type="text" placeholder="Zoek ticker, ISIN…"${attr("value", search)}/> <button class="btn">${escape_html("+ Transactie")}</button> <a href="/import" class="btn">CSV importeren</a> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="card" style="overflow-x:auto"><table class="tx-table svelte-1q0dtg6"><thead><tr><th class="svelte-1q0dtg6">Datum</th><th class="svelte-1q0dtg6">Type</th><th class="svelte-1q0dtg6">Ticker</th><th class="right desktop-only svelte-1q0dtg6">Aandelen</th><th class="right svelte-1q0dtg6">Kosten €</th><th class="desktop-only svelte-1q0dtg6">Munt</th><th class="desktop-only svelte-1q0dtg6">ISIN</th><th style="width:32px" class="svelte-1q0dtg6"></th></tr></thead><tbody class="svelte-1q0dtg6"><!--[-->`);
    const each_array_1 = ensure_array_like(filtered());
    for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
      let tx = each_array_1[i];
      $$renderer2.push(`<tr class="svelte-1q0dtg6"><td class="mono svelte-1q0dtg6">${escape_html(tx.date)}</td><td${attr_class(clsx(typeClass(tx)), "svelte-1q0dtg6")}>${escape_html(typeLabel(tx))}</td><td class="svelte-1q0dtg6"><span class="ticker-name">${escape_html(tx.ticker)}</span> `);
      if (tx.yahoo !== tx.ticker) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="ticker-sub desktop-only svelte-1q0dtg6">${escape_html(tx.yahoo)}</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (tx.label) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="ticker-label desktop-only svelte-1q0dtg6">${escape_html(tx.label)}</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></td><td class="right mono desktop-only svelte-1q0dtg6">${escape_html(tx.shares !== 0 ? tx.shares : "—")}</td><td class="right mono svelte-1q0dtg6">${escape_html(fmt(tx.costEur))}</td><td class="mono desktop-only svelte-1q0dtg6">${escape_html(tx.currency)}</td><td class="mono desktop-only svelte-1q0dtg6" style="font-size:11px;color:var(--fg-muted)">${escape_html(tx.isin ?? "—")}</td><td class="svelte-1q0dtg6"><button class="del-btn svelte-1q0dtg6" title="Verwijderen">×</button></td></tr>`);
    }
    $$renderer2.push(`<!--]--></tbody></table> `);
    if (filtered().length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div style="padding:24px;text-align:center;color:var(--fg-muted);font-size:13px">${escape_html("Geen transacties")}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div style="margin-top:8px;font-size:12px;color:var(--fg-muted);text-align:right">${escape_html(filtered().length)} van ${escape_html(txs.length)} transacties</div></div>`);
  });
}
export {
  _page as default
};
