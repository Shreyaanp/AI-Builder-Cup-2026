import { expect, test, type Page } from '@playwright/test'
import { createShop } from './stories/support.js'

// Issue #82: a photo in the normal coach chat is classified (offline fixture: the image width
// stands in for what it shows), confirmed in one line with correction chips, then routed to the
// existing action. Fixture widths: 21 shop, 22 product, 23 receipt, 24 till, 25 other, else menu.
test.skip(({ isMobile }) => !isMobile, '360px phone layout')

async function photo(page: Page, width: number, name = `photo-${width}.png`) {
  const url = await page.evaluate((size) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = 40
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f0c878'
    context.fillRect(0, 0, size, 40)
    return canvas.toDataURL('image/png')
  }, width)
  return { name, mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') }
}

async function ready(page: Page) {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).tap()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).tap()
  await createShop(page, 'name: Asha Bakery')
}

const send = async (page: Page, width: number) =>
  page
    .locator('input[type=file]')
    .first()
    .setInputFiles(await photo(page, width))

test('chat photo: confirmed in one line, corrected with chips, routed, never lost', async ({
  page,
}) => {
  await ready(page)
  const group = page.getByRole('group', { name: 'What is this photo?' })

  // A till photo is recognised, confirmed, then opens Close the day with the photo read.
  await send(page, 24)
  await expect(page.getByText('Looks like: Till report. Is that right?')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await group.getByRole('button', { name: 'Till report' }).tap()
  const day = page.getByRole('dialog', { name: 'Close the day' })
  await expect(day.getByText(/\d+ lines$/)).toBeVisible({ timeout: 20_000 })
  await day
    .getByRole('button', { name: 'Close', exact: true })
    .tap()
    .catch(() => undefined)
  await page.keyboard.press('Escape')

  // A product guess can be corrected to a menu: the chip decides, not the guess.
  await send(page, 22)
  await expect(page.getByText('Looks like: Product. Is that right?')).toBeVisible()
  await group.getByRole('button', { name: 'Menu' }).tap()
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toBeVisible()
  await page.keyboard.press('Escape')

  // A shop photo uses the existing gallery offer (visible to customers only after a tap).
  await send(page, 21)
  await expect(page.getByText('Looks like: Shop photo. Is that right?')).toBeVisible()
  await group.getByRole('button', { name: 'Shop photo' }).tap()
  await expect(page.getByText('Add this photo to your shop gallery?')).toBeVisible()
})

test('chat photo: unknown photo is kept and the owner picks where it goes', async ({ page }) => {
  await ready(page)
  await send(page, 25)
  await expect(page.getByText(/not sure what this photo is/)).toBeVisible()
  const group = page.getByRole('group', { name: 'What is this photo?' })
  await expect(group.getByRole('button')).toHaveCount(6)
  // Nothing was saved or routed by a guess.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await group.getByRole('button', { name: 'Receipt' }).tap()
  const day = page.getByRole('dialog', { name: 'Close the day' })
  await expect(day.getByText(/\d+ lines$/)).toBeVisible({ timeout: 20_000 })
})
