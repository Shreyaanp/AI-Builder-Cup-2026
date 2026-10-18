import { defineConfig } from '@playwright/test'
import base from '../../playwright.config.js'

// Eye-strain / attention audit of the customer screens.
// Runs against already-running local servers: WEB_PORT/API_PORT, with DEMO_WORLD_ENABLED=true
// on the backend so the labelled demo neighbourhood exists. Not part of npm run check.
const web = Number(process.env.WEB_PORT ?? 3200)

export default defineConfig({
  ...base,
  testDir: '.',
  testIgnore: [],
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results/heatmap',
  timeout: 120_000,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  webServer: [],
  use: {
    ...base.use,
    baseURL: `http://127.0.0.1:${web}`,
    reducedMotion: 'reduce',
    trace: 'off',
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
