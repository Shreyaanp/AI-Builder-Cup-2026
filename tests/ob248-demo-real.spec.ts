import { test, expect, type Page } from '@playwright/test'
import { openBuyStock, showInGrow, stockTile, type StockTab } from './support/grow.js'

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

/** Grow → Buy stock: To do (Draft a reorder), or On the way with the demo's order to Sri
 * Lakshmi (simplify batch 4b). */
async function openOrders(page: Page, tab: StockTab = 'On the way') {
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page, tab)
  if (tab === 'On the way')
    await expect(
      sheet
        .getByTestId('po-list')
        .getByText(/Sri Lakshmi/)
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    })
  return sheet
}

test('OB-248 a supplier order goes draft, reply, on the way, delivered, stock up', async ({
  page,
}) => {
  await openDemo(page)
  const before = await teaDustStock(page)
  const sheet = await openOrders(page, 'To do')
  await sheet.getByRole('button', { name: 'Order more', exact: true }).click()
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
  // Saved at once, said plainly with Undo; no review sheet with a selling price (OB-263).
  await expect(page.locator('.MuiSnackbar-root')).toContainText(
    `${quantity} kg Tea dust received. Stock is now ${before + quantity} kg.`,
    { timeout: 15_000 },
  )
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
  // माल मँगाएँ says the tea dust is on its way, in Hindi. (The Morning brief no longer lists it
  // as running low: the order on its way counts, OB-263.)
  const tile = await stockTile(page)
  await expect(tile).toContainText('1 रास्ते में')
  await expect(tile).not.toContainText(/\bkg\b/)
  // माल मँगाएँ → रास्ते में (Buy stock → On the way, simplify batch 4b).
  await tile.click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^रास्ते में/ }).click()
  const orders = sheet.getByTestId('po-list')
  await expect(orders.getByText(/Sri Lakshmi/).first()).toBeVisible({ timeout: 15_000 })
  // The row only counts them now; the list says which item is on its way.
  await expect(orders).toContainText('चाय पत्ती')
  await orders
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
  await page.locator('[data-tour="customer"] button').first().click()
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

  const sheet = await openOrders(page, 'To do')
  await sheet.getByRole('button', { name: 'Order more', exact: true }).click()
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
      .getByTestId('po-list')
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
  // Grow → Buy stock: its line says the read failed, then what needs buying (batch 4b).
  const tile = await stockTile(page)
  await expect(tile).toContainText('Couldn’t load orders. Trying again…', { timeout: 15_000 })
  await expect(tile).toContainText(
    /runs out|arriving|to do|on the way|Order more or find a supplier/,
    {
      timeout: 30_000,
    },
  )
  await expect(tile).not.toContainText('Couldn’t load orders')
})

test('OB-248 three plain orders bring a yes, a short reply and a new price', async ({ page }) => {
  test.setTimeout(240_000)
  await openDemo(page)
  const sheet = await openOrders(page, 'To do')
  const card = sheet.locator('article')
  const talk = card.getByTestId('supplier-talk')

  async function delivered() {
    await expect(talk).toContainText('Your order is on the way', { timeout: 20_000 })
    await card.getByRole('button', { name: 'Goods arrived', exact: true }).click()
    await expect(page.locator('.MuiSnackbar-root')).toContainText(
      /\d+ kg Tea dust received\. Stock is now \d+ kg\./,
      { timeout: 15_000 },
    )
    await expect(talk).toContainText('Here is the bill', { timeout: 20_000 })
    // The note (with Undo) hides by itself, unless a pointer rests on it; until then it sits
    // over the sheet's lower buttons.
    await page.mouse.move(0, 0)
    await expect(page.locator('.MuiSnackbar-root')).toHaveCount(0, { timeout: 15_000 })
  }

  // 1: Draft a reorder, as the first walk-through does: a plain yes.
  await sheet.getByRole('button', { name: 'Order more', exact: true }).click()
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
  // The header says what is coming and what it costs, beside the line for the rest.
  const header = card.getByTestId('order-headline')
  await expect(header).toContainText(/^4 kg Tea dust .*₹896/)
  await expect(card).toContainText(/2 kg Tea dust/)
  await delivered()
  await expect(card.getByRole('button', { name: /Approve invoice · ₹896/ })).toBeVisible()
  await expect(header).toContainText('₹896')

  // 3: Order again once more: the price went up, and it waits for the owner.
  await card.getByRole('button', { name: 'Order again', exact: true }).click()
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(talk).toContainText(/Tea dust has gone up: ₹[\d,]+ a kg now, it was ₹[\d,]+/, {
    timeout: 20_000,
  })
  // Not agreed yet: the header still shows the approved price.
  await expect(header).toContainText(/^6 kg Tea dust .*₹1,344/)
  await card.getByRole('button', { name: 'Accept changes', exact: true }).click()
  await expect(talk).toContainText('OK, go ahead.')
  await expect(header).toContainText(/^6 kg Tea dust .*₹1,410/)
  await expect(header).not.toContainText('₹1,344')
  // And the chat still tells the story of the rise.
  await expect(talk).toContainText(/₹235 a kg now, it was ₹224/)
})

// The owner's own "OK" shows after Accept changes in Hindi too (#637 review).
test('OB-248 Hindi: a short reply and a new price, each accepted, show the owner OK', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  await page.locator('[data-tour="nav-grow"]').click()
  await (await stockTile(page)).click()
  const sheet = page.getByRole('dialog')
  const card = sheet.locator('article')
  const talk = card.getByTestId('supplier-talk')
  const okay = 'ठीक है, भेज दीजिए।'

  async function delivered() {
    await expect(talk).toContainText('आपका ऑर्डर निकल चुका है', { timeout: 20_000 })
    await card.getByRole('button', { name: 'माल आ गया', exact: true }).click()
    await expect(page.locator('.MuiSnackbar-root')).toContainText(
      /\d+ किलो चाय पत्ती आ गई। अब स्टॉक \d+ किलो है।/,
      { timeout: 15_000 },
    )
    await expect(talk).toContainText('यह रहा बिल', { timeout: 20_000 })
    // The note (with Undo) hides by itself, unless a pointer rests on it; until then it sits
    // over the sheet's lower buttons.
    await page.mouse.move(0, 0)
    await expect(page.locator('.MuiSnackbar-root')).toHaveCount(0, { timeout: 15_000 })
  }

  await sheet.getByRole('button', { name: 'और मँगाएँ', exact: true }).click()
  await card.getByRole('button', { name: 'मंज़ूर करके भेजें', exact: true }).click()
  await expect(talk).toContainText('जी, पक्का है', { timeout: 20_000 })
  await expect(talk).not.toContainText(okay)
  await delivered()

  await card.getByRole('button', { name: 'फिर से ऑर्डर करें', exact: true }).click()
  await card.getByRole('button', { name: 'मंज़ूर करके भेजें', exact: true }).click()
  await expect(talk).toContainText(/आज मेरे पास सिर्फ़ \d+ किलो चाय पत्ती है।/, { timeout: 20_000 })
  await expect(talk).not.toContainText(okay)
  await card.getByRole('button', { name: 'बदलाव मानें', exact: true }).click()
  await expect(talk).toContainText(okay)
  await expect(card.getByTestId('order-headline')).toContainText('₹896')
  await delivered()

  await card.getByRole('button', { name: 'फिर से ऑर्डर करें', exact: true }).click()
  await card.getByRole('button', { name: 'मंज़ूर करके भेजें', exact: true }).click()
  await expect(talk).toContainText(
    /चाय पत्ती का दाम बढ़ गया है: अब ₹235 प्रति किलो, पहले ₹224 था/,
    {
      timeout: 20_000,
    },
  )
  await expect(card.getByTestId('order-headline')).toContainText('₹1,344')
  await card.getByRole('button', { name: 'बदलाव मानें', exact: true }).click()
  await expect(talk.getByText(okay)).toHaveCount(1)
  await expect(card.getByTestId('order-headline')).toContainText('₹1,410')
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
  // The 13 kg on its way is said in Hindi, with the Hindi unit (OB-263).
  await expect(page.getByTestId('today')).toContainText(/चाय पत्ती: \d+ किलो \S+ को आ रहा है/)
  // Buy stock (simplify batch 4b): the row, To do, the orders on the way, then each order card
  // with its supplier chat.
  await page.locator('[data-tour="nav-grow"]').click()
  await expect(await stockTile(page)).toContainText('1 रास्ते में', { timeout: 15_000 })
  await check('Buy stock row', await page.locator('[data-tour="supply"]').innerText())
  await (await stockTile(page)).click()
  const sheet = page.getByRole('dialog')
  await check('To do', await sheet.innerText())
  await sheet.getByRole('button', { name: /^रास्ते में/ }).click()
  const orders = sheet.getByTestId('po-list')
  await expect(orders.getByText(/Sri Lakshmi/).first()).toBeVisible({ timeout: 15_000 })
  await check('Purchase orders', await sheet.innerText())
  await orders
    .getByText(/Sri Lakshmi/)
    .first()
    .click()
  const talk = sheet.getByTestId('supplier-talk')
  await expect(talk).toContainText('यह रहा बिल')
  await check('Order card', await sheet.locator('article').innerText())
  await check('Supplier chat', await talk.innerText())
  // A new draft from the forecast: back, then To do.
  await sheet.getByRole('button').first().click()
  await sheet.getByRole('button', { name: /^करना है/ }).click()
  await sheet.getByRole('button', { name: 'और मँगाएँ', exact: true }).click()
  await expect(sheet.locator('article')).toBeVisible({ timeout: 15_000 })
  await check('Draft card', await sheet.locator('article').innerText())
  // Back on Coach once everything has loaded: rows that came later (sold out, prep plan) too.
  await sheet.getByRole('button', { name: 'बंद करें', exact: true }).click()
  await page.locator('[data-tour="nav-coach"]').click()
  await expect(page.getByTestId('today')).toContainText('चाय पत्ती', { timeout: 15_000 })
  await check('Coach again', await page.getByTestId('today').innerText())
  expect(seen).toEqual([])
})

// चाय पत्ती is feminine: it "खत्म होगी", never "खत्म होगा", where Today says its run-out day
// (with nothing on order, so the run-out day shows: OB-263).
test('OB-248 Hindi: tea dust runs out in the feminine on Today', async ({ page }) => {
  await page.route(/\/businesses\/[^/]+\/supply$/, async (route) => {
    const body = await (await route.fetch()).json()
    for (const need of body.needs ?? []) {
      need.runs_out = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
      need.on_order = 0
      need.on_order_other = []
      need.cover = 'none'
      need.covered = false
    }
    await route.fulfill({ json: body })
  })
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  await expect(page.getByTestId('today')).toContainText(/चाय पत्ती [^।]* को खत्म होगी/, {
    timeout: 15_000,
  })
  await expect(page.getByTestId('today')).not.toContainText(/चाय पत्ती [^।]* को खत्म होगा/)
})

test('OB-248 Hindi: morning brief, prep plan, the card after sending and chat answers have no English item or unit', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  const seen: string[] = []
  const check = (where: string, text: string) => {
    const latin = LATIN_ITEM.exec(text)
    if (latin)
      seen.push(
        `${where}: "${latin[0]}" in ${text.slice(Math.max(0, latin.index - 40), latin.index + 40)}`,
      )
  }
  // Coach: three questions typed in Hindi, each answered about the item it names.
  const asked = [
    ['चाय पत्ती का स्टॉक कितना है?', 'चाय पत्ती का स्टॉक 6 किलो है'],
    ['कल क्या तैयार करूँ?', 'कल की तैयारी: '],
    ['मेरा दूध कम हो रहा है। सप्लायर खोजें।', 'दूध के लिए पास के डेमो सप्लायर'],
  ] as const
  const log = page.getByRole('log')
  for (const [question, answer] of asked) {
    await page.getByRole('textbox', { name: 'संदेश', exact: true }).fill(question)
    await page.getByRole('button', { name: 'भेजें', exact: true }).click()
    await expect(log).toContainText(answer, { timeout: 30_000 })
  }
  await expect(log).not.toContainText('असली दुकान')
  check('Coach answers', await log.innerText())
  // Grow: the morning brief's prep rows, the prep plan tile and its sheet.
  await page.locator('[data-tour="nav-grow"]').click()
  const prepTile = await showInGrow(page, page.locator('[data-tour="prep"]'))
  await expect(prepTile).toContainText('मसाला चाय', { timeout: 15_000 })
  await expect(page.getByText(/^\S+ कप$/).first()).toBeAttached({ timeout: 15_000 })
  check('Grow', (await page.locator('body').textContent()) ?? '')
  await prepTile.click()
  const prep = page.getByRole('dialog')
  await expect(prep).toContainText(/\d कप/)
  check('Prep plan', await prep.innerText())
  await prep.getByRole('button', { name: 'बंद करें', exact: true }).click()
  // An order card just after sending, its note included.
  await (await stockTile(page)).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'और मँगाएँ', exact: true }).click()
  const card = sheet.locator('article')
  await card.getByRole('button', { name: 'मंज़ूर करके भेजें', exact: true }).click()
  await expect(card.getByRole('status').first()).toContainText('असल में कुछ नहीं गया')
  await expect(card).not.toContainText('Marked Sent')
  check('Sent card', await card.innerText())
  expect(seen).toEqual([])
})

test('OB-248 Hindi: Find suppliers through Send gets a Hindi supplier reply', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  const log = page.getByRole('log')
  await page
    .getByRole('textbox', { name: 'संदेश', exact: true })
    .fill('मेरा पनीर कम हो रहा है। सप्लायर खोजें।')
  await page.getByRole('button', { name: 'भेजें', exact: true }).click()
  await expect(log).toContainText('पनीर के लिए पास के डेमो सप्लायर', { timeout: 30_000 })
  await expect(log).toContainText('10 किलो पनीर')
  await log.getByRole('button', { name: / को भेजें$/ }).click()
  await expect(log).toContainText(/पुष्टि: 10 किलो पनीर, ₹[\d,.]+। .* बजे पहुँचेगा।/, {
    timeout: 30_000,
  })
  await expect(log).not.toContainText(/Confirmed|Paneer|Delivering/)
})

test('OB-248 Hindi: Goods arrived says what came and the stock now in Hindi, with no price', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  await page.locator('[data-tour="nav-grow"]').click()
  await (await stockTile(page)).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'और मँगाएँ', exact: true }).click()
  const card = sheet.locator('article')
  await card.getByRole('button', { name: 'मंज़ूर करके भेजें', exact: true }).click()
  await card.getByRole('button', { name: 'माल आ गया', exact: true }).click({ timeout: 30_000 })
  // OB-263: no review sheet with the selling price; one note, all Hindi, with Undo.
  const note = page.locator('.MuiSnackbar-root')
  await expect(note).toContainText(/\d+ किलो चाय पत्ती आ गई। अब स्टॉक \d+ किलो है।/, {
    timeout: 15_000,
  })
  await expect(note).toContainText('वापस लें')
  await expect(note).not.toContainText(/₹|Tea dust|\bkg\b/)
  // No stock review sheet (its category and price rows) opens.
  await expect(page.getByText(/श्रेणी: /)).toHaveCount(0)
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
  const jargon =
    /fixture|oauth|authorization|validated|revision|fictional(?! address)|checked locally|SIM-/i
  await expect(sim).not.toContainText(jargon)
  // The sample shop has no phone: the practice alone fills in a pretend one.
  await expect(sim.getByRole('textbox', { name: 'Contact' })).toHaveValue(/^[\d ]+$/)
  await sim.getByRole('combobox', { name: 'Shop type' }).click()
  await page.getByRole('option', { name: 'Café' }).click()
  await sim.getByRole('button', { name: 'Continue' }).click()
  await expect(sim).toContainText('Pick a pretend Google account.')
  await expect(sim).not.toContainText(jargon)
  await expect(sim.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await sim.getByRole('button', { name: 'Demo owner account (pretend)' }).click()
  await expect(sim).not.toContainText(jargon)
  await sim.getByRole('button', { name: 'Create a new listing' }).click()
  await expect(sim).not.toContainText(jargon)
  await sim.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(sim).not.toContainText(jargon)
  await sim.getByRole('button', { name: 'SMS (pretend)' }).click()
  await sim.getByRole('textbox', { name: 'Pretend code' }).fill('123456')
  await sim.getByRole('button', { name: 'Check pretend code' }).click()
  await expect(sim.getByRole('heading', { name: 'Practice result' })).toBeVisible()
  await expect(sim).not.toContainText(jargon)
  await expect(sim.getByRole('link')).toHaveCount(0)
  await expect(sim).not.toContainText('Reviewer controls')
})

test('OB-248 a visitor writes to the supplier on an open order and gets an answer', async ({
  page,
}) => {
  await openDemo(page)
  const sheet = await openOrders(page, 'To do')
  const card = sheet.locator('article')
  const talk = card.getByTestId('supplier-talk')
  await sheet.getByRole('button', { name: 'Order more', exact: true }).click()
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

test('OB-248 a failed orders read stops retrying once the view is gone', async ({ page }) => {
  await openDemo(page)
  let reads = 0
  await page.route('**/supply', async (route) => {
    reads += 1
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.abort()
  })
  await page.locator('[data-tour="nav-shop"]').click()
  await expect.poll(() => reads, { timeout: 15_000 }).toBeGreaterThan(0)
  // Leaving Shop closes the tiles while their read is still failing.
  await page.locator('[data-tour="nav-you"]').click()
  await page.waitForTimeout(1_000)
  const after = reads
  await page.waitForTimeout(10_000)
  expect(reads).toBe(after)
})
