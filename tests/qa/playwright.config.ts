import { defineConfig } from '@playwright/test'
import base from '../../playwright.config.js'
import { fileURLToPath } from 'node:url'

// Separate servers and artifacts: never use another worker's ports or story reporter.
process.env.WEB_PORT ??= '3437'
process.env.API_PORT ??= '3537'
process.env.PLAYWRIGHT_LOCAL_ONLY = 'true'

export default defineConfig({
  ...base,
  testDir: '.',
  testIgnore: [],
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results/qa',
  timeout: 60_000,
  workers: 2,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: fileURLToPath(new URL('../../docs/qa/results.json', import.meta.url)) }],
  ],
  use: {
    ...base.use,
    baseURL: `http://127.0.0.1:${process.env.WEB_PORT}`,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce',
    trace: 'off',
    launchOptions: {
      ...base.use?.launchOptions,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
    },
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer:
    process.env.QA_EXTERNAL_SERVER === 'true'
      ? []
      : [
          {
            command: 'node tests/qa/server.mjs',
            cwd: fileURLToPath(new URL('../..', import.meta.url)),
            url: `http://127.0.0.1:${process.env.API_PORT}/api/v1/health`,
            reuseExistingServer: false,
            timeout: 90_000,
          },
          {
            command: 'npm run dev',
            cwd: fileURLToPath(new URL('../..', import.meta.url)),
            url: `http://127.0.0.1:${process.env.WEB_PORT}`,
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ],
})
