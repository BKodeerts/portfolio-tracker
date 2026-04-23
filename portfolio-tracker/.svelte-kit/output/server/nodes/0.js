

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "prerender": false,
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.Bd4SG6sB.js","_app/immutable/chunks/B1ep9eYV.js","_app/immutable/chunks/DYfs8h9k.js","_app/immutable/chunks/DqPTTihx.js","_app/immutable/chunks/p7ECaPJi.js","_app/immutable/chunks/CYe3V2wK.js","_app/immutable/chunks/kyn8nHbR.js","_app/immutable/chunks/BpYeotsb.js","_app/immutable/chunks/BwEUqHwG.js","_app/immutable/chunks/B1-MAX5v.js","_app/immutable/chunks/jRI4WU9T.js","_app/immutable/chunks/4ws88k_v.js","_app/immutable/chunks/e5VlR8Bt.js","_app/immutable/chunks/CcoPltRt.js"];
export const stylesheets = ["_app/immutable/assets/0.BR8V6B0B.css"];
export const fonts = [];
