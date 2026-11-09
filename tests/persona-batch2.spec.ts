import { expect, test, type Locator, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'
import { shopMore } from './support/shopMore.js'

// Second batch from the 8 Nov persona runs (Ahmed, Priya, Ramesh, agent lab item 5).

/** Local preview has no account: a reload shows its gate again (hosted: signin-survives-reload). */
async function reopen(page: Page) {
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
}

/** A real (non-demo) rupee shop with two items, opened on the phone. */
async function realShop(page: Page) {
  await localOnly(page)
  await enter(page)
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name: `Ahmed Kirana ${crypto.randomUUID().slice(0, 6)}`,
          category: 'Grocery',
          location: 'Tolichowki, Hyderabad',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          phone: '+919876543210',
          stamps_needed: 8,
          reward_text: 'A free pack',
        },
        owner_location: { lat: 17.4, lng: 78.41, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Toor Dal 1kg', price: 15000, unit: 'kg', category: 'Dal', stock: 20 },
          { name: 'Sugar', price: 4500, unit: 'kg', category: 'Basics', stock: 20 },
        ],
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  const { business_id: id } = (await approved.json()) as { business_id: string }
  await reopen(page)
  return id
}

test.use({ actionTimeout: 15_000 })

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )

async function openCloseDay(page: Page) {
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  return page.getByRole('dialog', { name: 'Close the day' })
}

/** Save; before 4 pm the app first asks if the day is really over. */
async function saveDay(page: Page, close: Locator) {
  await close.getByRole('button', { name: 'Close the day', exact: true }).click()
  const anyway = page.getByRole('button', { name: 'Close anyway', exact: true })
  await page.waitForTimeout(300)
  if (await anyway.isVisible()) await anyway.click()
}

async function openBilling(page: Page) {
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await shopMore(page)
  await page.getByRole('button', { name: /Link your billing app/i }).click()
  return page.getByRole('dialog', { name: 'Link your billing app' })
}

const REPORT = [
  'Item wise sale report',
  'Duration: 01/11/2026 to 07/11/2026',
  'Date,Item Name,Quantity,Amount',
  '07/11/2026,Toor Dal 1kg,9,"1,350"',
  '07/11/2026,Rice 5kg,2,700',
  'Total,,11,"2,050"',
].join('\n')

async function pasteReport(page: Page) {
  const connect = await openBilling(page)
  // A kirana's own billing apps are on the list, and nothing is pre-picked for them.
  for (const name of ['Vyapar', 'myBillBook', 'Khatabook', 'Marg'])
    await expect(connect.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(connect.getByRole('button', { name: 'Petpooja', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await connect.getByRole('button', { name: 'Vyapar', exact: true }).click()
  await connect.getByRole('tab', { name: /paste/i }).click()
  await connect.getByRole('textbox').fill(REPORT)
  await connect.getByRole('button', { name: 'Analyze sample' }).click()
  await expect(connect.getByText('Column mapping')).toBeVisible()
  return connect
}

test('OB-345: a Vyapar report with Indian dates saves as sales', async ({ page }) => {
  test.setTimeout(90_000)
  await realShop(page)
  const connect = await pasteReport(page)
  await expect(connect.getByRole('button', { name: 'My sales' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await connect.getByRole('button', { name: 'Confirm & review import' }).click()
  // Sales review: 2 rows, not the "Total" line, and a rupee amount as written.
  await expect(page.getByText('₹1,350').first()).toBeVisible()
  await expect(connect.getByText(/Could not complete sync/)).toHaveCount(0)
})

test('OB-345: the same report can fill the item list, price per piece', async ({ page }) => {
  test.setTimeout(90_000)
  await realShop(page)
  const connect = await pasteReport(page)
  await connect.getByRole('button', { name: 'My item list' }).click()
  await expect(connect.getByText(/amount ÷ the quantity/)).toBeVisible()
  await connect.getByRole('button', { name: 'Confirm & review import' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review.getByText('Rice 5kg')).toBeVisible()
  await expect(review.getByText(/₹350/)).toBeVisible()
  await expect(review.getByText(/^Total$/)).toHaveCount(0)
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
})

test('OB-346: close the day with one total, saved as a total', async ({ page }) => {
  test.setTimeout(90_000)
  const id = await realShop(page)
  const close = await openCloseDay(page)
  await close.getByRole('button', { name: 'Just enter the total' }).click()
  await close.getByLabel('Total sales').fill('₹12,450')
  await expect(close.getByText('= ₹12,450')).toBeVisible()
  await close.getByRole('button', { name: /^Review/ }).click()
  const review = close.getByTestId('close-day-total-review')
  await expect(review).toContainText('₹12,450')
  await expect(review).toContainText('not as items')
  await saveDay(page, close)
  await expect(close.getByText(/Day closed: ₹12,450/)).toBeVisible()
  // Never "You sold 1 General sales": no item line, and none made up in the shop's records.
  await expect(close.getByText(/You sold/)).toHaveCount(0)
  const rows = (await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()) as {
    item: string
    revenue: number
    whole_day: boolean
  }[]
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ item: '', revenue: 1_245_000, whole_day: true })
  const products = (await (
    await page.request.get(`/api/v1/businesses/${id}/inventory`)
  ).json()) as {
    name: string
  }[]
  expect(products.map((p) => p.name).sort()).toEqual(['Sugar', 'Toor Dal 1kg'])
})

test('OB-346: cash and UPI are optional, one gives the other, and they must add up', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const id = await realShop(page)
  const close = await openCloseDay(page)
  await close.getByRole('button', { name: 'Just enter the total' }).click()
  await close.getByLabel('Total sales').fill('1,000')
  await close.getByRole('button', { name: /Split cash and UPI/ }).click()
  await close.getByLabel('Cash').fill('700')
  await close.getByLabel('UPI').fill('400')
  await expect(close.getByRole('alert')).toContainText('₹1,100')
  // A sum that is wrong holds Check; nothing moves on quietly.
  await close.getByRole('button', { name: /^Review/ }).click()
  await expect(close.getByLabel('Total sales')).toBeVisible()
  await close.getByLabel('UPI').fill('')
  await expect(close.getByText('= ₹300')).toBeVisible()
  await close.getByRole('button', { name: /^Review/ }).click()
  await expect(close.getByTestId('close-day-total-review')).toContainText('UPI ₹300')
  await saveDay(page, close)
  await expect(close.getByText(/Day closed: ₹1,000/)).toBeVisible()
  const rows = (await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()) as {
    cash: number
    upi: number
  }[]
  expect(rows[0]).toMatchObject({ cash: 70_000, upi: 30_000 })
})

test('OB-346: a closed total reopens to edit, and items can replace it', async ({ page }) => {
  test.setTimeout(90_000)
  const id = await realShop(page)
  await page.request.post(`/api/v1/businesses/${id}/day/total`, { data: { total: 800 } })
  await reopen(page)
  const close = await openCloseDay(page)
  await expect(close.getByText(/₹800/)).toBeVisible()
  await close.getByRole('button', { name: 'Edit' }).click()
  await expect(close.getByLabel('Total sales')).toHaveValue(/800/)
  await close.getByRole('button', { name: 'Type items instead' }).click()
  await close.locator('input[name="item"]').fill('Sugar')
  await expect(close.getByRole('button', { name: 'Just enter the total' })).toHaveCount(0)
  await close.getByRole('textbox', { name: 'Quantity sold' }).fill('4')
  await close.getByRole('textbox', { name: /Total for this item/ }).fill('180')
  await close.getByRole('button', { name: /^Review/ }).click()
  await saveDay(page, close)
  await expect(close.getByText(/Day closed: ₹180/)).toBeVisible()
  const rows = (await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()) as {
    item: string
    revenue: number
  }[]
  // Item lines win: the earlier total no longer counts on top of them.
  expect(rows.map((row) => [row.item, row.revenue])).toEqual([['Sugar', 18_000]])
})

test('OB-346: the public demo can close with one total too, in its own sandbox', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const paid: string[] = []
  page.on('request', (request) => {
    if (/generativelanguage|aiplatform/.test(request.url())) paid.push(request.url())
  })
  await localOnly(page)
  await page.goto('/demo')
  await expect(page.getByText('Demo shop · sample data', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const close = await openCloseDay(page)
  const edit = close.getByRole('button', { name: 'Edit' })
  await expect(close.getByRole('button', { name: 'Just enter the total' }).or(edit)).toBeVisible()
  // The sample shop may have closed today with item lines; those keep the item form.
  test.skip(await edit.isVisible(), 'The demo day is already closed with items')
  await close.getByRole('button', { name: 'Just enter the total' }).click()
  await close.getByRole('textbox', { name: 'Total sales' }).fill('500')
  await close.getByRole('button', { name: /^Review/ }).click()
  await saveDay(page, close)
  await expect(close.getByText(/Day closed/)).toBeVisible()
  expect(paid).toEqual([])
})

test('OB-347: several products in one go, the form stays open', async ({ page }) => {
  test.setTimeout(90_000)
  await realShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^(Menu|Products)/ }).click()
  await page
    .getByRole('dialog', { name: /^(Menu|Products)$/ })
    .getByRole('button', { name: 'Add product' })
    .click()
  const form = page.getByRole('dialog', { name: 'Add product' })
  const name = form.getByRole('textbox', { name: /Product name|Name/ })
  const price = form.getByRole('textbox', { name: /Price/ })
  for (const [item, amount] of [
    ['Atta 5kg', '1,240'],
    ['Salt', '₹28/-'],
    ['Tea 250g', '140'],
  ] as const) {
    await name.fill(item)
    await price.fill(amount)
    await form.getByRole('button', { name: 'Add another' }).click()
    // Still open, cleared, and the keyboard is on the next name.
    await expect(form).toBeVisible()
    await expect(name).toHaveValue('')
    await expect(name).toBeFocused()
  }
  const waiting = form.getByTestId('product-waiting')
  await expect(waiting.getByRole('listitem')).toHaveCount(3)
  await expect(waiting).toContainText('₹1,240')
  await noSidewaysScroll(page)
  // The same item again is one item, with the later price; a slip can be taken back.
  await name.fill('salt')
  await price.fill('30')
  await form.getByRole('button', { name: 'Add another' }).click()
  await expect(waiting.getByRole('listitem')).toHaveCount(3)
  await form.getByRole('button', { name: 'Remove: Tea 250g' }).click()
  await expect(waiting.getByRole('listitem')).toHaveCount(2)
  // A typo holds the item back instead of losing it.
  await name.fill('Jaggery')
  await price.fill('abc')
  await form.getByRole('button', { name: 'Add another' }).click()
  await expect(form.getByRole('alert')).toBeVisible()
  await expect(name).toHaveValue('Jaggery')
  await price.fill('60')
  // One review saves them all, the one still in the boxes too.
  await form.getByRole('button', { name: /\(3\)$/ }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  for (const item of ['Atta 5kg', 'salt', 'Jaggery'])
    await expect(review.getByText(item, { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  await page.getByRole('button', { name: /^(Menu|Products)/ }).click()
  const menu = page.getByRole('dialog', { name: /^(Menu|Products)$/ })
  await expect(menu.getByText('Jaggery')).toBeVisible()
  await expect(menu.getByText('Atta 5kg')).toBeVisible()
})

test('OB-347: editing one saved item has no "Add another"', async ({ page }) => {
  await realShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^(Menu|Products)/ }).click()
  await page.getByRole('button', { name: 'Edit Sugar', exact: true }).click()
  // OB-353: the editor waits for the Menu to go, so it is never left hidden from screen readers.
  await expect(page.getByRole('dialog', { name: /Sugar/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add another' })).toHaveCount(0)
})

test('OB-348: no Demo label on a real shop, on chat or the morning brief', async ({ page }) => {
  test.setTimeout(90_000)
  await realShop(page)
  const box = page.getByRole('textbox', { name: /Ask|Message/ }).first()
  await box.fill('hello')
  await box.press('Control+Enter').catch(() => undefined)
  await page.getByRole('button', { name: /^Send/ }).click()
  await expect(page.getByTestId('back-to-today')).toBeVisible()
  await expect(page.getByText('Demo', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect(page.getByText('Demo', { exact: true })).toHaveCount(0)
})

test('OB-350: Home is one tap away from a chat, and the chat from Home', async ({ page }) => {
  test.setTimeout(90_000)
  await realShop(page)
  const box = page.getByRole('textbox', { name: /Ask|Message/ }).first()
  await box.fill('hello there')
  await page.getByRole('button', { name: /^Send/ }).click()
  await expect(page.getByText('hello there')).toBeVisible()
  await page.getByTestId('back-to-today').click()
  await expect(page.getByText('hello there')).toHaveCount(0)
  await page.getByTestId('back-to-chat').click()
  await expect(page.getByText('hello there')).toBeVisible()
  // After a reload the app opens on Home, and the last chat is still there to go back to.
  await reopen(page)
  await page.getByTestId('back-to-chat').click()
  await expect(page.getByText('hello there')).toBeVisible()
})

test('OB-349: after a reload the chat keeps the order card and the supplier reply', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const id = await realShop(page)
  const say = async (text: string) => {
    const box = page.getByRole('textbox', { name: /Ask|Message/ }).first()
    await box.fill(text)
    await page.getByRole('button', { name: /^Send/ }).click()
  }
  await say('My flour is running low')
  await expect(page.getByRole('list', { name: /suppliers? nearby/ }).last()).toBeVisible({
    timeout: 30_000,
  })
  await say('The second one looks good, order 20 kg flour from them')
  await expect(page.getByRole('button', { name: /Send|Order request/i }).first()).toBeVisible({
    timeout: 30_000,
  })
  const orderId = await page.evaluate(async (shop) => {
    const chats = (await (await fetch('/api/v1/conversations')).json()) as { session_id: string }[]
    const chat = (await (await fetch(`/api/v1/conversations/${chats[0]!.session_id}`)).json()) as {
      messages: { role: string; orderId?: string }[]
    }
    return { shop, id: chat.messages.find((m) => m.role === 'order')?.orderId }
  }, id)
  expect(orderId.id).toBeTruthy()
  const order = (await (
    await page.request.get(`/api/v1/businesses/${id}/orders/${orderId.id}`)
  ).json()) as { version: number }
  const sent = await page.request.post(`/api/v1/businesses/${id}/orders/${orderId.id}/send`, {
    data: { version: order.version },
  })
  expect(sent.ok()).toBe(true)
  await expect
    .poll(
      async () => {
        const latest = (await (
          await page.request.get(`/api/v1/businesses/${id}/orders/${orderId.id}`)
        ).json()) as { messages: { author: string }[] }
        return latest.messages.some((message) => message.author === 'supplier')
      },
      { timeout: 45_000, intervals: [2000] },
    )
    .toBe(true)
  await reopen(page)
  await page.getByTestId('back-to-chat').click()
  // The supplier's answer, in words, and the card with its latest status.
  await expect(page.getByText(/replied/).first()).toBeVisible()
  await expect(page.getByText(/Confirmed/).first()).toBeVisible()
  await noSidewaysScroll(page)
})

test('OB-351: the Change a price chip opens a price sheet that works without the AI', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await realShop(page)
  // No message reaches the coach on this path.
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/coach/stream')) asked.push(request.url())
  })
  const box = page.getByRole('textbox', { name: /Ask|Message/ }).first()
  await box.fill('hello')
  await page.getByRole('button', { name: /^Send/ }).click()
  await expect(page.getByRole('button', { name: 'Change a price' })).toBeVisible()
  asked.length = 0
  await page.getByRole('button', { name: 'Change a price' }).click()
  const sheet = page.getByRole('dialog', { name: 'Change a price' })
  await expect(sheet).toBeVisible()
  // The chat box is not filled in, as it used to be.
  await expect(page.locator('textarea').first()).toHaveValue('')
  const row = sheet.locator('[data-price-item="Sugar"]')
  await row.getByRole('button', { name: /₹45/ }).click()
  await row.getByRole('textbox').fill('1,050')
  await row.getByRole('textbox').press('Enter')
  await row.getByRole('button', { name: /Save ₹1,050/ }).click()
  await expect(row.getByRole('button', { name: /₹1,050/ })).toBeVisible()
  expect(asked).toEqual([])
  await noSidewaysScroll(page)
})

test.describe('Hindi phone', () => {
  test('OB-346: the total form and its review read in Hindi', async ({ page }) => {
    test.setTimeout(90_000)
    await realShop(page)
    await page.evaluate(() =>
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language: 'hi', appearance: 'light' }),
      ),
    )
    await page.reload()
    await page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
    await page.getByRole('button', { name: 'बढ़ाएँ', exact: true }).click()
    await page.locator('[data-tour="closeday"]').click()
    const close = page.getByRole('dialog', { name: /दिन बंद/ })
    await close.getByRole('button', { name: 'सिर्फ़ कुल रकम लिखें' }).click()
    await close.getByRole('textbox', { name: 'कुल बिक्री' }).fill('1,00,000')
    await close.getByRole('button', { name: /नकद और UPI/ }).click()
    await expect(close.getByRole('textbox', { name: 'नकद' })).toBeVisible()
    await expect(close.getByText('= ₹1,00,000')).toBeVisible()
    await noSidewaysScroll(page)
  })
})
