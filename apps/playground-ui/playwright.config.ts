import { defineConfig, devices } from '@playwright/test';

// By default e2e runs against a production build served by `vite preview`, with the MSW mocks compiled in.
// PLAYGROUND_LIVE_URL=http://localhost:8100 instead runs e2e/live.spec.ts against a running Compose stack
// (real BFF, Inji Certify, Inji Verify and the mock wallet).
const LIVE_URL = process.env.PLAYGROUND_LIVE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: LIVE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: LIVE_URL
    ? [{ name: 'live', use: { ...devices['Desktop Chrome'] }, testMatch: /live\.spec\.ts/ }]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /(live|same-device)\.spec\.ts/ },
        { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(layout|same-device)\.spec\.ts/ },
      ],
  ...(LIVE_URL
    ? {}
    : {
        webServer: {
          command:
            'VITE_USE_MOCKS=true pnpm exec vite build && pnpm exec vite preview --strictPort',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
