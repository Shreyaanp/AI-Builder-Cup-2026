import { test, expect, type Page } from '@playwright/test'

// OB-248 (#635): one full supplier order in the public demo, and nothing blocked for a visitor.
test.setTimeout(120_000)

const BLOCKED = /(not|n.t) available in (the )?demo|changes aren.t saved|Demo: not sent|read.only/i

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob248-${info.testId}-${Math.random()}` })
  await page.setViewportSize({ width: 390, height: 844 })
})

async function openDemo(page: Page, skip = 'Skip') {
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: skip, exact: true })
    .click({ timeout: 30_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

/** Reads the sandbox the way the app does: the visitor's own session in this tab. */
async function teaDustStock(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { session_id: id } = JSON.parse(sessionStorage.getItem('chalkboard.demo.session') ?? '{}')
    const base = `/api/v1/demo/sessions/${id}/api/businesses`
    const shops = (await (await fetch(base)).json()) as { id: string }[]
    const rows = (await (await fetch(`${base}/${shops[0]!.id}/inventory`)).json()) as {
      name: string
      stock: number
    }[]
    return rows.find((row) => row.name === 'Tea dust')!.stock
  })
}

async function openOrders(page: Page) {
  await page.locator('[data-tour="nav-grow"]').click()
  await page.locator('[data-tour="supply"]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/Sri Lakshmi/).first()).toBeVisible({ timeout: 15_000 })
  return sheet
}

test('OB-248 a supplier order goes draft, reply, on the way, delivered, stock up', async ({
  page,
}) => {
  await openDemo(page)
  const before = await teaDustStock(page)
  const sheet = await openOrders(page)
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  const card = sheet.locator('article')
  // The amount follows the shop's own sales; never below the wholesaler's 5 kg minimum.
  await expect(card).toContainText(/\d+ kg/)
  const quantity = Number(/(\d+) kg/.exec(await card.innerText())![1])
  expect(quantity).toBeGreaterThanOrEqual(5)

  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  const talk = card.getByTestId('supplier-talk')
  await expect(talk).toContainText(`Please send ${quantity} kg Tea dust`)
  await expect(talk).toContainText('Waiting for Sri Lakshmi Provisions (Demo) to reply')
  // The visitor's first order is a plain yes; nobody has to press a "simulate" button.
  await expect(card.getByText('Supplier simulator (demo)')).toHaveCount(0)
  await expect(talk).toContainText(`Yes, confirmed: ${quantity} kg Tea dust`, { timeout: 20_000 })
  await expect(talk).toContainText('Your order is on the way', { timeout: 20_000 })

  await card.getByRole('button', { name: 'Goods arrived', exact: true }).click()
  const review = page.getByRole('dialog').filter({ hasText: 'Tea dust' }).last()
  await review.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect.poll(() => teaDustStock(page), { timeout: 15_000 }).toBe(before + quantity)
  await expect(talk).toContainText('The goods came, thank you')
  await expect(talk).toContainText('Here is the bill', { timeout: 20_000 })
})

test('OB-248 the supplier talks in the owner language', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  await page.locator('[data-tour="nav-grow"]').click()
  // The Morning brief's stock line carries the Hindi unit too.
  await expect(page.getByText(/^बाकी: \S+ किलो$/).first()).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-tour="supply"]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/Sri Lakshmi/).first()).toBeVisible({ timeout: 15_000 })
  await sheet
    .getByText(/Sri Lakshmi/)
    .first()
    .click()
  const talk = sheet.getByTestId('supplier-talk')
  await expect(talk).toContainText('कृपया')
  // Hindi units too: no English "kg" or "pack" left in the supplier's words.
  await expect(talk).not.toContainText(/\b(kg|litre|pack)\b/)
  await expect(talk).toContainText('जी,')
  await expect(talk).toContainText('यह रहा बिल')
})

test('OB-248 no owner tab or sheet shows a demo block', async ({ page }) => {
  const refused: string[] = []
  page.on('response', (response) => {
    if (response.status() === 403) refused.push(response.url())
  })
  await openDemo(page)
  const noBlock = async () => expect(page.locator('body')).not.toContainText(BLOCKED)
  for (const name of ['coach', 'shop', 'grow', 'you']) {
    await page.locator(`[data-tour="nav-${name}"]`).click()
    await noBlock()
  }

  // Sheets that used to answer with the demo note now do the work.
  await page.locator('[data-tour="nav-shop"]').click()
  await page.locator('[data-tour="customer"] button').nth(1).click()
  const publish = page.getByRole('dialog').getByRole('switch')
  await publish.click()
  await expect(publish).toBeChecked()
  await noBlock()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.locator('[data-tour="menu"]').click()
  await expect(page.getByRole('dialog').locator('li').first()).toBeVisible()
  await noBlock()
  await page.keyboard.press('Escape')

  const sheet = await openOrders(page)
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  await expect(sheet.locator('article')).toBeVisible({ timeout: 15_000 })
  await noBlock()
  const dead = sheet.locator('article button[disabled]')
  // A disabled button may wait for the owner's input, but never for being in the demo.
  for (const button of await dead.all()) {
    await expect(button).not.toContainText(BLOCKED)
  }
  expect(refused).toEqual([])
})

test('OB-248 what touches the real world says it is pretend, plainly', async ({ page }) => {
  await openDemo(page)
  await expect(page.getByTestId('demo-banner')).toContainText('Demo shop · sample data')
  await page.locator('[data-tour="nav-you"]').click()
  await page
    .getByRole('button', { name: /Verify it/ })
    .first()
    .click()
  await expect(
    page.locator('.MuiSnackbar-root', { hasText: 'In the demo this is pretend: nothing is sent' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Start my own shop/ })).toBeVisible()
  await page.getByRole('button', { name: /Privacy & your data/ }).click()
  await expect(page.locator('body')).not.toContainText(BLOCKED)
  await expect(page.getByText('In the demo this is pretend: nothing is sent').first()).toBeVisible()
})

// "OK, go ahead." is the owner's own yes: an order cancelled instead must never show it. The list
// hides cancelled orders, so this checks what the message depends on: the owner's acceptance.
for (const accepted of [false, true]) {
  test(`OB-248 a short reply when the owner ${accepted ? 'accepted' : 'did not accept'}`, async ({
    page,
  }) => {
    await page.route('**/supply', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as {
        orders: {
          status: string
          changes_accepted?: boolean
          documents: { kind: string; canonical: { lines: Record<string, unknown>[] } }[]
        }[]
      }
      const order = body.orders[0]!
      order.status = 'confirmed'
      order.changes_accepted = accepted
      const reply = order.documents.find((document) => document.kind === 'ORDRSP')!
      Object.assign(reply.canonical.lines[0]!, {
        status: 'backordered',
        backorder_quantity: 3,
        backorder_date: '2030-01-10',
      })
      await route.fulfill({ response, json: body })
    })
    await openDemo(page)
    const sheet = await openOrders(page)
    await sheet
      .getByText(/Sri Lakshmi/)
      .first()
      .click()
    const talk = sheet.getByTestId('supplier-talk')
    await expect(talk).toContainText('The other 3 kg comes')
    if (accepted) await expect(talk).toContainText('OK, go ahead.')
    else await expect(talk).not.toContainText('OK, go ahead.')
  })
}

test('OB-248 a failed orders read says so and tries again, never "–" as if empty', async ({
  page,
}) => {
  await openDemo(page)
  // The first reads fail the way an overlapping hosted save used to (409), then recover.
  let failures = 3
  await page.route(/\/api\/businesses\/[^/]+\/supply$/, (route) =>
    failures-- > 0
      ? route.fulfill({ status: 409, body: '{"detail":"Demo changed. Try again."}' })
      : route.continue(),
  )
  await page.reload()
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
  await page.locator('[data-tour="nav-grow"]').click()
  const tile = page.locator('[data-tour="supply"]')
  await expect(tile).toContainText('Couldn’t load orders. Trying again…', { timeout: 15_000 })
  await expect(tile).not.toContainText('Orders drafted from your forecast')
  await expect(tile).toContainText(/\d+ open|None open/, { timeout: 30_000 })
  await expect(tile).not.toContainText('Couldn’t load orders')
})

test('OB-248 three plain orders bring a yes, a short reply and a new price', async ({ page }) => {
  test.setTimeout(240_000)
  await openDemo(page)
  const sheet = await openOrders(page)
  const card = sheet.locator('article')
  const talk = card.getByTestId('supplier-talk')

  async function delivered() {
    await expect(talk).toContainText('Your order is on the way', { timeout: 20_000 })
    await card.getByRole('button', { name: 'Goods arrived', exact: true }).click()
    const review = page.getByRole('dialog').filter({ hasText: 'Tea dust' }).last()
    await review.getByRole('button', { name: 'Confirm and save', exact: true }).click()
    await expect(talk).toContainText('Here is the bill', { timeout: 20_000 })
  }

  // 1: Draft a reorder, as the first walk-through does: a plain yes.
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(talk).toContainText('Yes, confirmed', { timeout: 20_000 })
  await delivered()

  // 2: Order again on what came: the supplier is short and asks first.
  await card.getByRole('button', { name: 'Order again', exact: true }).click()
  await expect(card).toContainText('Draft')
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(talk).toContainText(/I have only \d+ kg Tea dust today\. The other \d+ kg comes/, {
    timeout: 20_000,
  })
  await card.getByRole('button', { name: 'Accept changes', exact: true }).click()
  await expect(talk).toContainText('OK, go ahead.')
  await delivered()

  // 3: Order again once more: the price went up, and it waits for the owner.
  await card.getByRole('button', { name: 'Order again', exact: true }).click()
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(talk).toContainText(/Tea dust has gone up: ₹[\d,]+ a kg now, it was ₹[\d,]+/, {
    timeout: 20_000,
  })
  await expect(card.getByRole('button', { name: 'Accept changes', exact: true })).toBeVisible()
})

// Item names and units a Hindi owner must never see in English (OB-74, OB-248).
const LATIN_ITEM =
  /\b(Tea dust|Milk|Sugar|Paper cups|Masala chai|Ginger chai|Bun maska|Samosa|Ragi biscuit|kg|litre|pack|piece|cup|cups)\b/

test('OB-248 Hindi: Coach, Purchase orders, order card and supplier chat name every item in Hindi', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  const seen: string[] = []
  const check = async (where: string, text: string) => {
    const latin = LATIN_ITEM.exec(text)
    if (latin)
      seen.push(
        `${where}: "${latin[0]}" in …${text.slice(Math.max(0, latin.index - 40), latin.index + 40)}…`,
      )
  }
  // Coach (the first screen): its cards and rows.
  await expect(page.getByTestId('today')).toContainText('चाय पत्ती', { timeout: 15_000 })
  await check('Coach', await page.getByTestId('today').innerText())
  // चाय पत्ती is feminine: it "खत्म होगी", never "खत्म होगा".
  await expect(page.getByTestId('today')).toContainText(/चाय पत्ती [^।]* को खत्म होगी/)
  // Purchase orders: the tile, the list, then each order card with its supplier chat.
  await page.locator('[data-tour="nav-grow"]').click()
  await expect(page.locator('[data-tour="supply"]')).toContainText('Sri Lakshmi', {
    timeout: 15_000,
  })
  await check('Purchase orders tile', await page.locator('[data-tour="supply"]').innerText())
  await page.locator('[data-tour="supply"]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/Sri Lakshmi/).first()).toBeVisible({ timeout: 15_000 })
  await check('Purchase orders', await sheet.innerText())
  await sheet
    .getByText(/Sri Lakshmi/)
    .first()
    .click()
  const talk = sheet.getByTestId('supplier-talk')
  await expect(talk).toContainText('यह रहा बिल')
  await check('Order card', await sheet.locator('article').innerText())
  await check('Supplier chat', await talk.innerText())
  // A new draft from the forecast.
  await sheet.getByRole('button').first().click()
  await sheet.getByRole('button', { name: 'फिर से सामान मँगाएँ' }).click()
  await expect(sheet.locator('article')).toBeVisible({ timeout: 15_000 })
  await check('Draft card', await sheet.locator('article').innerText())
  // Back on Coach once everything has loaded: rows that came later (sold out, prep plan) too.
  await page.keyboard.press('Escape')
  await page.locator('[data-tour="nav-coach"]').click()
  await expect(page.getByTestId('today')).toContainText('चाय पत्ती', { timeout: 15_000 })
  await check('Coach again', await page.getByTestId('today').innerText())
  expect(seen).toEqual([])
})

test('OB-248 Get on Google: a visitor walks the whole practice, and it says nothing is sent', async ({
  page,
}) => {
  await openDemo(page)
  await page.locator('[data-tour="nav-grow"]').click()
  await page.locator('[data-tour="google"]').click()
  const note = 'In the demo this is pretend: nothing is sent to Google'
  await expect(page.getByRole('heading', { name: 'Get on Google' })).toBeVisible()
  await expect(page.getByText(note).first()).toBeVisible()
  await expect(page.getByText('Reviewer controls')).toHaveCount(0)

  await page.getByRole('button', { name: 'Put my shop on Google' }).click()
  const sim = page.getByRole('dialog')
  await expect(sim.getByText(note)).toBeVisible()
  await sim.getByRole('button', { name: 'Put my shop on Google' }).click()
  await sim.getByRole('button', { name: 'Customers visit' }).click()
  // The sample shop has no phone: the visitor adds what is missing, as an owner would.
  await sim.getByRole('textbox', { name: 'Contact' }).fill('00000 00000')
  await sim.getByRole('combobox', { name: 'Google category fixture' }).click()
  await page.getByRole('option', { name: 'Café' }).click()
  await sim.getByRole('button', { name: 'Continue' }).click()
  await sim.getByRole('button', { name: 'Demo owner account (fictional)' }).click()
  await sim.getByRole('button', { name: 'Create a new listing' }).click()
  await sim.getByRole('button', { name: 'Approve this revision and submit for practice' }).click()
  await sim.getByRole('button', { name: 'SMS (fictional)' }).click()
  await sim.getByRole('textbox', { name: 'Fictional code' }).fill('123456')
  await sim.getByRole('button', { name: 'Check fictional code' }).click()
  await expect(sim.getByRole('heading', { name: 'Practice result' })).toBeVisible()
  await expect(sim.getByRole('link')).toHaveCount(0)
  await expect(sim).not.toContainText('Reviewer controls')
})

test('OB-248 a visitor writes to the supplier on an open order and gets an answer', async ({
  page,
}) => {
  await openDemo(page)
  const sheet = await openOrders(page)
  const card = sheet.locator('article')
  const talk = card.getByTestId('supplier-talk')
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  await expect(card.getByRole('textbox', { name: 'Write to the supplier' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(talk).toContainText('Yes, confirmed', { timeout: 20_000 })

  const box = card.getByRole('textbox', { name: 'Write to the supplier' })
  await expect(card.getByText('In the demo this is pretend: nothing is sent')).toBeVisible()
  await box.fill('When will it reach me?')
  await card.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(talk).toContainText('When will it reach me?')
  await expect(box).toHaveValue('')
  await expect(talk).toContainText(/It reaches you \w+/, { timeout: 20_000 })
  await box.fill('Please pack it well')
  await box.press('Enter')
  await expect(talk).toContainText('Noted, thank you', { timeout: 20_000 })
})

test('OB-248 Find suppliers lists the demo suppliers and drafts the order to send', async ({
  page,
}) => {
  await openDemo(page)
  const coach = page.getByRole('textbox', { name: 'Message', exact: true })
  await coach.fill('My tea dust is running low. Find suppliers.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const log = page.getByRole('log')
  await expect(log).toContainText('I drafted 10', { timeout: 30_000 })
  await expect(log).toContainText('(Demo)')
  await expect(log).not.toContainText('In your real shop')
  // Sending works too, and the demo supplier answers: nothing reaches a real business.
  await log.getByRole('button', { name: /^Send/ }).first().click()
  await expect(log).toContainText('Automatic demo reply', { timeout: 20_000 })
})
