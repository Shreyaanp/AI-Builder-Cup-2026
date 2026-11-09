import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

// A rupee shop on a phone: the product price field reads amounts like every other field.
test.use({
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  reducedMotion: 'reduce',
  viewport: { width: 360, height: 800 },
})

test('PR 701: a price of 1,000 saves ₹1,000; 170/- is ₹170; 1,5 is asked about', async ({
  page,
}) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Menu' })
  await expect(sheet).toBeVisible()
  const kopi = async () =>
    (
      await (
        await page.request.get(
          `/api/v1/businesses/${(await (await page.request.get('/api/v1/businesses')).json())[0].id}/inventory`,
        )
      ).json()
    ).find((item: { name: string }) => item.name === 'Kopi')
  const field = sheet.getByRole('textbox', { name: 'Edit price: Kopi' })

  // "1,000" used to become 1.000 and save ₹1.
  await sheet.getByRole('button', { name: /^Edit price: Kopi, ₹18$/ }).click()
  await expect(field).toHaveValue('18')
  await field.fill('1,000')
  await field.press('Enter')
  await sheet.getByRole('button', { name: 'Save ₹1,000', exact: true }).click()
  await expect(sheet.getByRole('button', { name: /^Edit price: Kopi, ₹1,000$/ })).toBeVisible()
  expect((await kopi()).price).toBe(100000)

  // "170/-" is how a rupee price is written on a board.
  await sheet.getByRole('button', { name: /^Edit price: Kopi, ₹1,000$/ }).click()
  await expect(field).toHaveValue('1000')
  await field.fill('₹170/-')
  await field.press('Enter')
  await sheet.getByRole('button', { name: 'Save ₹170', exact: true }).click()
  await expect(sheet.getByRole('button', { name: /^Edit price: Kopi, ₹170$/ })).toBeVisible()
  expect((await kopi()).price).toBe(17000)

  // A lone comma is a question; nothing is prepared or saved.
  await sheet.getByRole('button', { name: /^Edit price: Kopi, ₹170$/ }).click()
  await field.fill('1,5')
  await field.press('Enter')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(sheet.getByText('Did you mean ₹1.50 or ₹15? Please type it again.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Save / })).toHaveCount(0)
  expect((await kopi()).price).toBe(17000)
})
