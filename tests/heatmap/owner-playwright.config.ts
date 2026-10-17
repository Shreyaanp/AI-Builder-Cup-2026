import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const web = Number(process.env.WEB_PORT ?? 3879)
const api = Number(process.env.API_PORT ?? 3979)
const root = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  testDir: '.',
  testIgnore: ['customer-heatmap.spec.ts'],
  testMatch: 'owner-heatmap.spec.ts',
  outputDir: '../../test-results/heatmap',
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${web}`,
    reducedMotion: 'reduce',
    trace: 'off',
    permissions: ['camera'],
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (process.platform === 'win32'
          ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
          : undefined),
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: [
    {
      command: 'node scripts/backend-dev.mjs',
      cwd: root,
      url: `http://127.0.0.1:${api}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        API_PORT: String(api),
        WEB_PORT: String(web),
        RECALL_PATH: process.env.RECALL_PATH ?? 'data/test-vectors',
      },
    },
    {
      command: 'npm run dev',
      cwd: root,
      url: `http://127.0.0.1:${web}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        API_PORT: String(api),
        WEB_PORT: String(web),
      },
    },
  ],
  projects: [
    {
      name: 'phone-360',
      use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'phone-390',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'phone-412',
      use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    },
  ],
})
