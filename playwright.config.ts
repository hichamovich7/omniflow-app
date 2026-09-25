import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // `localhost`, not `127.0.0.1`: Next 16 dev blocks cross-origin dev assets
    // for other hosts, so pages never hydrate. The env var still wins.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'renderer', testMatch: '**/renderer/*.spec.ts' },
    {
      name: 'chromium',
      testMatch: '**/playwright/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      testMatch: '**/playwright/*.spec.ts',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
