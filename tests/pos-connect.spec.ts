import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { confirm, enter, localOnly, reviewName, seedShop } from './stories/support.js'

const posExport = fileURLToPath(
  new URL('../backend/tests/fixtures/connect/pos_menu.csv', import.meta.url),
)

test('owner connects a POS export, reviews mappings, and sees imported menu items', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)

  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /Connect your system/i }).click()

  const connect = page.getByRole('dialog', { name: 'Connect your system' })
  await expect(connect).toBeVisible()
  await connect.getByRole('button', { name: 'Petpooja', exact: true }).click()
  await connect.getByTestId('connector-file').setInputFiles({
    name: 'pos-menu.csv',
    mimeType: 'text/csv',
    buffer: readFileSync(posExport),
  })

  await expect(connect.getByText('Column mapping')).toBeVisible()
  await expect(connect.getByText(/AI column mapping/i)).toHaveCount(0)
  await expect(connect.getByText(/Gemini mapped your export/i)).toHaveCount(0)
  await expect(connect.getByText('Item name: Masala Dosa', { exact: true })).toBeVisible()
  const categoryRow = connect.getByRole('listitem').filter({ hasText: 'Category' })
  await categoryRow.getByRole('button', { name: 'Change mapped field' }).click()
  await categoryRow.getByRole('button', { name: 'Ignore', exact: true }).click()
  await expect(connect.getByText('Category: South Indian')).toHaveCount(0)

  await connect.getByRole('button', { name: 'Confirm & review import' }).click()
  const review = page.getByRole('dialog', { name: reviewName })
  await expect(review).toContainText('Masala Dosa')
  await expect(review).toContainText('Gulab Jamun')
  await confirm(page)

  await page.getByRole('button', { name: /^Menu/ }).click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu).toContainText('Masala Dosa')
  await expect(menu).toContainText('Mango Lassi')
})

test('linked local fonts load without dev-server errors', async ({ page }) => {
  test.setTimeout(60_000)
  await localOnly(page)
  const fontResponses: number[] = []
  page.on('response', (response) => {
    if (response.url().includes('/@fs/') && /\.(woff2?|ttf)(\?|$)/i.test(response.url()))
      fontResponses.push(response.status())
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.load('16px "Google Sans Flex Variable"'))
  expect(fontResponses.length).toBeGreaterThan(0)
  expect(fontResponses).toEqual(fontResponses.map(() => 200))
})

test('POS connection labels stay in the selected Hindi locale', async ({ page }) => {
  await localOnly(page)
  await page.route('**/api/v1/businesses/*/connect/mappings', (route) =>
    route.fulfill({
      json: [{ source_label: 'Petpooja', last_synced: Math.floor(Date.now() / 1000) }],
    }),
  )
  await enter(page)
  await seedShop(page)

  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'हिन्दी' }).click()
  await page.getByRole('button', { name: 'दुकान', exact: true }).click()
  await page.getByRole('button', { name: /अपना सिस्टम जोड़ें/ }).click()

  const connect = page.getByRole('dialog', { name: 'अपना सिस्टम जोड़ें' })
  await expect(connect.getByText('अपना सिस्टम चुनें')).toBeVisible()
  await expect(connect.getByRole('button', { name: 'बंद करें' })).toBeVisible()
  await expect(connect.getByText('Close', { exact: true })).toHaveCount(0)
  await expect(connect.getByText('जुड़ा है', { exact: true })).toBeVisible()
  await expect(connect.getByText('Connected', { exact: true })).toHaveCount(0)
})

test('owner confirms a POS sales export and sees it in Grow', async ({ page }) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)

  const business = (
    await page.request.get('/api/v1/businesses').then((response) => response.json())
  )[0]
  const freshness = await page.request
    .get(`/api/v1/businesses/${business.id}/freshness`)
    .then((response) => response.json())
  const [year, week] = (freshness.recap_week as string).split('-W').map(Number)
  const fourth = new Date(Date.UTC(year!, 0, 4))
  const day = fourth.getUTCDay() || 7
  fourth.setUTCDate(fourth.getUTCDate() - day + 1 + (week! - 1) * 7)
  const recapDate = fourth.toISOString().slice(0, 10)
  const salesFixture = readFileSync(
    fileURLToPath(new URL('../backend/tests/fixtures/connect/pos_sales.csv', import.meta.url)),
    'utf8',
  )
    .replace('2026-10-17', freshness.today)
    .replace('2026-10-16', recapDate)

  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /Connect your system/i }).click()
  const connect = page.getByRole('dialog', { name: 'Connect your system' })
  await connect.getByRole('button', { name: 'Tally', exact: true }).click()
  await connect.getByTestId('connector-file').setInputFiles({
    name: 'pos-sales.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(salesFixture),
  })

  await expect(connect.getByText('Column mapping')).toBeVisible()
  await expect(connect.getByText('Quantity sold', { exact: true })).toBeVisible()
  await connect.getByRole('button', { name: 'Confirm & review import' }).click()

  const summary = page.getByRole('dialog', { name: 'Sales summary' })
  await expect(summary).toContainText('Nothing was saved')
  await expect(summary).toContainText('Kopi')
  await expect(summary).toContainText('₹')
  await summary.getByRole('button', { name: 'Save these sales' }).click()
  await expect(summary.getByRole('status')).toBeVisible()
  await expect(summary.getByRole('status')).toContainText('2 sales · 1 item imported')

  const saved = await page.request
    .get(`/api/v1/businesses/${business.id}/sales`)
    .then((response) => response.json())
  expect(saved).toHaveLength(2)
  await summary.getByRole('button', { name: 'Close' }).last().click()

  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  const today = page.getByTestId('today-pulse')
  await expect(today).toContainText('Today so far')
  await expect(today).toContainText('54')
  await expect(today).toContainText('₹')

  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Weekly recap/ }).click()
  const recap = page.getByRole('dialog', { name: 'Weekly recap' })
  await expect(recap).toContainText('Kopi')
  await expect(recap).toContainText('sales days saved')
})
