import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// OB-310: stock in plain sight. Every menu item shows "4 left" with − / + that save at once and
// a named note with Undo; tea dust and milk the shop buys live in "Things I buy", never on the
// customer menu or page; "Make more" asks about now ("Made 20"). Phone widths, en + hi.
test.setTimeout(120_000)
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob310-${info.testId}-${Math.random()}` })
})
// A tap's reload may still be fetching Today when a test ends.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

async function openDemo(page: Page, width: number, language: 'en' | 'hi' = 'en') {
  await page.setViewportSize({ width, height: width === 360 ? 800 : 844 })
  await page.addInitScript(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance: 'light' },
  )
  // A playbook that leads with stock, so the low row is on Today whatever else is pending.
  await page.route('**/businesses/*/today', async (route) => {
    const response = await route.fetch()
    const real = await response.json()
    await route.fulfill({
      response,
      json: {
        ...real,
        hints: {
          focus: null,
          pulse: ['sales'],
          line_topics: [],
          needs_you: ['low_stock', 'questions', 'menu_check', 'missing_info'],
          metrics: ['sales'],
          units: [],
        },
      },
    })
  })
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Skip|छोड़ें)$/ })
    .click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

async function openMenu(page: Page, menu = 'Menu') {
  await page.locator('[data-tour="nav-shop"]').click()
  await expect(page.getByTestId('shop-tiles')).toBeVisible()
  await page
    .getByTestId('shop-tiles')
    .getByRole('button', { name: new RegExp(`^${menu}`) })
    .click()
  const sheet = page.getByRole('dialog', { name: menu })
  await expect(sheet).toHaveCSS('transform', 'none')
  return sheet
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  for (const button of await page.getByRole('dialog').last().getByRole('button').all()) {
    if (!(await button.isVisible())) continue
    const box = (await button.boundingBox())!
    expect(box.x + box.width, await button.innerText()).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    )
  }
}

test('OB-310: − / + save at once with a named Undo; tea dust is in Things I buy', async ({
  page,
}) => {
  await openDemo(page, 390)
  const sheet = await openMenu(page)
  const bun = sheet.locator('[data-menu-card="Bun maska"]')
  await expect(bun.locator('[data-stock="Bun maska"]')).toHaveText('4 left')
  // Below what usually sells today: said gently, never red.
  await expect(bun.getByText('Running low')).toBeVisible()
  const plus = bun.getByRole('button', { name: 'One more Bun maska' })
  const minus = bun.getByRole('button', { name: 'One less Bun maska' })
  for (const control of [plus, minus]) {
    const box = (await control.boundingBox())!
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(48)
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(48)
  }
  // Saved, not just shown: the sandbox answers each tap with the stored count.
  const saved = () =>
    page.waitForResponse((r) => r.url().includes('/stock') && r.request().method() === 'POST')
  let response = saved()
  await plus.click()
  await expect(bun.locator('[data-stock="Bun maska"]')).toHaveText('5 left')
  expect((await (await response).json()).stock).toBe(5)
  const note = page.getByRole('alert').filter({ hasText: 'Bun maska: 5 left' })
  await expect(note).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('menu-stepper-390.png') })
  response = saved()
  await note.getByRole('button', { name: 'Undo' }).click()
  await expect(bun.locator('[data-stock="Bun maska"]')).toHaveText('4 left')
  expect((await (await response).json()).stock).toBe(4)
  const again = sheet

  // Tea dust is something the stall buys: off the menu, in its own list.
  await expect(again.locator('[data-menu-card="Tea dust"]')).toHaveCount(0)
  await again.getByRole('button', { name: /^Things I buy/ }).click()
  const things = page.getByRole('dialog', { name: 'Things I buy' })
  await expect(things).toHaveCSS('transform', 'none')
  await expect(things.locator('[data-menu-card="Tea dust"]')).toBeVisible()
  await expect(things.locator('[data-menu-card="Masala chai"]')).toHaveCount(0)
  await expect(things.getByRole('button', { name: 'Buy stock' })).toBeVisible()
})

test('OB-310: the item editor is titled, steps stock and opens without the keyboard', async ({
  page,
}) => {
  await openDemo(page, 390)
  const sheet = await openMenu(page)
  await sheet.getByRole('button', { name: 'Edit Bun maska' }).click()
  const form = page.getByRole('dialog', { name: 'Edit Bun maska' })
  await expect(form).toBeVisible()
  // Nothing has focus in a text field, so the phone keyboard stays down.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT')
  const stock = form.getByRole('textbox', { name: 'Stock (optional)' })
  await expect(stock).toHaveValue('4')
  await form.getByRole('button', { name: 'One more Bun maska' }).click()
  await expect(stock).toHaveValue('5')
  await expect(form.getByRole('switch', { name: 'Customers can buy this' })).toBeChecked()
  await page.screenshot({ path: test.info().outputPath('editor-390.png') })
})

test('OB-310: Make more asks about now and Made adds to the stock', async ({ page }) => {
  await openDemo(page, 390)
  const row = page.locator('[data-need="low"]').filter({ hasText: 'Bun maska' })
  // In the evening Close the day leads, and the low row waits under "N more things".
  const folded = page.getByTestId('today').getByRole('button', { name: /more things?/ })
  if (!(await row.isVisible()) && (await folded.count())) await folded.first().click()
  await row.getByRole('button', { name: 'Make more' }).click()
  const panel = row.getByTestId('make-now')
  await expect(panel).toContainText(/Make \d+ more now\?/)
  await expect(panel).toContainText(
    /Usually \d+ sell on (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days\./,
  )
  // Never tomorrow's question (that plan is one tap away, on its own button).
  await expect(row).not.toContainText('prep for tomorrow')
  await expect(panel.getByRole('button', { name: 'Plan for tomorrow' })).toBeVisible()
  const made = panel.getByRole('button', { name: /^Made \d+$/ })
  const amount = Number((await made.innerText()).replace(/\D/g, ''))
  await page.screenshot({ path: test.info().outputPath('make-now-390.png') })
  await made.click()
  await expect(
    page.getByRole('alert').filter({ hasText: `Bun maska: ${4 + amount} left` }),
  ).toBeVisible()
  const sheet = await openMenu(page)
  await expect(sheet.locator('[data-stock="Bun maska"]')).toHaveText(`${4 + amount} left`)
})

for (const language of ['en', 'hi'] as const)
  test(`OB-310: the menu with stock fits a 360 px phone (${language})`, async ({ page }) => {
    await openDemo(page, 360, language)
    const sheet = await openMenu(page, language === 'hi' ? 'मेन्यू' : 'Menu')
    await expect(sheet.locator('[data-stock="Bun maska"]')).toHaveText(
      language === 'hi' ? '4 बचे' : '4 left',
    )
    await fits(page)
    if (language === 'hi') {
      // Every word on the stock line is Hindi.
      await expect(sheet.locator('[data-menu-card="Bun maska"]')).toContainText('कम बचे हैं')
      await expect(sheet.getByRole('button', { name: /^मैं ख़रीदता हूँ/ })).toBeVisible()
    }
    await page.screenshot({ path: test.info().outputPath(`menu-360-${language}.png`) })
  })

test('OB-310: the customer page never shows tea dust or milk', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name: 'Stock Sight Chai',
          category: 'Tea stall',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
          { name: 'Tea dust', price: 32000, unit: 'kg', category: 'Supplies', stock: 3 },
          { name: 'Milk', price: 6000, unit: 'l', category: 'Supplies', stock: 12 },
        ],
      },
    })
  ).json()
  const saved = await (
    await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
      data: { digest: prepared.digest },
    })
  ).json()
  const id = saved.business_id as string
  expect(
    (await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })).ok(),
  ).toBe(true)
  const shop = await (await page.request.get(`/api/v1/public/shops/${id}`)).json()
  expect(shop.products.map((p: { name: string }) => p.name)).toEqual(['Masala chai'])
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.goto(`/explore/s/${id}`)
  await expect(page.getByRole('heading', { name: 'Stock Sight Chai', exact: true })).toBeVisible()
  await expect(page.getByText('Masala chai').first()).toBeVisible()
  await expect(page.getByText('Tea dust')).toHaveCount(0)
  await expect(page.getByText('Milk', { exact: true })).toHaveCount(0)
})
