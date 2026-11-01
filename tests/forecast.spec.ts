import { createShop } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

async function shop(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await createShop(page, 'name: Ah Seng Kopi')
  return page.request
    .get('/api/v1/businesses')
    .then((r) => r.json())
    .then((rows) => rows[0].id as string)
}

test('Prep plan uses approved sales, labels its method and passes axe on phone', async ({
  page,
}) => {
  const bid = await shop(page)
  const freshness = await page.request
    .get(`/api/v1/businesses/${bid}/freshness`)
    .then((r) => r.json())
  const today = new Date(`${freshness.today}T12:00:00Z`)
  const rows = Array.from({ length: 28 }, (_, i) => {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() - i)
    return `${day.toISOString().slice(0, 10)},Kopi,30,54`
  })
  const proposed = await page.request
    .post(`/api/v1/businesses/${bid}/import`, {
      data: `Date,Item,Qty,Revenue\n${rows.join('\n')}`,
      headers: { 'Content-Type': 'text/csv' },
    })
    .then((r) => r.json())
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const tile = page.getByRole('button', { name: /^Prep plan/ })
  await expect(tile).toContainText('Import and save at least 4 weeks')
  await page.request.post(`/api/v1/businesses/${bid}/import/${proposed.import_id}/approve`, {
    data: { digest: proposed.digest },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect(tile).toContainText('Kopi · 30')
  await expect(tile).toContainText('Based on your last weeks')
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await tile.click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'How much should I prep tomorrow?',
  )
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText(/Kopi: 30 item.*Method: weekday average/)).toBeVisible()
  // The numbers behind the answer, drawn as a chart card in the chat (owner, 16 Oct).
  const chart = page.getByRole('figure', { name: /^Forecast chart: Kopi/ })
  await expect(chart).toBeVisible()
  await expect(chart).toContainText('Next 7 days')
  await expect(chart).toContainText('Based on your last weeks')
  await chart.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await page.screenshot({
    path: `docs/stories/coach-chart-forecast-${test.info().project.name}.png`,
  })
  const chartAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(chartAudit.violations).toEqual([])
})

test('phone import offers capture and pasted notes with review warnings before saving', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Camera capture is a phone entry point')
  const bid = await shop(page)
  const proposed = await page.request
    .post(`/api/v1/businesses/${bid}/import`, {
      data: 'Date,Item,Qty,Revenue\n2026-10-14,Kopi,30,54',
      headers: { 'Content-Type': 'text/csv' },
    })
    .then((r) => r.json())
  await page.route(`**/businesses/${bid}/import`, async (route) => {
    expect(route.request().headers()['content-type']).toBe('text/plain')
    expect(route.request().postData()).toBe('14 Oct 2026 Kopi 30 cups $54')
    await route.fulfill({
      json: { ...proposed, flags: [{ row: 1, item: 'Kopi', reasons: ['extraction'] }] },
    })
  })
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
  await expect(page.getByRole('button', { name: 'Take photo', exact: true })).toBeVisible()
  await expect(page.locator('input[capture="environment"]')).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp',
  )
  await page.getByLabel('Paste sales or menu notes').fill('14 Oct 2026 Kopi 30 cups $54')
  const formAudit = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(formAudit.violations).toEqual([])
  await page.getByRole('button', { name: 'Review notes', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Sales summary' })
  await expect(review).toContainText('Check uncertain rows carefully: 1: Kopi')
  expect(await page.request.get(`/api/v1/businesses/${bid}/sales`).then((r) => r.json())).toEqual(
    [],
  )
  const audit = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(audit.violations).toEqual([])
  await review.getByRole('button', { name: 'Save these sales', exact: true }).click()
  await expect(review).not.toBeVisible()
})
