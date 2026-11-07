import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { startNewShop } from './support/newShop.js'

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
  // "Not now" closes it with nothing saved; Make more opens it again.
  await panel.getByRole('button', { name: 'Not now' }).click()
  await expect(panel).toBeHidden()
  await row.getByRole('button', { name: 'Make more' }).click()
  await expect(panel).toBeVisible()
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
      await expect(sheet.getByRole('button', { name: /^ख़रीदा हुआ सामान/ })).toBeVisible()
    }
    await page.screenshot({ path: test.info().outputPath(`menu-360-${language}.png`) })
  })

test('OB-310: the customer page never shows tea dust; milk stays and is asked about', async ({
  page,
}) => {
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
  // Tea dust can't be a menu item. Milk is a bare name a shop may sell, so it is never hidden
  // by its name: it stays, and the owner is asked once.
  const shop = await (await page.request.get(`/api/v1/public/shops/${id}`)).json()
  expect(shop.products.map((p: { name: string }) => p.name)).toEqual(['Masala chai', 'Milk'])
  const items = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  const milk = items.find((p: { name: string }) => p.name === 'Milk')
  expect([milk.for_sale, milk.ask_for_sale]).toEqual([true, true])
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.goto(`/explore/s/${id}`)
  await expect(page.getByRole('heading', { name: 'Stock Sight Chai', exact: true })).toBeVisible()
  await expect(page.getByText('Masala chai').first()).toBeVisible()
  await expect(page.getByText('Tea dust')).toHaveCount(0)
})

test('OB-310: a count of 0 is Sold out, with a named Undo', async ({ page }) => {
  await openDemo(page, 360)
  const sheet = await openMenu(page)
  const bun = sheet.locator('[data-menu-card="Bun maska"]')
  const count = bun.locator('[data-stock="Bun maska"]')
  await expect(count).toHaveText('4 left')
  const minus = bun.getByRole('button', { name: 'One less Bun maska' })
  for (const left of [3, 2, 1]) {
    await minus.click()
    await expect(count).toHaveText(`${left} left`)
  }
  // Taps save in turn: wait for the one that reaches 0.
  const saved = page.waitForResponse(
    async (r) =>
      r.url().includes('/stock') && r.request().method() === 'POST' && (await r.json()).stock === 0,
  )
  await minus.click()
  // Never "0 left · Running low": sold out, and customers are no longer offered it.
  await expect(count).toHaveText('Sold out')
  await expect(bun.getByText('Running low')).toHaveCount(0)
  expect(await (await saved).json()).toMatchObject({ stock: 0, available: false })
  const note = page.getByRole('alert').filter({ hasText: 'Bun maska: sold out' })
  await expect(note).toBeVisible()
  // At 360 the note sits over the sheet's own buttons, never over the items and their − / +:
  // it starts below the bottom of the scrolling item list.
  const noteBox = (await note.boundingBox())!
  const listBottom = await bun.evaluate((card) => {
    let box: HTMLElement | null = card.parentElement
    while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY))
      box = box.parentElement
    return box!.getBoundingClientRect().bottom
  })
  expect(noteBox.y).toBeGreaterThanOrEqual(listBottom - 1)
  await page.screenshot({ path: test.info().outputPath('sold-out-360.png') })
  await note.getByRole('button', { name: 'Undo' }).click()
  await expect(count).toHaveText('4 left')
})

test('OB-310: Hindi stock cards and Things I buy use Hindi names', async ({ page }) => {
  await openDemo(page, 360, 'hi')
  const sheet = await openMenu(page, 'मेन्यू')
  const bun = sheet.locator('[data-menu-card="Bun maska"]')
  await expect(bun).toContainText('बन मस्का')
  await expect(bun).not.toContainText('Bun maska')
  await expect(bun.getByRole('button', { name: 'बदलें बन मस्का' })).toBeVisible()
  await sheet.getByRole('button', { name: /^ख़रीदा हुआ सामान/ }).click()
  const things = page.getByRole('dialog', { name: 'ख़रीदा हुआ सामान' })
  await expect(things).toHaveCSS('transform', 'none')
  await expect(things.locator('[data-menu-card="Tea dust"]')).toContainText('चाय पत्ती')
  await expect(things).not.toContainText('Tea dust')
  await page.screenshot({ path: test.info().outputPath('things-i-buy-360-hi.png') })
})

test('OB-310: Things I buy never reach the Google Maps details of a new shop', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await context.grantPermissions(['geolocation'])
  // What the owner copies into Google's public form.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { copied: string }).copied = text
        },
      },
    })
  })
  // The new shop's menu had tea dust on it: the stall buys it, customers never see it.
  await page.route('**/api/v1/businesses/*/inventory', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      json: [
        { id: 'a'.repeat(64), name: 'Masala chai', price: 2000, unit: 'cup', stock: null },
        {
          id: 'b'.repeat(64),
          name: 'Tea dust',
          price: 32000,
          unit: 'kg',
          stock: 3,
          for_sale: false,
        },
      ],
    })
  })
  await enter(page)
  await startNewShop(page)
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
  await page
    .getByLabel('Message', { exact: true })
    .fill('name: Lakshmi Tea Stall; category: Tea stall; location: Indiranagar metro')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toHaveText('Saved')
  await page.getByTestId('end-conversation').click()
  await page.getByTestId('finish-review').click()
  await expect(
    page.getByRole('heading', { name: 'Congratulations, Lakshmi Tea Stall is live!' }),
  ).toBeVisible()
  // The hand-off sits under Share on the ready screen (OB-292).
  await page.locator('summary').filter({ hasText: 'Share' }).click()
  await page.getByTestId('maps-handoff').getByRole('button', { name: 'Copy details' }).click()
  const copied = () => page.evaluate(() => (window as unknown as { copied?: string }).copied ?? '')
  await expect.poll(copied).toContain('Masala chai')
  expect(await copied()).not.toContain('Tea dust')
})

test('OB-310: a bare name stays on the menu and is asked about once', async ({ page }) => {
  // A bakery's "Eggs" would be asked about by the server; the demo's Samosa stands in for it.
  let answered = false
  await page.route('**/businesses/*/inventory', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const items = (await response.json()) as { name: string; ask_for_sale?: boolean }[]
    await route.fulfill({
      response,
      json: items.map((item) =>
        item.name === 'Samosa' && !answered ? { ...item, ask_for_sale: true } : item,
      ),
    })
  })
  page.on('request', (request) => {
    if (request.url().includes('/for-sale') && request.method() === 'POST') answered = true
  })
  await openDemo(page, 360)
  const sheet = await openMenu(page)
  const ask = sheet.getByRole('group', { name: 'Do customers buy Samosa from you?' })
  await expect(ask).toBeVisible()
  // Until the owner answers, it stays on the menu.
  await expect(sheet.locator('[data-menu-card="Samosa"]')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('ask-for-sale-360.png') })
  const saved = page.waitForResponse((r) => r.url().includes('/for-sale'))
  await ask.getByRole('button', { name: 'Yes, they do' }).click()
  expect(await (await saved).json()).toMatchObject({ for_sale: true })
  await expect(ask).toHaveCount(0)
  await expect(sheet.locator('[data-menu-card="Samosa"]')).toBeVisible()
})
