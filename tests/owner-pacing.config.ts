import { defineConfig } from '@playwright/test'
import base from '../playwright.config.js'

const servers = Array.isArray(base.webServer) ? base.webServer : []

// The Supply demo button is dev-only, so this runs against the dev server.
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'owner-pacing.spec.ts',
  timeout: 90_000,
  reporter: 'list',
  webServer: servers.map((server) => ({ ...server, cwd: process.cwd() })),
})
