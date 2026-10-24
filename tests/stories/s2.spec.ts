import { expect, test } from '@playwright/test'
import {
  closeSheet,
  menuRow,
  confirm,
  enter,
  liveOnly,
  localOnly,
  phone,
  reviewName,
  seedShop,
  share,
  shot,
  tryVoice,
  voiceFixture,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S2 · daily upkeep and customer-page connection', async ({ page, context }) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await voiceFixture(page)
  await enter(page)
  await seedShop(page)
  const url = await share(page)
  await closeSheet(page)
  const customer = await context.newPage()
  await localOnly(customer)
  await customer.goto(url)
  const kopi = menuRow(customer, 'Kopi')
  await expect(kopi).toContainText(/₹18(?![.0-9])/)
  await test.step('1 · natural text and voice path', async () => {
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Press to talk' })).toBeVisible()
    await tryVoice(page, 2)
    // Live voice tool calls were verified against Vertex on 2026-10-15 (propose_products).
    liveOnly('Speech recognition and live voice tool execution')
    await page
      .getByLabel('Message', { exact: true })
      .fill('Kopi is 20 rupees now, kaya toast sold out')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await shot(page, 2, 1)
  })
  await test.step('2 · one review card for both changes, one tap to confirm', async () => {
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toContainText('₹20.00 / cup')
    await expect(review).toContainText(/Kaya toast/i)
    await shot(page, 2, 2)
    await confirm(page)
  })
  await test.step('3 · already-open customer page updates within five seconds', async () => {
    await expect(kopi).toContainText(/₹20(?![.0-9])/, { timeout: 5200 })
    await shot(customer, 2, 3)
  })
  await test.step('4 · sold-out switch reaches customer page', async () => {
    const toast = customer.getByRole('listitem').filter({ hasText: 'Kaya toast' })
    await expect(toast).toContainText('Sold out')
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /^Sold out today/ }).click()
    const available = page.getByRole('switch', { name: 'Available: Kaya toast' })
    await expect(available).not.toBeChecked()
    await available.click()
    await expect(available).toBeChecked()
    await shot(page, 2, 4)
    await closeSheet(page)
    await customer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(toast).not.toContainText('Sold out')
  })
  await test.step('5 · daily still-the-same check', async () => {
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    // While chatting, what needs the owner waits behind one pill under the app bar.
    const pill = page.getByTestId('today-pill')
    if (await pill.isVisible()) await pill.getByRole('button').first().click()
    await expect(page.getByText('Still the same menu today?', { exact: true })).toBeVisible()
    await shot(page, 2, 5)
    await page.getByTestId('today-needs').getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page.getByText('Still the same menu today?', { exact: true })).toHaveCount(0)
    await customer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(customer.getByText('Updated today', { exact: true })).toBeVisible()
  })
  await test.step('6 · tap a price, review inline and save', async () => {
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /^Menu/ }).click()
    await page.getByRole('button', { name: 'Edit price: Kopi, ₹20.00' }).click()
    const price = page.getByRole('textbox', { name: 'Edit price: Kopi' })
    await expect(price).toBeFocused()
    await price.fill('22')
    await price.press('Enter')
    await shot(page, 2, 6)
    await page.getByRole('button', { name: 'Save ₹22.00' }).click()
    await expect(page.getByRole('button', { name: 'Edit price: Kopi, ₹22.00' })).toBeVisible()
  })
  await test.step('7 · document import uses exact review before saving', async () => {
    await page.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
    await page.locator('input[type="file"][accept*=".xlsx"]').setInputFiles({
      name: 'menu.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Item Name,Price\nMasala chai,35\n'),
    })
    await expect(page.getByRole('dialog', { name: reviewName })).toContainText('₹35.00')
    await shot(page, 2, 7)
    await confirm(page)
    await customer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(customer.getByRole('listitem').filter({ hasText: 'Masala chai' })).toContainText(
      /₹35(?![.0-9])/,
    )
    liveOnly('Photo/PDF extraction requires live AI; CSV review is the offline import path')
  })
})
