import { expect, test } from '@playwright/test'
import {
  closeSheet,
  confirm,
  enter,
  gap,
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
  const kopi = customer.getByRole('listitem').filter({ hasText: 'Kopi' })
  await expect(kopi).toContainText('₹18.00')
  await test.step('1 · natural text and voice path', async () => {
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Press to talk' })).toBeVisible()
    await tryVoice(page, 2)
    liveOnly('Voice tool execution and ASR; daily text fixture is also incomplete')
    await page
      .getByLabel('Message', { exact: true })
      .fill('Kopi is two dollars now, kaya toast sold out')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('This is a scripted reply')
    await expect(page.getByRole('dialog', { name: reviewName })).toHaveCount(0)
    gap(
      'S2/1–2: offline coach does not propose price or availability edits; manual review below is a fallback',
    )
    await shot(page, 2, 1)
  })
  await test.step('2 · confirm a reviewed price via the manual fallback', async () => {
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    await page.getByRole('button', { name: /^Menu/ }).click()
    await page.getByRole('button', { name: /^Edit Kopi/ }).click()
    await page.getByLabel(/^Price/).fill('20')
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await expect(page.getByRole('dialog', { name: reviewName })).toContainText('₹20.00 / cup')
    await shot(page, 2, 2)
    await confirm(page)
  })
  await test.step('3 · already-open customer page updates within five seconds', async () => {
    await expect(kopi).toContainText('₹20.00', { timeout: 5200 })
    await shot(customer, 2, 3)
  })
  await test.step('4 · sold-out switch reaches customer page', async () => {
    await page.getByRole('button', { name: /^Sold out today/ }).click()
    const available = page.getByRole('switch', { name: 'Available: Kaya toast' })
    await available.click()
    await expect(available).not.toBeChecked()
    await shot(page, 2, 4)
    await closeSheet(page)
    await customer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(customer.getByRole('listitem').filter({ hasText: 'Kaya toast' })).toContainText(
      'Sold out',
    )
  })
  await test.step('5 · daily still-the-same check', async () => {
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await expect(page.getByText('Still the same menu today?', { exact: true })).toBeVisible()
    await shot(page, 2, 5)
    await page.getByRole('button', { name: 'Yes, all good' }).click()
    await expect(page.getByText('Still the same menu today?', { exact: true })).toHaveCount(0)
    await customer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(customer.getByText('Updated today', { exact: true })).toBeVisible()
  })
  await test.step('6 · tap a price, review inline and save', async () => {
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
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
      '₹35.00',
    )
    liveOnly('Photo/PDF extraction requires live AI; CSV review is the offline import path')
  })
})
