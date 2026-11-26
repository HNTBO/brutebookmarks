import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/unit/**'],
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/summary.json' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    // Only Vite is reachable. Even speculative connections and redirects
    // that Chromium handles outside Playwright routing hit a dead proxy.
    launchOptions: { args: [
      '--proxy-server=http://127.0.0.1:9',
      '--proxy-bypass-list=<-loopback>;127.0.0.1:4173',
    ] },
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --config scripts/ci/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    env: { VITE_CLERK_PUBLISHABLE_KEY: '', VITE_CONVEX_URL: '' },
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
