import { chromium, type FullConfig } from '@playwright/test'

// OB-258: a fresh Vite dev server compiles the app on its first page load (about 40 s), longer
// than one test's 30 s timeout, so whichever test ran first timed out on "Getting things ready…"
// (in the release gate: coach-reliability's OB-72 and voice tests) and passed on rerun. The
// servers are up before this runs; the suite starts once the app has rendered its first screen.
export default async function warmDevServer(config: FullConfig) {
  const { baseURL, launchOptions, storageState } = config.projects[0].use
  const browser = await chromium.launch(launchOptions)
  try {
    const page = await browser.newPage({ baseURL, storageState })
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.getByRole('button', { name: 'Continue local preview' }).waitFor({ timeout: 180_000 })
  } finally {
    await browser.close()
  }
}
