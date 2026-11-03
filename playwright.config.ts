// playwright.config.ts — pinned shape per test-architecture doc §3 (test architecture, v121).
// Chromium-only matrix per §4; webServer launch per §5 (file:// is impossible:
// dynamic <script> loads + assets/*.pak fetches need HTTP).
//
// ONE deviation from test-architecture doc §3, per this task's deliverable spec: trace is
// 'on-first-retry', not the doc's 'retain-on-failure'. Note that with retries at
// the Playwright default (0) no trace is ever recorded — if failure forensics are
// wanted, reconcile with the doc ('retain-on-failure') or set retries >= 1.
// TODO(reconcile): pick one trace policy with the doc owner before CI lands.
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
    trace: 'on-first-retry', // task spec; doc §3 says 'retain-on-failure' — see header
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
