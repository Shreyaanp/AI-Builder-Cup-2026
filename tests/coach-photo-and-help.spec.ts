import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

// OB-37: a large phone photo in the coach chat was sent whole to /photos/classify (413 in
// production) and the coach then looked lost. It is now shrunk first and the coach names the kind.
// OB-38: the "How this works" card leaves the chat once the owner has sent 2 messages in the shop.
// Offline fixture: the image width stands in for what it shows (21 shop, 22 product, else menu).
test.use({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })

async function ready(page: Page) {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log').getByText(text, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
}

test('OB-37: a large chat photo is shrunk before classify and the coach names what it saw', async ({
  page,
}) => {
  await ready(page)
  const big = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4000
    canvas.height = 3000
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = Math.random() * 255
      pixels.data[i + 1] = Math.random() * 255
      pixels.data[i + 2] = Math.random() * 255
      pixels.data[i + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]
  })
  const buffer = Buffer.from(big, 'base64')
  expect(buffer.length).toBeGreaterThan(5_000_000)

  const classify = page.waitForRequest((request) => request.url().includes('/photos/classify'))
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'shop-front.jpg', mimeType: 'image/jpeg', buffer })
  const sent = (await classify).postDataBuffer()
  expect(sent!.length).toBeLessThan(buffer.length / 2)
  await expect(page.getByText(/^Looks like: .+\. Is that right\?$/)).toBeVisible({
    timeout: 20_000,
  })
})

test('OB-37: when classify fails the coach says one clear line with the choices', async ({
  page,
}) => {
  await ready(page)
  await page.route('**/photos/classify', (route) =>
    route.fulfill({ status: 413, json: { code: 'BODY_TOO_LARGE' } }),
  )
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
  await expect(
    page.getByText(
      'I couldn’t tell what this photo shows. Is it your shop front, a menu, or a product?',
    ),
  ).toBeVisible()
  const group = page.getByRole('group', { name: 'What is this photo?' })
  await expect(group.getByRole('button', { name: 'Shop photo' })).toBeVisible()
  await expect(group.getByRole('button', { name: 'Menu', exact: true })).toBeVisible()
  await expect(group.getByRole('button', { name: 'Product' })).toBeVisible()
})

test('OB-38: How this works shows on a fresh chat, goes after 2 messages and stays gone on reload', async ({
  page,
}) => {
  await ready(page)
  const card = page.locator('[data-testid="ai-info"][data-feature="coach"]')
  await say(page, 'what sells best')
  await expect(card).toBeVisible()
  await say(page, 'and on weekends')
  await expect(card).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page
    .getByLabel('I agree to the Terms')
    .check({ timeout: 2000 })
    .catch(() => undefined)
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
  await expect(card).toHaveCount(0)
})
