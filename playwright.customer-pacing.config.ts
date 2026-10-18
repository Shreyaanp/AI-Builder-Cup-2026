import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// These journeys substitute every API response and reject external requests.
// Exercise the built customer app without starting a backend or model adapter.
export default defineConfig(base, {
  testMatch: ['customer-pacing.spec.ts', 'first-run.spec.ts'],
  workers: 1,
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview',
    url: `http://127.0.0.1:${process.env.WEB_PORT ?? 5121}`,
    reuseExistingServer: false,
  },
})
