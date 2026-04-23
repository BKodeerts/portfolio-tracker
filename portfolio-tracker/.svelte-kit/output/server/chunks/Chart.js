import { ac as ssr_context, b as attr_class, ad as clsx, i as attr_style, d as stringify } from "./renderer.js";
import "clsx";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
function Chart($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { option, height = "300px", class: cls = "" } = $$props;
    let chart = null;
    let ro = null;
    onDestroy(() => {
      ro?.disconnect();
      ro = null;
      chart?.dispose();
      chart = null;
    });
    $$renderer2.push(`<div${attr_class(clsx(cls))}${attr_style(`width:100%; height:${stringify(height)}`)}></div>`);
  });
}
export {
  Chart as C
};
