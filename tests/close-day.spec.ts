import { createShop } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// S2: close the day with photos (offline fixture reads the shop's own items, labelled).
const PHOTO = Buffer.from(
  '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',
  'base64',
)

test.skip(({ isMobile }) => !isMobile, '390×844 phone story')

test('Close the day: till photo, one review, saved', async ({ page }) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).tap()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).tap()
  await createShop(page, 'name: Asha Bakery')
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await page.getByRole('button', { name: /^Close the day/ }).tap()
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await expect(dialog.getByText('Till or POS report')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'docs/stories/S2-close-1-pick.png' })
  await dialog.getByRole('button', { name: /Till or POS report/ }).tap()
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'till.jpg', mimeType: 'image/jpeg', buffer: PHOTO })
  await expect(dialog.getByText(/\d+ lines$/)).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: 'docs/stories/S2-close-2-read.png' })
  await dialog.getByRole('button', { name: /^Review/ }).tap()
  await expect(dialog.getByText('Today’s sales')).toBeVisible()
  await expect(dialog.getByText(/Offline mode/)).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'docs/stories/S2-close-3-review.png' })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  await dialog.getByRole('button', { name: 'Save day' }).tap()
  await expect(dialog.getByText('Day closed')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1300)
  await page.screenshot({ path: 'docs/stories/S2-close-4-done.png' })
  await dialog.getByRole('button', { name: 'Done' }).tap()
  await expect(dialog).toHaveCount(0)
})
