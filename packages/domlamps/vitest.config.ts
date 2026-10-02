import { playwright } from '@vitest/browser-playwright';
import { getViteConfig } from 'astro/config';
import { defineConfig } from 'vitest/config';

// WebGL2 in headless Chromium needs SwiftShader when there is no GPU (CI).
const chromiumArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      // Astro components, compiled by Astro's Vite plugins and rendered with the Container API.
      getViteConfig(
        { test: { name: 'astro', include: ['test/astro/**/*.test.ts'], environment: 'node' } },
        { logLevel: 'error' },
      ),
      {
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                args: chromiumArgs,
                // Use a preinstalled Chromium when the bundled one isn't downloaded.
                executablePath: process.env.CHROMIUM_PATH || undefined,
              },
            }),
            instances: [{ browser: 'chromium', viewport: { width: 800, height: 600 } }],
          },
        },
      },
    ],
  },
});
