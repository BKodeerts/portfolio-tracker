import { e as ensure_array_like, a as attr, d as stringify, c as escape_html, b as attr_class } from "../../../chunks/renderer.js";
import { p as portfolioStore } from "../../../chunks/portfolio.svelte.js";
import { f as fmt, a as fmtPct } from "../../../chunks/fmt.js";
import { P as PrivacyValue } from "../../../chunks/PrivacyValue.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    function typeLabel(t) {
      return t === "call_option" ? "Call optie" : "Warrant";
    }
    $$renderer2.push(`<div class="page-root"><div class="page-toolbar svelte-1upw5g8"><h2 class="page-title svelte-1upw5g8">Bonus &amp; opties</h2> <button class="btn">+ Toevoegen</button> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (portfolioStore.bonusItems.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="card empty-state svelte-1upw5g8"><p class="svelte-1upw5g8">Geen bonus-instrumenten gevonden.</p> <p class="c-muted svelte-1upw5g8" style="font-size:12px">Voeg warrants of call-opties toe om ze hier te beheren.</p></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="bonus-grid svelte-1upw5g8"><!--[-->`);
      const each_array = ensure_array_like(portfolioStore.bonusItems);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let item = each_array[$$index];
        $$renderer2.push(`<a class="bonus-card card svelte-1upw5g8"${attr("href", `/bonus/${stringify(item.id)}`)}><div class="bonus-card-header svelte-1upw5g8"><div class="bonus-card-title svelte-1upw5g8">${escape_html(item.label)}</div> <span${attr_class("type-badge svelte-1upw5g8", void 0, { "call": item.type === "call_option" })}>${escape_html(typeLabel(item.type))}</span></div> <div class="bonus-card-sub svelte-1upw5g8">${escape_html(item.underlying)}</div> <div class="bonus-metrics svelte-1upw5g8"><div class="bonus-metric svelte-1upw5g8"><div class="bm-label svelte-1upw5g8">Waarde</div> <div class="bm-value svelte-1upw5g8">`);
        if (item.totalValue != null) {
          $$renderer2.push("<!--[0-->");
          PrivacyValue($$renderer2, { value: fmt(item.totalValue) });
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="c-muted">—</span>`);
        }
        $$renderer2.push(`<!--]--></div></div> <div class="bonus-metric svelte-1upw5g8"><div class="bm-label svelte-1upw5g8">P&amp;L</div> <div${attr_class(`bm-value ${stringify((item.pl ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1upw5g8")}>`);
        if (item.pl != null) {
          $$renderer2.push("<!--[0-->");
          PrivacyValue($$renderer2, { value: `${item.pl >= 0 ? "+" : ""}${fmt(item.pl)}` });
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="c-muted">—</span>`);
        }
        $$renderer2.push(`<!--]--></div></div> <div class="bonus-metric svelte-1upw5g8"><div class="bm-label svelte-1upw5g8">%</div> <div${attr_class(`bm-value ${stringify((item.plPct ?? 0) >= 0 ? "c-pos" : "c-neg")}`, "svelte-1upw5g8")}>${escape_html(item.plPct != null ? fmtPct(item.plPct) : "—")}</div></div> `);
        if (item.type === "call_option" && item.delta != null) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="bonus-metric svelte-1upw5g8"><div class="bm-label svelte-1upw5g8">Delta</div> <div class="bm-value svelte-1upw5g8">${escape_html(item.delta.toFixed(3))}</div></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="bonus-footer svelte-1upw5g8"><span class="c-muted" style="font-size:11px">${escape_html(item.quantity)} × ${escape_html(item.type === "call_option" ? `Strike ${item.strike}` : `@${item.grantPrice}`)}</span> `);
        if (item.expiry) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="c-muted" style="font-size:11px">Verloopt ${escape_html(item.expiry)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <button class="edit-btn svelte-1upw5g8" title="Bewerken">✏</button></div></a>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
