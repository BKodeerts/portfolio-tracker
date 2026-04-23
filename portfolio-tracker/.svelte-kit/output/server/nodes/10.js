

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/transactions/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/10.0Vx9veAF.js","_app/immutable/chunks/B1ep9eYV.js","_app/immutable/chunks/DYfs8h9k.js","_app/immutable/chunks/kyn8nHbR.js","_app/immutable/chunks/CcoPltRt.js","_app/immutable/chunks/BpYeotsb.js","_app/immutable/chunks/BwEUqHwG.js","_app/immutable/chunks/kR8xDW68.js","_app/immutable/chunks/CVUMgSc_.js","_app/immutable/chunks/Cf5u12S_.js"];
export const stylesheets = ["_app/immutable/assets/10.C0Gg0pwE.css"];
export const fonts = [];
