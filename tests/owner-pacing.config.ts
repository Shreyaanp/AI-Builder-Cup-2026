import { defineConfig } from '@playwright/test'
import base from '../playwright.config'

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'owner-pacing.spec.ts',
  timeout: 90_000,
  reporter: 'list',
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server) =>
    ({ ...server, cwd: process.cwd(), command: server.command === 'npm run dev' ? 'npm run preview' : server.command }),
  ),
})
