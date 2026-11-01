import { defineConfig } from '@playwright/test'

/*
 * Smoke tests against a production build served by vite preview. They use the
 * installed Chrome (no browser download) and never sign in or write to
 * Supabase. Run with: npm run e2e. Not part of CI.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  /* Keep run artefacts inside node_modules, which is already ignored */
  outputDir: 'node_modules/.cache/playwright',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
