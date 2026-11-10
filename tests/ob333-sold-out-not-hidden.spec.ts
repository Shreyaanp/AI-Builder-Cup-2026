import { expect, test, type Page } from '@playwright/test'
import { atShopTime } from './shopClock.js'

// OB-333: in 4 of 4 agent runs "mark it sold out" switched the item off the menu. On the item sheet
// "Sold out today" comes first and saves at once; "Hide from menu" is a separate, plainly labelled
// switch further down. Phone widths, en + hi.
test.setTimeout(120_000)
test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob333-${info.testId}-${Math.random()}` })
  // The demo chai stall (Bengaluru, open 06:30–21:00, busy 07:30–09:30) mid-afternoon: open and
  // not busy, whatever hour the runner starts (main went red at 06:15 IST, 08:45 in the browser's
  // Singapore zone). The busy and before-opening hours have their own test below.
  await atShopTime(page, '14:00')
})
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

async function openItem(page: Page, width: number, language: 'en' | 'hi' = 'en') {
  await page.setViewportSize({ width, height: width === 360 ? 800 : 844 })
  await page.addInitScript(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance: 'light' },
  )
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Skip|छोड़ें)$/ })
    .click({ timeout: 60_000 })
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-tour="nav-shop"]').click()
  await page
    .getByTestId('shop-tiles')
    .getByRole('button', { name: language === 'hi' ? /^मेन्यू/ : /^Menu/ })
    .click()
  await page.locator('[data-menu-item="Ginger chai"]').click()
}

async function markSoldOut(page: Page) {
  const form = page.getByRole('dialog', { name: 'Edit Ginger chai' })
  await form.getByRole('button', { name: 'Sold out today' }).click()
  await expect(form.getByRole('button', { name: 'Put back on sale' })).toBeVisible()
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(form).toHaveCount(0)
}

const inViewport = async (page: Page, name: string) => {
  const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(48)
}

for (const width of [360, 390, 412])
  test(`OB-333: Sold out today saves at once and keeps the item on the menu (${width})`, async ({
    page,
  }) => {
    await openItem(page, width)
    const form = page.getByRole('dialog', { name: 'Edit Ginger chai' })
    await inViewport(page, 'Sold out today')
    await expect(form.getByTestId('product-sold-out')).toContainText(
      'It comes back tomorrow, or when you add stock.',
    )
    // Two separate answers, each saying what it does.
    const hide = form.getByRole('switch', { name: 'Hide from menu' })
    await expect(hide).not.toBeChecked()
    await expect(
      form.getByText(/Customers stop seeing it and it moves to Things I buy/),
    ).toBeVisible()

    const saved = page.waitForResponse(
      (r) => r.url().includes('/availability') && r.request().method() === 'POST',
    )
    await form.getByRole('button', { name: 'Sold out today' }).click()
    const response = await saved
    expect(response.request().postDataJSON()).toEqual({ available: false, today_only: true })
    const body = (await response.json()) as { available: boolean; for_sale?: boolean }
    expect(body.available).toBe(false)
    expect(body.for_sale).not.toBe(false)
    await expect(form.getByRole('status').first()).toContainText('Sold out today.')
    await expect(form.getByRole('button', { name: 'Put back on sale' })).toBeVisible()
    await expect(hide).not.toBeChecked()

    await form.getByRole('button', { name: 'Cancel' }).click()
    await expect(form).toHaveCount(0)
    // Still on the menu, and now on the Sold out line: exactly what the agents failed to do.
    const tiles = page.getByTestId('shop-tiles')
    await expect(tiles.getByRole('button', { name: /^Sold out.*Ginger chai/ })).toBeVisible()
    await expect(tiles.getByRole('button', { name: /^Menu.*5 items/ })).toBeVisible()
    await tiles.getByRole('button', { name: /^Menu/ }).click()
    await expect(
      page.getByRole('dialog', { name: 'Menu' }).locator('[data-menu-card="Ginger chai"]'),
    ).toBeVisible()
  })

test('OB-333: a later price save never undoes Sold out today', async ({ page }) => {
  await openItem(page, 390)
  const form = page.getByRole('dialog', { name: 'Edit Ginger chai' })
  await form.getByRole('button', { name: 'Sold out today' }).click()
  await expect(form.getByRole('button', { name: 'Put back on sale' })).toBeVisible()
  await form.getByRole('textbox', { name: 'Price' }).fill('31')
  const proposed = page.waitForRequest(
    (r) => r.url().includes('/proposals') && r.method() === 'POST',
  )
  await form.getByRole('button', { name: /^Review/ }).click()
  const body = (await proposed).postDataJSON() as { products: { available: boolean }[] }
  expect(body.products[0]!.available).toBe(false)
})

test('OB-333: Put back on sale undoes it on the spot', async ({ page }) => {
  await openItem(page, 390)
  const form = page.getByRole('dialog', { name: 'Edit Ginger chai' })
  await form.getByRole('button', { name: 'Sold out today' }).click()
  const putBack = form.getByRole('button', { name: 'Put back on sale' })
  await expect(putBack).toBeEnabled()
  const saved = page.waitForResponse(
    (r) => r.url().includes('/availability') && r.request().method() === 'POST',
  )
  await putBack.click()
  expect(await (await saved).json()).toMatchObject({ available: true })
  await expect(form.getByRole('button', { name: 'Sold out today' })).toBeVisible()
})

test('OB-333: Hide from menu moves it to Things I buy, and the review says so', async ({
  page,
}) => {
  await openItem(page, 390)
  const form = page.getByRole('dialog', { name: 'Edit Ginger chai' })
  const hide = form.getByRole('switch', { name: 'Hide from menu' })
  await hide.scrollIntoViewIfNeeded()
  await hide.check()
  // Hidden from customers cannot also be sold out for them.
  await expect(form.getByRole('button', { name: 'Sold out today' })).toHaveCount(0)
  await form.getByRole('button', { name: /^Review/ }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Hidden from menu, moves to Things I buy')
})

test('OB-333: Hindi item sheet has both answers in Hindi', async ({ page }) => {
  await openItem(page, 360, 'hi')
  const form = page.getByRole('dialog').last()
  await inViewport(page, 'आज के लिए ख़त्म')
  await expect(form.getByTestId('product-sold-out')).toContainText('कल अपने आप वापस आएगा')
  await expect(form.getByRole('switch', { name: 'मेन्यू से छिपाएँ' })).not.toBeChecked()
  await expect(form).not.toContainText(/Sold out|Hide from|comes back/)
  await form.getByRole('button', { name: 'आज के लिए ख़त्म' }).click()
  await expect(form.getByRole('button', { name: 'वापस बिक्री पर रखें' })).toBeVisible()
  await expect(form).not.toContainText(/Sold out|back on sale/)
})

// An owner who opens the app at 6 am, before the stall opens, or in the 07:30 rush still sees
// what is sold out on the Sold out row. The busy-hours question ("Still have …?") comes after the
// list, never instead of it, and only while the shop is open, by the shop's own clock.
for (const [time, question] of [
  ['06:00', false],
  ['08:00', true],
] as const)
  test(`OB-333: the Sold out row lists Ginger chai at ${time} in Bengaluru`, async ({ page }) => {
    await atShopTime(page, time)
    await openItem(page, 390)
    await markSoldOut(page)
    const row = page.getByTestId('shop-tiles').getByRole('button', { name: /^Sold out/ })
    await expect(row).toContainText('Ginger chai')
    // The seeded Ragi biscuit is sold out too; the question comes last, after the list.
    if (question)
      await expect(row).toHaveText(/^Sold out.*Ginger chai.* · Still have Masala chai\?$/)
    else await expect(row).not.toContainText('Still have')
  })
