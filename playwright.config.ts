import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // Each test gets its own browser context and workspace, so files run in parallel.
  workers: process.env.CI ? 3 : 4,
  // One retry on CI absorbs a random failure; the list reporter still marks it "flaky".
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3200',
    // Singapore demo market: English UI, SGD prices, SG formats.
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (process.platform === 'win32'
          ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
          : undefined),
    },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    {
      command: 'node scripts/backend-dev.mjs',
      url: 'http://127.0.0.1:3300/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:3200',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
