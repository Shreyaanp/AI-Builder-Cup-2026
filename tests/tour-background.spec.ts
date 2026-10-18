import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

test('demo tour keeps the page visible behind every spotlight', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByText('Demo shop - nothing here is real', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()

  const tour = page.getByRole('dialog')
  const header = page.getByRole('banner').filter({ hasText: 'Lantern Chai Corner (Demo)' })
  const bottomTab = page.locator('[data-tour="nav-shop"]')
  const highlightedTargets = [
    'menu',
    'feature',
    'feature',
    'feature',
    'feature',
    'feature',
    'feature',
    'menu',
    'closeday',
    'composer',
    'google',
    'feature',
    'feature',
    'feature',
  ]

  for (const [index, target] of highlightedTargets.entries()) {
    await expect(tour.getByText(`${index + 1} of 14`)).toBeVisible({ timeout: 30_000 })
    await expect(header).toBeVisible()
    await expect(bottomTab).toBeVisible()
    const actualTarget = target === 'google' ? 'nav-grow' : target
    await expect(page.locator(`[data-tour="${actualTarget}"]`).first()).toBeVisible()
    if (index < highlightedTargets.length - 1) {
      await tour.getByRole('button', { name: 'Next', exact: true }).click()
    }
  }
})
