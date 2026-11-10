import { expect, test, type Page } from '@playwright/test'

// OB-223, OB-265: a supplier list can be opened, compared in one unit and saved, by tap and by
// chat, and the two stay in step. Nothing is drafted until the owner picks a supplier.

test.setTimeout(120_000)
test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata' })

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `supply-${info.testId}-${Math.random()}` })
})

async function openDemo(page: Page, language = 'en', width = 390, height = 844) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(
    (lang) => localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: lang })),
    language,
  )
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button').last().click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function say(page: Page, text: string) {
  await page.locator('textarea[name="message"]').fill(text)
  await page.locator('form button[type="submit"]').last().click()
}

/** The list arrives folded when newer cards follow it; open it if so. */
async function vendorList(page: Page) {
  const open = page.getByRole('button', { name: /^Open .+/ }).first()
  await expect(async () => {
    if (!(await open.isVisible())) {
      await page
        .getByRole('button', { name: /Suppliers for/ })
        .last()
        .click({ timeout: 1_000 })
    }
    await expect(open).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 45_000 })
}

test('OB-265 finding suppliers lists them and drafts nothing', async ({ page }) => {
  await openDemo(page)
  await say(page, 'Find suppliers for milk')
  await vendorList(page)
  await expect(page.getByText('Order request')).toHaveCount(0)
  await expect(page.getByText('Cheapest', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Nearest', { exact: true }).first()).toBeVisible()
})

test('OB-265 Compare lines every supplier up in one unit', async ({ page }) => {
  await openDemo(page, 'en', 360, 800)
  await say(page, 'Find suppliers for milk')
  await vendorList(page)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const table = page.getByTestId('compare-suppliers')
  await expect(table).toBeVisible()
  const prices = await table.locator('tbody td:first-of-type').allInnerTexts()
  expect(prices.length).toBeGreaterThan(1)
  for (const price of prices) expect(price).toMatch(/\/\s*(litre|l)\b/i)
  // Never wider than the phone.
  const box = await table.boundingBox()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360)
})

test('OB-223 open a supplier, save it, and it is on My suppliers at once', async ({ page }) => {
  await openDemo(page)
  await say(page, 'Find suppliers for milk')
  await vendorList(page)
  const open = page.getByRole('button', { name: /^Open .+/ }).first()
  const name = ((await open.getAttribute('aria-label')) ?? '').replace(/^Open /, '')
  await open.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('What they sell')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Order', exact: true })).toBeInViewport()
  await sheet.getByRole('button', { name: 'Save as my supplier' }).click()
  await expect(sheet.getByRole('button', { name: 'Remove from my suppliers' })).toBeVisible()
  await sheet
    .getByRole('button', { name: /close|back/i })
    .first()
    .click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await page.getByRole('navigation').last().getByText('Shop').click()
  await page.locator('[data-tour="supply"]').click()
  await page.getByRole('button', { name: /My suppliers/ }).click()
  await expect(page.getByRole('dialog').getByText(name).first()).toBeVisible()
})

test('OB-223 saved by chat shows as saved on the card with no reload', async ({ page }) => {
  await openDemo(page)
  await say(page, 'Find suppliers for milk')
  await vendorList(page)
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0)
  await say(page, 'save the first one')
  await expect(page.getByText(/is on My suppliers now/)).toBeVisible({ timeout: 30_000 })
  await vendorList(page)
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
})

test('OB-265 the compare question answers from the list, in English', async ({ page }) => {
  await openDemo(page)
  await say(page, 'Find suppliers for milk')
  await vendorList(page)
  await say(page, 'Which one is cheapest and which is nearest?')
  await expect(page.getByText(/Cheapest: .+ Nearest: /)).toBeVisible({ timeout: 30_000 })
})

test('OB-265 Hindi: tags and compare in Hindi', async ({ page }) => {
  await openDemo(page, 'hi', 360, 800)
  await say(page, 'दूध के लिए सप्लायर खोजो')
  const open = page.getByRole('button', { name: / खोलें$/ }).first()
  await expect(async () => {
    if (!(await open.isVisible()))
      await page
        .getByRole('button', { name: /सप्लायर|Suppliers/ })
        .last()
        .click({ timeout: 1_000 })
    await expect(open).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 45_000 })
  await expect(page.getByText('सबसे सस्ता', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'तुलना करें', exact: true }).click()
  await expect(page.getByTestId('compare-suppliers')).toContainText('दाम')
})

test('OB-224 the runs-out card orders in place, never a second supplier search', async ({
  page,
}) => {
  // A forecast shortage nothing is on order for, as Today and this card both read it.
  await page.route(/\/supply(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    const body = await response.json()
    const need = {
      item: 'Milk',
      runs_out: '2030-01-03',
      stock: 2,
      stock_known: true,
      daily: 4,
      method: 'weekday_average',
      supplied: true,
      on_order: 0,
      arrives: '',
      on_order_other: [],
      cover: 'none',
      covered: false,
    }
    await route.fulfill({ response, json: { ...body, needs: [need], to_order: [] } })
  })
  const drafted: string[] = []
  await page.route(/\/supply\/reorder$/, async (route) => {
    drafted.push(String(route.request().postDataJSON()?.item ?? ''))
    await route.fulfill({ json: { status: 'on_order', item: 'Milk', unit: 'litre', quantity: 5 } })
  })
  await openDemo(page)
  await page.locator('[data-tour="nav-shop"]').click()
  await page.locator('[data-tour="supply"]').first().click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^Milk runs out/ }).click()
  await expect.poll(() => drafted).toEqual(['Milk'])
  // Still in Buy stock: no message went to the coach.
  await expect(sheet).toBeVisible()
  await expect(page.getByText('My milk is running low')).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
