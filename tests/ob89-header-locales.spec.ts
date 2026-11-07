import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

for (const language of ['hi', 'ja'])
  for (const appearance of ['light', 'dark'])
    test(`OB-89 localized headers ${language} ${appearance}`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.route('**/*', (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      )
      await page.addInitScript(
        (preferences) => {
          localStorage.setItem('niva.starter.preferences', JSON.stringify(preferences))
          sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
        },
        { language, appearance },
      )
      for (const [name, path] of [
        ['how', '/how-it-works'],
        ['owner', '/demo?tab=shop'],
        ['browse', '/explore/browse'],
        ['shop', '/explore/s/demo-story-bengaluru-chai'],
      ]) {
        await page.goto(path)
        const header = page.locator('header[data-app-header]')
        await expect(header).toBeVisible({ timeout: 20_000 })
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('html')).toHaveAttribute('lang', language)
        await expect(header).toHaveCSS('height', '64px')
        const controls = header.locator('button:visible, a[href]:visible')
        for (const control of await controls.all()) {
          const box = (await control.boundingBox())!
          expect(box.width).toBeGreaterThanOrEqual(48)
          expect(box.height).toBeGreaterThanOrEqual(48)
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(390)
        }
        await page.screenshot({
          path: `output/playwright/ob89/390-${appearance}-${language}-${name}.png`,
        })
      }
    })
