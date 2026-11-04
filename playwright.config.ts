// playwright.config.ts — pinned shape per test-architecture doc §3 (test architecture, v121).
// Chromium-only matrix per §4; webServer launch per §5 (file:// is impossible:
// dynamic <script> loads + assets/*.pak fetches need HTTP).
// Trace policy reconciled (v124): trace 'retain-on-failure' per doc §3 — with retries
// at the Playwright default (0), a retry-gated trace mode would never record a trace.
// Timeout margin hardened (v151): 30s→60s per test / 5s→10s expect — worst observed
// single-test wall time under load on the 2-core shared box was 34.7s (load avg 9.4),
// so 30s had zero load margin. workers stays 2 (halving doubles suite wall time and
// does not relieve expect starvation); escalate to workers 1 only if flakes persist.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  workers: 2,
  timeout: 60_000, // per test (§3) — 30s→60s load-margin hardening (v151)
  expect: { timeout: 10_000 }, // auto-retrying assertions (§3) — 5s→10s (v151)
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
