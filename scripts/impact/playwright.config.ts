import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// Only ordinary runtime paths and explicit benchmark options reach child processes.
const keep =
  /^(path|systemroot|windir|temp|tmp|userprofile|localappdata|programfiles(?:\(x86\))?|comspec|pathext|chrome_path|impact_runs)$/i
for (const key of Object.keys(process.env)) if (!keep.test(key)) delete process.env[key]
Object.assign(process.env, {
  WEB_PORT: '3791',
  API_PORT: '3891',
  RECALL_PATH: 'data/test-vectors',
  UV_OFFLINE: '1',
  PLAYWRIGHT_LOCAL_ONLY: 'true',
  PYTHONUTF8: '1',
  PYTHONUNBUFFERED: '1',
})
const python = resolve(
  'backend/.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  outputDir: '../../output/impact/playwright',
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:3791',
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 90_000,
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (process.platform === 'win32'
          ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
          : undefined),
      args: [
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
        '--disable-background-networking',
        '--disable-component-update',
        '--no-first-run',
      ],
    },
  },
  webServer: [
    {
      command: `"${python}" scripts/impact/offline.py serve`,
      url: 'http://127.0.0.1:3891/api/v1/health',
      cwd: resolve('.'),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --config scripts/impact/vite.config.ts',
      cwd: resolve('.'),
      url: 'http://127.0.0.1:3791',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
