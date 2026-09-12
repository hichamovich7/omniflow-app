import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
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
