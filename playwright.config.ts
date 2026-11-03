// playwright.config.ts — pinned shape per test-architecture doc §3 (test architecture, v121).
// Chromium-only matrix per §4; webServer launch per §5 (file:// is impossible:
// dynamic <script> loads + assets/*.pak fetches need HTTP).
// Trace policy reconciled (v124): trace 'retain-on-failure' per doc §3 — with retries
// at the Playwright default (0), a retry-gated trace mode would never record a trace.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000, // per test (§3)
  expect: { timeout: 5_000 }, // auto-retrying assertions (§3)
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8123',
    headless: true,
    trace: 'retain-on-failure', // per doc §3
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1, // pins LayoutMetrics so canvas geometry assertions are stable (§3)
      },
    },
  ],
  webServer: {
    command: 'bash dev/serve.sh 8123',
    url: 'http://127.0.0.1:8123/',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
