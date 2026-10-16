import { expect, test } from '@playwright/test'
import { enter, seedShop } from './stories/support.js'

for (const enabled of [true, false]) {
  for (const appearance of ['light', 'dark']) {
    test(`Google guide visibility follows server flag: ${enabled}, ${appearance}`, async ({
      page,
    }, info) => {
      if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 })
      await page.addInitScript((value) => {
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ appearance: value, language: 'en' }),
        )
      }, appearance)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.route('**/api/v1/bootstrap', async (route) => {
        const response = await route.fetch()
        const value = await response.json()
        await route.fulfill({ response, json: { ...value, features: { google_guide: enabled } } })
      })
      await enter(page)
      await seedShop(page)
      // Get on Google is a Grow card (a sub-page of Grow); the flag hides the card.
      await page.getByRole('button', { name: 'Grow', exact: true }).click()
      await expect(page.getByTestId('grow-tiles')).toBeVisible()
      const google = page.getByRole('button', { name: /^Get on Google/ })
      if (enabled) await expect(google).toBeVisible()
      else await expect(google).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Coach', exact: true })).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true)
      await page.screenshot({
        path: `artifacts/devops/${info.project.name}-${appearance}-${enabled}.png`,
        animations: 'disabled',
      })
    })
  }
}
