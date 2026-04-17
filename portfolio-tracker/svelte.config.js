import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: 'index.html',
      precompress: false,
      strict: true,
    }),
    // Relative asset URLs — required for Home Assistant ingress (arbitrary base path)
    // and for Express static serving in production.
    paths: { relative: true },
    alias: {
      $lib: 'src/lib',
    },
  },
};

export default config;
