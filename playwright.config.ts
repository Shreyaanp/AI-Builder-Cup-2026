import { defineConfig, devices } from '@playwright/test'

// Per-worktree ports (see vite.config.ts): set WEB_PORT/API_PORT to run beside another checkout.
const web = Number(process.env.WEB_PORT ?? 3200)
const api = Number(process.env.API_PORT ?? 3300)

export default defineConfig({
  testDir: './tests',
  // The QA machine has its own servers and config: npm run test:qa
  testIgnore: ['qa/**', 'heatmap/**'],
  timeout: 30_000,
  // Shard individual isolated tests, so large story files cannot dominate one shard.
  fullyParallel: true,
  // Each test gets its own browser context and workspace, so files run in parallel.
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI
      ? 3
      : 4,
  // One retry on CI absorbs a random failure; the list reporter still marks it "flaky".
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['./tests/stories/audit-reporter.ts']],
  use: {
    baseURL: `http://127.0.0.1:${web}`,
    // Singapore demo market: English UI, SGD prices, SG formats.
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    // The language was already chosen after sign-in; tests/region.spec.ts clears this to walk
    // the "Choose your language" step itself.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://127.0.0.1:${web}`,
          localStorage: [{ name: 'niva.language.chosen', value: '1' }],
        },
      ],
    },
    screenshot: 'only-on-failure',
    launchOptions: {
      args:
        process.env.PLAYWRIGHT_LOCAL_ONLY === 'true'
          ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']
          : [],
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
      url: `http://127.0.0.1:${api}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: `http://127.0.0.1:${web}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
