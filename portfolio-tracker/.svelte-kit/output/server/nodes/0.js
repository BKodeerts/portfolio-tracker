

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "prerender": false,
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.DHXL3L8G.js","_app/immutable/chunks/CXH28_OG.js","_app/immutable/chunks/Bpfdnexl.js","_app/immutable/chunks/CSGOvlfF.js","_app/immutable/chunks/BSPHWbet.js","_app/immutable/chunks/BXpyhBrx.js","_app/immutable/chunks/B0ETMeTh.js","_app/immutable/chunks/CcizIAf8.js","_app/immutable/chunks/SZPQNtZ2.js","_app/immutable/chunks/DzSi-rgU.js","_app/immutable/chunks/cXSTYTA2.js","_app/immutable/chunks/BFO9T8Nc.js","_app/immutable/chunks/CK8c0wzB.js","_app/immutable/chunks/BW41m5Pz.js","_app/immutable/chunks/Cf5u12S_.js","_app/immutable/chunks/BHCUP-qi.js"];
export const stylesheets = ["_app/immutable/assets/0.DfPgyYCE.css"];
export const fonts = [];
