import { expect, test, type Page } from '@playwright/test'
import { openBuyStock } from './support/grow.js'

// OB-339 (persona runs, 8 Nov): a sold-out item the shop buys has Order more right there, Buy
// stock takes "butter, 2 kg" in any language, the amount changes on the order card and a new
// draft replaces the old one. Ordering lives on Home and Shop under one name.

test.setTimeout(120_000)
test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata' })

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob339-${info.testId}-${Math.random()}` })
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

/** Calls the demo sandbox the way the app does: the visitor's own session in this tab. */
async function sandbox<T>(page: Page, path: string, init?: { method: string; body: unknown }) {
  return page.evaluate(
    async ({ path, init }) => {
      const { session_id: id } = JSON.parse(
        sessionStorage.getItem('chalkboard.demo.session') ?? '{}',
      )
      const base = `/api/v1/demo/sessions/${id}/api/businesses`
      const shops = (await (await fetch(base)).json()) as { id: string; revision: number }[]
      const shop = shops[0]!
      const response = await fetch(`${base}/${shop.id}${path}`, {
        method: init?.method ?? 'GET',
        headers: { 'content-type': 'application/json' },
        body: init ? JSON.stringify(init.body) : undefined,
      })
      return (await response.json()) as unknown
    },
    { path, init },
  ) as Promise<T>
}

/** Puts a thing the shop buys on the shelf, sold out, then shows it. */
async function addSoldOutPaneer(page: Page) {
  await page.evaluate(async () => {
    const { session_id: id } = JSON.parse(sessionStorage.getItem('chalkboard.demo.session') ?? '{}')
    const api = `/api/v1/demo/sessions/${id}/api`
    const shops = (await (await fetch(`${api}/businesses`)).json()) as {
      id: string
      revision: number
    }[]
    const shop = shops[0]!
    const proposal = (await (
      await fetch(`${api}/proposals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'inventory',
          business_id: shop.id,
          revision: shop.revision,
          products: [
            {
              name: 'Paneer',
              price: 5400,
              unit: 'kg',
              stock: 0,
              available: false,
              for_sale: false,
              source: 'bought',
            },
          ],
        }),
      })
    ).json()) as { id: string; digest: string }
    await fetch(`${api}/proposals/${proposal.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest: proposal.digest }),
    })
  })
  await page.reload()
  await page
    .getByRole('dialog')
    .getByRole('button')
    .last()
    .click({ timeout: 8_000 })
    .catch(() => undefined)
}

const liveDrafts = async (page: Page) => {
  const chats = await sandbox<{ status: string }[]>(page, '/orders?drafts=true')
  const supply = await sandbox<{ orders: { status: string }[] }>(page, '/supply')
  return [...chats, ...supply.orders].filter((order) => order.status === 'draft').length
}

test('OB-339 sold out and bought: Order more asks how much, the card changes in place', async ({
  page,
}) => {
  await openDemo(page)
  await addSoldOutPaneer(page)
  const sheet = await openBuyStock(page)
  await expect(sheet.getByTestId('to-order')).toContainText('Paneer is sold out')
  await expect(sheet).not.toContainText('nothing to reorder')
  await sheet.getByRole('button', { name: 'Order more Paneer' }).click()

  const form = sheet.getByTestId('how-much')
  await expect(form).toContainText('How much Paneer?')
  await form.getByRole('textbox', { name: 'Amount' }).fill('1,000')
  await form.getByRole('button', { name: 'See the order' }).click()

  const card = sheet.locator('article')
  await expect(card.getByTestId('order-headline')).toContainText('Paneer', { timeout: 30_000 })
  await card.getByRole('button', { name: 'Change amount' }).click()
  await card.getByRole('textbox', { name: 'Amount' }).fill('5')
  await card.getByRole('button', { name: 'Change amount' }).click()
  await expect(card.getByTestId('order-headline')).toContainText('5', { timeout: 15_000 })
  expect(await liveDrafts(page)).toBe(1)
})

test('OB-339 Home: sold-out stock has Order more beside Back in stock', async ({ page }) => {
  await openDemo(page)
  await addSoldOutPaneer(page)
  const today = page.getByTestId('today-needs')
  const more = today.getByRole('button', { name: /more thing/ })
  if (await more.isVisible().catch(() => false)) await more.click()
  const row = today.getByRole('listitem').filter({ hasText: 'Paneer is sold out' })
  await row.getByRole('button', { name: 'Order more' }).click({ timeout: 20_000 })
  await expect(page.getByRole('dialog').getByTestId('how-much')).toContainText('How much Paneer?')
})

test('OB-339 Buy stock takes "butter, 2 kg" when nothing looks low', async ({ page }) => {
  await openDemo(page)
  const sheet = await openBuyStock(page)
  const box = sheet.getByTestId('order-box')
  await box.getByRole('textbox').fill('butter, 2 kg')
  await box.getByRole('button', { name: 'Order', exact: true }).click()
  const card = sheet.locator('article')
  await expect(card.getByTestId('order-headline')).toContainText(/2\s*kg.*Butter/i, {
    timeout: 30_000,
  })
  // The amount is the owner's: no "minimum order" talk from a guessed rule.
  await expect(card).not.toContainText('minimum')
  await expect(card).not.toContainText('Minimum')
})

test('OB-339 Hindi: said in Hindi drafts; a "don\'t" orders nothing; no English', async ({
  page,
}) => {
  await openDemo(page, 'hi')
  await page.locator('[data-tour="nav-shop"]').click()
  await page.locator('[data-tour="supply"]').first().click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog')
  const box = sheet.getByTestId('order-box')
  await box.getByRole('textbox').fill('2 किलो मक्खन मत मँगाओ')
  await box.getByRole('button', { name: 'ऑर्डर करें' }).click()
  await expect(box.getByRole('status')).toHaveText('ठीक है, कुछ नहीं मँगाया।')
  expect(await liveDrafts(page)).toBe(0)
  await box.getByRole('textbox').fill('2 किलो मक्खन चाहिए')
  await box.getByRole('button', { name: 'ऑर्डर करें' }).click()
  await expect(sheet.locator('article').getByTestId('order-headline')).toContainText('2', {
    timeout: 30_000,
  })
})

test('OB-339 a corrected amount replaces the card, and To do shows it', async ({ page }) => {
  await openDemo(page, 'hi')
  // An explicit order makes the first card: "running low" alone only lists suppliers (OB-265).
  await say(page, '10 लीटर दूध चाहिए')
  const send = page.getByRole('button', { name: /को भेजें|^Send to/ })
  await expect(send).toHaveCount(1, { timeout: 30_000 })
  await say(page, 'नहीं, सिर्फ़ 5 लीटर दूध चाहिए')
  await expect(page.getByText('5 लीटर', { exact: false }).last()).toBeVisible({ timeout: 30_000 })
  await expect(send).toHaveCount(1)
  expect(await liveDrafts(page)).toBe(1)
  await page.locator('[data-tour="nav-shop"]').click()
  await page.locator('[data-tour="supply"]').first().click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByTestId('draft-orders')).toContainText('5')
  await expect(sheet).not.toContainText('अभी कुछ करना बाकी नहीं')
})

test('OB-339 the amount changes on the chat order card', async ({ page }) => {
  await openDemo(page)
  await say(page, 'Order 10 litre milk')
  await page.getByRole('button', { name: 'Change amount' }).last().click({ timeout: 30_000 })
  await page.getByRole('textbox', { name: 'Amount' }).fill('7')
  await page.getByRole('button', { name: 'Change amount' }).last().click()
  await expect(page.getByText(/^7\s/).last()).toBeVisible({ timeout: 15_000 })
  expect(await liveDrafts(page)).toBe(1)
})

test('OB-339 Find a supplier keeps brackets intact in the chat line', async ({ page }) => {
  await openDemo(page)
  const sheet = await openBuyStock(page, 'Find a supplier')
  await sheet.getByRole('textbox', { name: 'What do you need?' }).fill('Heritage milk 500ml')
  const amount = sheet.getByRole('textbox', { name: /How much/ })
  await amount.fill('2 crates (24 packets)')
  await expect(amount).toHaveValue('2 crates (24 packets)')
  await sheet.getByRole('button', { name: 'Find a supplier' }).last().click()
  await expect(
    page.getByText('I need 2 crates (24 packets) heritage milk 500ml').first(),
  ).toBeVisible()
})

test('OB-339 the mic in Buy stock hands over to the coach', async ({ page }) => {
  await openDemo(page)
  const sheet = await openBuyStock(page)
  await sheet.getByRole('button', { name: 'Say what you need' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-tour="nav-coach"]')).toHaveAttribute('aria-current', 'page')
})

test('OB-339 Buy stock lives on Home and Shop, not Grow', async ({ page }) => {
  await openDemo(page, 'en', 360, 800)
  await page.getByRole('button', { name: 'Buy stock', exact: true }).click({ timeout: 20_000 })
  const sheet = page.getByRole('dialog', { name: /^Buy stock/ })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  const box = sheet.getByTestId('order-box').getByRole('button', { name: 'Order', exact: true })
  await expect(box).toBeInViewport()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await page.keyboard.press('Escape')
  await page.locator('[data-tour="nav-grow"]').click()
  await expect(page.getByTestId('grow-tiles')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Buy stock/ })).toHaveCount(0)
})
