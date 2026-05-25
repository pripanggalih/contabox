import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Contabox E2E.
 *
 * Firefox is the only target — we load the built `dist/` as a temporary
 * extension via the `web-ext run` runner. Tests are smoke-level; deeper
 * UI interactions live in vitest + jsdom.
 *
 * Run with: `pnpm test:e2e`
 *
 * IMPORTANT: this config currently lists no projects with `firefox` because
 * Playwright's bundled Firefox doesn't ship with the WebExtension test API.
 * The intended flow is `web-ext run --target=firefox-desktop` for manual
 * smoke runs; CI E2E coverage starts at M8 once the AMO test profile lands.
 */
export default defineConfig({
  testDir: './tests/e2e',
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
});
