import { defineConfig } from '@playwright/test'

/*
 * Signed-in tests against a local build and the REAL Supabase project in .env.
 * They create throwaway accounts, work only on those, and delete them again.
 * Needs Confirm email OFF in Supabase; with it on, every test is skipped.
 * Run with: npm run e2e:live. Not part of CI, which has no database access.
 */
export default defineConfig({
  testDir: './e2e-live',
  /* Several tests share accounts, and the server limits sign-ups and posts */
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: 'list',
  outputDir: 'node_modules/.cache/playwright-live',
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
