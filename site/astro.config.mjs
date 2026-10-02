// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// Resolve `domlamps` to its TypeScript sources in this workspace, so the site needs no prior
// library build. Published consumers never see this condition and get dist/.
const SOURCE = 'lamps-source';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://svey-xyz.github.io',
  base: process.env.BASE_PATH ?? '/',
  build: { inlineStylesheets: 'always' },
  integrations: [
    starlight({
      title: 'domlamps',
      description: 'Top-down, game-style lighting for ordinary HTML.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/svey-xyz/domlamps' }],
      editLink: { baseUrl: 'https://github.com/svey-xyz/domlamps/edit/main/site/' },
      sidebar: [
        { label: 'Live demo', link: '/' },
        { label: 'Start here', items: ['guides/getting-started', 'guides/frameworks'] },
        { label: 'Guides', items: ['guides/scene', 'guides/materials', 'guides/animation', 'guides/accessibility'] },
        {
          label: 'Reference',
          items: ['reference/markup', 'reference/javascript', 'reference/astro'],
        },
        { label: 'Under the hood', items: ['internals/rendering', 'internals/performance', 'internals/limitations'] },
      ],
    }),
  ],
  vite: {
    build: { assetsInlineLimit: 64 * 1024 },
    resolve: { conditions: [SOURCE, 'module', 'browser', 'development|production'] },
    ssr: { resolve: { conditions: [SOURCE, 'module', 'node', 'development|production'] } },
  },
});
