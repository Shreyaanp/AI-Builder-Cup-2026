import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Live check only (not committed): real Gemini behind a local backend.
const scratch = process.env.LIVE_SCRATCH!
const menu = readFileSync(`${scratch}/menu.jpg`)
const till = readFileSync(`${scratch}/till.jpg`)

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' })
test.skip(({ isMobile }) => !isMobile, 'phone only')
test('live owner: register from a menu photo, import, close the day', async ({ page }) => {
  test.setTimeout(240_000)
  page.on('response', async (r) => {
    if (r.url().includes('/day/')) console.log('DAY', r.status(), (await r.text()).slice(0, 300))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).tap()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).tap()

  // 1. Register a shop by photographing its menu board.
  await page.locator('#coach input[type="file"]').setInputFiles({
    name: 'menu.jpg',
    mimeType: 'image/jpeg',
    buffer: menu,
  })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible({ timeout: 90_000 })
  await page.screenshot({ path: 'output/live/1-menu-review.png' })
  await expect(review).toContainText(/Masala chai/i)
  await expect(review).toContainText('₹20')
  await review.getByRole('button', { name: 'Confirm and save' }).tap()
  await expect(review).toHaveCount(0, { timeout: 20_000 })

  // 2. My shop shows the menu read from the photo.
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await page.getByRole('button', { name: /^Menu/ }).tap()
  await expect(page.getByText('Filter coffee', { exact: true }).last()).toBeVisible()
  await page.screenshot({ path: 'output/live/2-menu-saved.png' })
  await page.keyboard.press('Escape')

  // 3. Close the day from a till report photo.
  await page.getByRole('button', { name: /^Close the day/ }).tap()
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: /Till or POS report/ }).tap()
  await dialog
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'till.jpg', mimeType: 'image/jpeg', buffer: till })
  await expect(dialog.getByText(/\d+ lines$/)).toBeVisible({ timeout: 90_000 })
  await dialog.getByRole('button', { name: /^Review/ }).tap()
  await page.screenshot({ path: 'output/live/3-day-review.png' })
  await expect(dialog).toContainText(/Masala chai/i)
  await expect(dialog.getByText(/Offline mode/)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Save day' }).tap()
  await expect(dialog.getByText('Day closed')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'output/live/4-day-closed.png' })
})
