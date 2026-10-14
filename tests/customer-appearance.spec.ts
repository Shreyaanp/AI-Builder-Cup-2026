import { expect, test } from '@playwright/test'

// B38: customer pages switch between light and dark, and remember the choice.
test('B38: customer pages have a light/dark switch that is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/explore/')
  const toDark = page.getByRole('button', { name: 'Switch to dark mode' })
  await expect(toDark).toBeVisible()
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const light = await background()
  await toDark.click()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  expect(await background()).not.toBe(light)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
})
