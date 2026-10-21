import { expect, test } from '@playwright/test'

for (const width of [360, 390, 412, 1280]) {
  for (const appearance of ['light', 'dark']) {
    for (const language of ['en', 'hi', 'ja']) {
      test(`OB-146 OB-188 customer headers stay aligned and show the area at ${width} ${appearance} ${language}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : width === 412 ? 915 : 800,
        })
        await page.addInitScript(
          ({ appearance, language }) => {
            localStorage.setItem(
              'niva.starter.preferences',
              JSON.stringify({ appearance, language }),
            )
            localStorage.setItem('chalkboard.customer.journey', 'done')
            localStorage.setItem(
              'chalkboard.discover.filters',
              JSON.stringify({ place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } }),
            )
          },
          { appearance, language },
        )
        await page.route('**/*', (route) =>
          ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
            ? route.fallback()
            : route.abort(),
        )
        for (const path of ['saved', 'chats', 'passport', 'rescue', '']) {
          await page.goto(`/explore/${path}`)
          await expect(
            page.locator('main').getByRole('heading', { level: 1 }).first(),
          ).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          const demo = page.locator('a[href="/explore/demo"]').first()
          const languageButton = page.locator('#customer-language-button')
          await expect(languageButton).toBeVisible()
          // The demo action belongs to the trailing controls, directly before Profile.
          const profile = languageButton.locator('xpath=preceding-sibling::button[1]')
          if (path) {
            await expect(demo).toBeVisible()
            const demoBox = (await demo.boundingBox())!
            const profileBox = (await profile.boundingBox())!
            expect(profileBox.x - (demoBox.x + demoBox.width)).toBeGreaterThanOrEqual(0)
            expect(profileBox.x - (demoBox.x + demoBox.width)).toBeLessThanOrEqual(4)
            expect(Math.abs(profileBox.y - demoBox.y)).toBeLessThanOrEqual(1)
          }
          if (!path) {
            const area = page.getByRole('button', { name: /Tiong Bahru/ }).first()
            await expect(area).toBeVisible()
            const label = area.locator('span').filter({ hasText: /^Tiong Bahru$/ })
            expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
            await area.click()
            await expect(area).toHaveAttribute('aria-expanded', 'true')
            await area.click()
            // OB-188: main reverted OB-88; the demo entry stays in the header.
            await expect(page.locator('header a[href="/explore/demo"]')).toHaveCount(1)
            await expect(page.locator('header a[href="/explore/demo"]')).toBeVisible()
            await profile.click()
            const sheet = page.getByRole('dialog')
            await expect(sheet).toBeVisible()
            await expect(sheet.locator('a[href="/explore/demo"]')).toHaveCount(0)
            await page.keyboard.press('Escape')
            await expect(sheet).toHaveCount(0)
            await expect(profile).toBeFocused()
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true)
          await page.screenshot({ path: test.info().outputPath(`${path || 'explore'}.png`) })
        }
      })
    }
  }
}
