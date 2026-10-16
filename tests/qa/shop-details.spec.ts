import { test, expect, owner, enter, confirm, audit, tamil } from './support.js'
import { createShop, editShopDetails, gpsBoardPath, share, closeSheet } from '../stories/support.js'

test('hours, custom payment and delivery are reviewed then appear on the shared QR page', async ({
  page,
}) => {
  await enter(page)
  await createShop(page, 'name: QA hours and facts')
  await editShopDetails(page)
  await page.getByLabel('Address or area').fill('Indiranagar, Bengaluru')
  await page.getByLabel('Set hours by weekday').check()
  await page.getByLabel('Opens', { exact: true }).fill('07:00')
  await page.getByLabel('Closes', { exact: true }).fill('20:00')
  const payment = page.getByRole('combobox', { name: 'Payment', exact: true })
  await payment.fill('QA Pay')
  await payment.press('Enter')
  const delivery = page.getByRole('combobox', { name: 'Delivery', exact: true })
  await delivery.fill('Neighbour delivery')
  await delivery.press('Enter')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('07:00')
  await expect(review).toContainText('20:00')
  await review.getByRole('button', { name: /Find.*pin/i }).click()
  await expect(review).toContainText(/Indiranagar/)
  await confirm(page)
  const url = await share(page)
  expect(new URL(url).port).toBe(process.env.WEB_PORT ?? '3437')
  await closeSheet(page)
  await page.goto(url)
  await expect(page.getByText('QA Pay', { exact: true })).toBeVisible()
  await expect(page.getByText('Delivery via Neighbour delivery', { exact: true })).toBeVisible()
  await audit(page)
})

test('existing-shop photo GPS is a separate exact approval, never an automatic move', async ({
  page,
}) => {
  const id = await owner(page)
  const before = (await (await page.request.get('/api/v1/businesses')).json())[0]
  await page.locator('#coach input[type=file]').setInputFiles(gpsBoardPath)
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).not.toContainText('12.97180, 77.64120')
  await confirm(page)
  const unchanged = (await (await page.request.get('/api/v1/businesses')).json())[0]
  expect(unchanged.fields.location).toBe(before.fields.location)
  await page.getByRole('button', { name: 'Review photo location' }).click()
  await expect(review).toContainText('12.97180, 77.64120')
  await confirm(page)
  expect((await (await page.request.get('/api/v1/businesses')).json())[0].id).toBe(id)
})

test('Tamil shop details labels and spacing survive text scaling', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  // Change locale after closing the current sheet, then reopen the translated detail sheet.
  await page.keyboard.press('Escape')
  await tamil(page)
  await page.addStyleTag({ content: 'html { font-size: 125%; }' })
  await audit(page)
})
