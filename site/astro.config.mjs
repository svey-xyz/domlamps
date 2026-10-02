// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 64 * 1024 } },
});
