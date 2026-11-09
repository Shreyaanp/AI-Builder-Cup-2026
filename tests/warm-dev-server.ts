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
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(error.message))
    page.on('console', (line) => {
      if (line.type() === 'error') problems.push(line.text())
    })
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 180_000 })
      const ready = page.getByRole('button', { name: 'Continue local preview' })
      // Vite's overlay means the build is broken: say so now, not after three minutes (OB-259).
      await ready.or(page.locator('vite-error-overlay')).first().waitFor({ timeout: 180_000 })
      if (!(await ready.isVisible())) throw new Error('The dev server shows a build error.')
    } catch (error) {
      await page.screenshot({ path: 'test-results/warm-dev-server.png' }).catch(() => undefined)
      console.error('Dev server warm-up failed. See test-results/warm-dev-server.png', problems)
      throw error
    }
  } finally {
    await browser.close()
  }
}
