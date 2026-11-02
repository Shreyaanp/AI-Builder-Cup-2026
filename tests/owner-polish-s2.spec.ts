import { test, expect, type Page } from '@playwright/test'

// Owner app polish from the live walk-through (O-6..O-15), in the public demo at 390x844.
// OB-212 (#569): a touch phone in both projects, so the desktop run can tap() as well.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
test.setTimeout(120_000)

async function openDemo(page: Page, info: { testId: string }) {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `owner-s2-${info.testId}` })
  await page.context().route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('O-6: the Shop details card opens the details sheet', async ({ page }, info) => {
  await openDemo(page, info)
  await page.locator('[data-tour="nav-shop"]').click()
  await page.getByRole('button', { name: /Shop details/ }).tap()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: /Lantern Chai Corner/ })).toBeVisible()
  await sheet.getByRole('button', { name: 'Edit details' }).tap()
  await expect(page.getByRole('dialog').getByRole('textbox').first()).toBeVisible()
})

test('O-7: switching to Hindi shows no reminder error', async ({ page }, info) => {
  await openDemo(page, info)
  await page.locator('[data-tour="nav-you"]').click()
  await expect(page.locator('#reminder-status')).toContainText('In the demo')
  await page.getByRole('combobox', { name: /Language/ }).click()
  await page.getByRole('option', { name: 'हिन्दी' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await expect(page.locator('#reminder-status')).toContainText('डेमो')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('बदलाव नहीं हुआ')).toHaveCount(0)
})

test('O-8: deleting data in the demo says plainly it is pretend', async ({ page }, info) => {
  await openDemo(page, info)
  await page.locator('[data-tour="nav-you"]').click()
  await page.getByRole('button', { name: /Privacy & your data/ }).tap()
  await expect(page.getByText('In the demo this is pretend: nothing is sent')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete all my data' })).toHaveCount(0)
})

test('O-9: How this works opens the forecast explainer', async ({ page }, info) => {
  await openDemo(page, info)
  await page.getByRole('button', { name: 'How this works' }).first().tap()
  const sheet = page.getByRole('dialog', { name: 'How this works' })
  await expect(sheet).toContainText('based on how your shop sold in recent weeks')
  await sheet.getByRole('button', { name: 'Close', exact: true }).tap()
  await expect(sheet).toHaveCount(0)
})

test('O-10 and O-11: approving a reorder says it is sent; whole rupees have no .00', async ({
  page,
}, info) => {
  await openDemo(page, info)
  await page.locator('[data-tour="nav-grow"]').click()
  // OB-212 (#569): the demo week is the last 7 days of date-seeded sales, so the total moves
  // every day (₹44,552 was 25 Oct only). Assert a whole-rupee amount, never one day's figure.
  await expect(
    page.getByRole('button', { name: /Your week\D*₹\d{1,3}(,\d{2,3})*(?![\d.,])/ }),
  ).toBeVisible()
  await expect(page.getByText(/₹[\d,]+\.00/)).toHaveCount(0)
  await page.getByRole('button', { name: /^Purchase orders/ }).tap()
  await page.getByRole('button', { name: 'Draft a reorder' }).tap()
  const order = page.getByRole('dialog').getByRole('article').first()
  await expect(order.getByText(/₹[\d,]+\.00/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Approve and send' }).tap()
  const note = page.getByRole('status').filter({ hasText: 'Marked Sent' })
  await expect(note).toContainText('pretend WhatsApp message')
  await expect(page.getByRole('dialog').getByText('Sent', { exact: true }).first()).toBeVisible()
})

test('O-15: the last tour step has exactly two buttons', async ({ page }, info) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `owner-s2-${info.testId}` })
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()
  const tour = page.getByRole('dialog')
  await expect(tour.getByText('1 of 7')).toBeVisible({ timeout: 30_000 })
  for (let step = 0; step < 7; step++) await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByRole('heading', { name: 'You’re ready' })).toBeVisible()
  const buttons = tour.getByRole('button')
  await expect(buttons).toHaveCount(2)
  await expect(buttons.nth(0)).toHaveText('Start my own shop')
  await expect(buttons.nth(1)).toHaveText('Keep exploring')
})
