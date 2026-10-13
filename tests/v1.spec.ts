import { expect, test, type Page } from '@playwright/test'

/** Builds a real PNG in the browser so the backend's decoder and fixture moderation see an image. */
async function png(page: Page, width: number): Promise<Buffer> {
  const url = await page.evaluate((size) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = 40
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f0c878'
    context.fillRect(0, 0, size, 40)
    return canvas.toDataURL('image/png')
  }, width)
  return Buffer.from(url.split(',')[1], 'base64')
}

async function open(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('region', { name: 'Business overview' })).toBeVisible()
}

test('a business is saved only after reviewing the exact proposal', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Add business' }).click()
  await page.getByLabel('Business name').fill('Ram Tea Stall')
  await page.getByRole('button', { name: 'Review first' }).click()
  const review = page.getByRole('dialog', { name: 'Review before saving' })
  await expect(review).toContainText('Nothing is published to Google')
  await expect(page.getByRole('button', { name: 'Open Ram Tea Stall' })).toHaveCount(0)
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('button', { name: 'Open Ram Tea Stall' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: 'Open Ram Tea Stall' })).toBeVisible()
})

test('a shop photo becomes a reviewable draft; an explicit photo is refused', async ({ page }) => {
  await open(page)
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({ name: 'blocked.png', mimeType: 'image/png', buffer: await png(page, 13) })
  await expect(page.getByRole('alert')).toContainText('This photo can’t be used')
  await expect(page.getByRole('dialog', { name: 'Review before saving' })).toHaveCount(0)
  await input.setInputFiles({ name: 'sign.png', mimeType: 'image/png', buffer: await png(page, 64) })
  const review = page.getByRole('dialog', { name: 'Review before saving' })
  await expect(review).toContainText('Offline Fixture Tea Stall')
  await expect(page.getByRole('log')).toContainText('Review the details before saving')
})

test('the coach turns a typed description into a proposal, never a save', async ({ page }) => {
  await open(page)
  await page.getByLabel('Your message').fill('name: Sharma Bakery; category: Bakery; location: Pune')
  await page.getByRole('button', { name: 'Send message' }).click()
  const review = page.getByRole('dialog', { name: 'Review before saving' })
  await expect(review).toContainText('Sharma Bakery')
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Open Sharma Bakery' })).toHaveCount(0)
})
