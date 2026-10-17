import { expect, test } from '@playwright/test'
import { ownerTools } from './owner-tools-support.js'

const fixture = 'scripts/impact/fixtures/bakery.png'

test.setTimeout(120_000)
test.use({ actionTimeout: 30_000 })
const slow = { timeout: 45_000 }

async function openDetails(page: import('@playwright/test').Page) {
  await ownerTools(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await expect(page.getByTestId('shop-icon')).toBeVisible()
}

test('upload a picture as the shop icon, then remove it (monogram returns)', async ({ page }) => {
  await openDetails(page)
  const icon = page.getByTestId('shop-icon')
  await expect(icon.getByRole('img', { name: 'Shop icon' })).toHaveCount(0, slow)
  await icon.locator('input[type=file]').setInputFiles(fixture)
  await expect(icon.getByRole('img', { name: 'Shop icon' })).toBeVisible(slow)
  await icon.getByRole('button', { name: 'Remove icon' }).click()
  await expect(icon.getByRole('img', { name: 'Shop icon' })).toHaveCount(0, slow)
})

test('Make my icon with AI off explains and keeps the monogram', async ({ page }) => {
  await openDetails(page)
  const icon = page.getByTestId('shop-icon')
  await icon.getByRole('button', { name: 'Make my icon' }).click()
  await expect(icon.getByRole('alert')).toBeVisible()
  await expect(icon.getByRole('img', { name: 'Shop icon' })).toHaveCount(0, slow)
})

test('offline: icon actions say so instead of freezing', async ({ page, context }) => {
  await openDetails(page)
  await context.setOffline(true)
  const icon = page.getByTestId('shop-icon')
  await icon.getByRole('button', { name: 'Make my icon' }).click()
  await expect(icon.getByRole('alert')).toContainText('offline')
  await context.setOffline(false)
})
