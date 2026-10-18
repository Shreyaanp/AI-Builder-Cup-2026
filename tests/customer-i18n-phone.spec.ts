import { expect, test } from '@playwright/test'

test.use({ locale: 'ta-SG', viewport: { width: 390, height: 844 } })

test('Tamil Today’s 7 heading keeps its numerals on the Tamil text baseline', async ({ page }) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.goto('/explore/')
  const today = page.getByRole('button', { name: /இன்றைய/ })
  await expect(today).toBeVisible()
  const family = await today.evaluate((element) => getComputedStyle(element).fontFamily)
  expect(family).not.toContain('Caveat')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
