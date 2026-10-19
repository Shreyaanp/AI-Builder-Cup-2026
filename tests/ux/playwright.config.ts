import { defineConfig } from '@playwright/test'
import base from '../../playwright.config.js'
import { fileURLToPath } from 'node:url'

// Commands in the base config run from the repo root, not from this folder.
const root = fileURLToPath(new URL('../..', import.meta.url))
const webServer = [base.webServer ?? []]
  .flat()
  .map((s) => ({ ...s, cwd: s.cwd ? root + s.cwd : root }))

// The UX gate (OB-63): phone UX rules on the key screens (tests/ux/rules.ts). Same servers as the
// other browser jobs (the base config starts them); CI runs it sharded: npm run test:ux -- --shard=1/3
export default defineConfig({
  ...base,
  testDir: '.',
  testIgnore: [],
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results/ux-artifacts',
  timeout: 60_000,
  workers: process.env.CI ? 3 : 2,
  retries: 0,
  reporter: [['list']],
  use: { ...base.use, reducedMotion: 'reduce', trace: 'off' },
  webServer,
  projects: [{ name: 'ux' }],
})
