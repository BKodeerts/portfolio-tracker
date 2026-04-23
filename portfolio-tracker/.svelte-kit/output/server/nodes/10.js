

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/transactions/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/10.BDc7cFH9.js","_app/immutable/chunks/CXH28_OG.js","_app/immutable/chunks/Bpfdnexl.js","_app/immutable/chunks/B0ETMeTh.js","_app/immutable/chunks/CK8c0wzB.js","_app/immutable/chunks/BW41m5Pz.js","_app/immutable/chunks/CcizIAf8.js","_app/immutable/chunks/MYB6yOvB.js","_app/immutable/chunks/CcoAgDFA.js","_app/immutable/chunks/Cf5u12S_.js"];
export const stylesheets = ["_app/immutable/assets/10.DOT11Kvt.css"];
export const fonts = [];
