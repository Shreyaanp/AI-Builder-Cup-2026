import { defineConfig } from '@playwright/test'
import base from '../../playwright.config.js'
import { fileURLToPath } from 'node:url'

// Commands in the base config run from the repo root, not from this folder.
const root = fileURLToPath(new URL('../..', import.meta.url))
const webServer = [base.webServer ?? []]
  .flat()
  .map((s) => ({ ...s, cwd: s.cwd ? root + s.cwd : root }))

// Eye-strain / attention audit of the customer screens (docs/qa/customer-heatmap.md).
// Uses the base config's servers (WEB_PORT/API_PORT) with DEMO_WORLD_ENABLED=true
// on the backend so the labelled demo neighbourhood exists. Not part of npm run check; CI runs it sharded in the UX gate job (scripts/heatmap-gate.mjs).
// The labelled demo neighbourhood the spec asks for.
process.env.DEMO_WORLD_ENABLED ??= 'true'
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
  // CI starts the servers itself (the base config); locally an already-running pair is reused.
  webServer,
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
