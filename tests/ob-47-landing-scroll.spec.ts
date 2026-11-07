import { expect, test } from '@playwright/test'

// OB-47 / #298: both landing variants must read without viewport-sized dead scroll on phones.
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
]

for (const appearance of ['light', 'dark']) {
  for (const viewport of viewports) {
    test(`OB-47 landing story follows content at ${viewport.width}px, ${appearance}`, async ({
      page,
    }) => {
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url())
        return ['127.0.0.1', 'localhost'].includes(url.hostname) &&
          !url.pathname.startsWith('/api/')
          ? route.fallback()
          : route.abort()
      })
      await page.addInitScript((appearance) => {
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ appearance, language: 'en' }),
        )
      }, appearance)
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        await page.emulateMedia({ reducedMotion })
        for (const variant of ['classic', 'new'] as const) {
          await page.setViewportSize(viewport)
          await page.goto(`/?app=landing&landing=${variant}`)
          const classic = variant === 'classic'
          const story = page.locator(classic ? '.lp-story' : '.l2-journey')
          const steps = story.locator(classic ? '.lp-steps li' : '.l2-stops li')
          await expect(steps).toHaveCount(classic ? 3 : 6)
          await page.evaluate(() => document.fonts.ready)
          if (viewport.width < 600 || !classic) {
            for (const step of await steps.all()) await expect(step).toBeVisible()
            if (classic)
              await expect(story.locator('.lp-story-pin')).toHaveCSS('position', 'static')
            const height = await story.evaluate((el) => el.getBoundingClientRect().height)
            // Content height cannot grow when only the browser's height changes (e.g. URL bar).
            await page.setViewportSize({ width: viewport.width, height: viewport.height + 200 })
            await expect
              .poll(() => story.evaluate((el) => el.getBoundingClientRect().height))
              .toBe(height)
            // No empty runway below the final step before the next section.
            const tail = await story.evaluate((el) => {
              const last = el.querySelector('li:last-child')!
              return el.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom
            })
            expect(tail).toBeLessThanOrEqual(96)
          } else {
            await expect(story.locator('.lp-story-pin')).toHaveCSS('position', 'sticky')
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true)
          await story.scrollIntoViewIfNeeded()
          await expect(steps.last()).toBeVisible()
          await page.screenshot({
            path: `output/playwright/ob-47-${variant}-${viewport.width}-${appearance}-${reducedMotion}.png`,
          })
        }
      }
    })
  }
}
