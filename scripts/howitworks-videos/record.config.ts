import { defineConfig } from '@playwright/test'

// Records the How it works demo clips from the real app (local preview, seeded demo worlds).
// Foreground only: npx playwright test -c scripts/howitworks-videos/record.config.ts --workers=1
const web = Number(process.env.WEB_PORT ?? 3270)
const api = Number(process.env.API_PORT ?? 3370)

export default defineConfig({
  testDir: '.',
  testMatch: /record-.*\.ts$/,
  timeout: 300_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${web}`,
    actionTimeout: 20_000,
    // The language is chosen in each clip (English, or Hindi via preferences).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://127.0.0.1:${web}`,
          localStorage: [
            { name: 'niva.language.chosen', value: '1' },
            { name: 'chalkboard.explainer.owner.v1', value: '1' },
            { name: 'chalkboard.explainer.customer.v1', value: '1' },
          ],
        },
      ],
    },
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
      command: 'node scripts/backend-dev.mjs',
      cwd: '../..',
      url: `http://127.0.0.1:${api}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        FRESH_TEST_DATA: '1',
        PUBLIC_DEMO_ENABLED: 'true',
        GUEST_CUSTOMER: 'true',
        WEB_PORT: `${web}`,
        API_PORT: `${api}`,
      },
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      cwd: '../..',
      url: `http://127.0.0.1:${web}`,
      reuseExistingServer: false,
      env: { WEB_PORT: `${web}`, API_PORT: `${api}` },
      timeout: 60_000,
    },
  ],
})
