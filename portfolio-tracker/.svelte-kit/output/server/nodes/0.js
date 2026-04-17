

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "prerender": false,
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.CC4oAQ8p.js","_app/immutable/chunks/qkHeZkN3.js","_app/immutable/chunks/b2YpgsXS.js","_app/immutable/chunks/DRpJyByu.js","_app/immutable/chunks/6r0nA3ms.js","_app/immutable/chunks/C2FUgEmu.js","_app/immutable/chunks/BIdIKfo_.js","_app/immutable/chunks/DY90B0Zq.js","_app/immutable/chunks/qh_vPZSk.js","_app/immutable/chunks/BBhMcHkr.js","_app/immutable/chunks/DsA563Po.js","_app/immutable/chunks/CD_DAtmr.js","_app/immutable/chunks/BFUJArfz.js","_app/immutable/chunks/WdzNO3EU.js","_app/immutable/chunks/BBP5Qtbv.js","_app/immutable/chunks/6FLmh6K0.js"];
export const stylesheets = ["_app/immutable/assets/0.DJjiXkQU.css"];
export const fonts = [];
