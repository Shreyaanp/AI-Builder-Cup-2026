import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

test('demo tour keeps the page visible behind every spotlight', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByText('Demo shop · sample data', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()

  const tour = page.getByRole('dialog')
  const header = page.getByRole('banner').filter({ hasText: 'Lantern Chai Corner (Demo)' })
  const bottomTab = page.locator('[data-tour="nav-shop"]')
  const highlightedTargets = [
    'today',
    'today-supply',
    'reorder',
    'forecast',
    'menu',
    'closeday',
    'composer',
  ]

  for (const [index, target] of highlightedTargets.entries()) {
    await expect(tour.getByText(`${index + 1} of 7`)).toBeVisible({ timeout: 30_000 })
    await expect(header).toBeVisible()
    await expect(bottomTab).toBeVisible()
    await expect(page.locator(`[data-tour="${target}"]`).first()).toBeVisible()
    await expect(page.locator('[data-tour="feature"]')).toHaveCount(0)
    if (index < highlightedTargets.length - 1) {
      await tour.getByRole('button', { name: 'Next', exact: true }).click()
    }
  }
})
