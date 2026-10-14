// Captures real screens for the launch video. Not part of the test suite (tests/ only).
// Run from the repo root: npx playwright test -c docs/launch/capture/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3210',
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    colorScheme: 'light',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (process.platform === 'win32'
          ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
          : undefined),
    },
  },
  webServer: [
    {
      // webServer commands run from this folder.
      command: 'node backend.mjs',
      url: 'http://127.0.0.1:3310/api/v1/health',
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'npx vite --config vite.config.ts',
      url: 'http://127.0.0.1:3210',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
