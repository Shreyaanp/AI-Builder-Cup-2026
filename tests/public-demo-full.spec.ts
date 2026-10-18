import { test, expect, type Page } from '@playwright/test'

// Issues #280-#289: /demo is the full owner app on the visitor's own sandbox, at 390 px.
test.setTimeout(120_000)

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `demo-full-${info.testId}` })
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
})

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('public demo walks the whole owner lifecycle at 390 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const realApi: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (
      path.startsWith('/api/') &&
      !path.startsWith('/api/v1/demo/') &&
      path !== '/api/v1/bootstrap'
    )
      realApi.push(path)
  })
  await page.goto('/demo')
  await expect(page.getByText('Demo shop - nothing here is real', { exact: true })).toBeVisible({
    timeout: 30_000,
  })

  // #289: the first screen offers the guided tour.
  const welcome = page.getByRole('dialog')
  await expect(welcome.getByRole('button', { name: 'Take the tour' })).toBeVisible({
    timeout: 30_000,
  })
  await page.screenshot({ path: 'output/playwright/demo-full-01-welcome.png' })
  await welcome.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // #286, #287: the owner bottom navigation.
  const nav = page.getByRole('navigation').last()
  for (const id of ['coach', 'shop', 'grow', 'you'])
    await expect(page.locator(`[data-tour="nav-${id}"]`)).toBeVisible()
  await expect(nav).toBeVisible()
  await noSideScroll(page)

  // #280: the coach answers in the demo (offline instant answers).
  const box = page.getByRole('textbox').last()
  await box.fill('Show my purchase orders')
  await box.press('Enter')
  await expect(page.locator('main')).toContainText(/purchase order|Purchase orders/i, {
    timeout: 30_000,
  })
  await page.screenshot({ path: 'output/playwright/demo-full-02-coach.png' })

  // #286, #281, #283, #284: Grow → Purchase orders with the WhatsApp PO, timeline and SAP view.
  await page.locator('[data-tour="nav-grow"]').click()
  await noSideScroll(page)
  await page.screenshot({ path: 'output/playwright/demo-full-03-grow.png', fullPage: true })
  await page.locator('[data-tour="supply"]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/Sri Lakshmi/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Demo: not sent')).toHaveCount(0)
  // #282: draft a reorder inside the sandbox.
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  await expect(sheet.locator('article')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'output/playwright/demo-full-04-reorder.png' })
  await sheet.getByRole('button', { name: 'Purchase orders' }).first().click()
  await sheet
    .getByText(/Sri Lakshmi/)
    .first()
    .click()
  await expect(sheet.locator('article')).toBeVisible()
  await page.screenshot({ path: 'output/playwright/demo-full-05-timeline.png', fullPage: true })
  await sheet.getByRole('button', { name: 'Purchase orders' }).first().click()
  await expect(sheet.getByText(/SAP/).first()).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'output/playwright/demo-full-06-sap.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // #285: Close the day opens on Grow.
  await page.locator('[data-tour="closeday"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: 'output/playwright/demo-full-07-closeday.png' })
  await page.keyboard.press('Escape')

  // #287, #288: You → settings with the reminders control; #289: Take the tour.
  await page.locator('[data-tour="nav-you"]').click()
  await noSideScroll(page)
  await page.screenshot({ path: 'output/playwright/demo-full-08-you.png', fullPage: true })
  await expect(page.getByText(/Remind/i).first()).toBeVisible()
  await page.getByRole('button', { name: 'Take the tour' }).first().click()
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'output/playwright/demo-full-09-tour.png' })

  expect(realApi).toEqual([])
  expect(errors).toEqual([])
})
