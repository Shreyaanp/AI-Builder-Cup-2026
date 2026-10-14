import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// S3 front door: the customer says what they want; the AI curates nearby results.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
})

test('AI entry: ask, watch it think, get curated nearby results, then browse', async ({
  page,
  isMobile,
}) => {
  await page.goto('/explore/')
  const search = page.getByRole('search')
  // The first visit compiles the lazy screen on the dev server.
  await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible({
    timeout: 30_000,
  })
  if (isMobile) {
    await page.waitForTimeout(900)
    await page.screenshot({ path: 'docs/stories/S3-ask-idle.png' })
  }
  await search.getByRole('textbox').fill('kopi near me')
  await search.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('Understanding what you need…')).toBeVisible()
  if (isMobile) await page.screenshot({ path: 'docs/stories/S3-ask-thinking.png' })
  const groups = page.getByRole('region', { name: /Best matches|Open now nearby|More nearby/ })
  await expect(groups.first()).toBeVisible({ timeout: 15_000 })
  await expect(groups.first().getByRole('link').first()).toBeVisible()
  await page.waitForTimeout(1600) // let the result cascade finish before checking contrast
  if (isMobile) await page.screenshot({ path: 'docs/stories/S3-ask-results.png' })
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(result.violations).toEqual([])
  // The classic list is one tap away and keeps working.
  await page.getByRole('link', { name: 'Browse everything nearby' }).click()
  await expect(page).toHaveURL(/\/explore\/browse/)
})

test('AI entry: a suggestion chip runs a search straight away', async ({ page }) => {
  await page.goto('/explore/')
  await page.getByRole('button', { name: 'Fresh bread' }).click()
  await expect(
    page.getByRole('region', { name: /Best matches|Open now nearby|More nearby/ }).first(),
  ).toBeVisible({ timeout: 15_000 })
})
