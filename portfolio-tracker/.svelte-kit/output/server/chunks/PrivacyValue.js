import { b as attr_class, ad as clsx, c as escape_html } from "./renderer.js";
import { t as themeStore } from "./theme.svelte.js";
function PrivacyValue($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const { value, class: cls = "" } = $$props;
    if (themeStore.privacyMode) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span${attr_class(clsx(cls))} style="filter:blur(7px);user-select:none" aria-hidden="true">●●●</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<span${attr_class(clsx(cls))}>${escape_html(value)}</span>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  PrivacyValue as P
};
