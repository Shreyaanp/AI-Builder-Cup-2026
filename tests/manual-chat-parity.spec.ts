import { expect, test, type Page } from '@playwright/test'
import { openBuyStock } from './support/grow.js'

// Chat and screens are one app (owner, 9 Nov: "features should all work without the chat flow
// too. The chat flow and the manual flow need to be in sync"). Each action is done once on its
// screen and checked from the chat, and once in the chat and checked on its screen. Offline
// demo: no model is called, so these also prove the screens never wait on the AI.
test.setTimeout(120_000)

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `parity-${info.testId}-${Math.random()}`,
  })
  await page.setViewportSize({ width: 390, height: 844 })
})

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
}

async function enter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const terms = page.getByLabel('I agree to the Terms')
  if (
    await terms.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    )
  ) {
    await terms.check()
    await page.getByLabel('I have read the Privacy Notice').check()
    await page.getByRole('button', { name: 'Agree and continue' }).click()
  }
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

/** A saved Singapore shop (the owner's own, not the scripted demo) with two menu items. */
async function savedShop(page: Page) {
  await localOnly(page)
  await enter(page)
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      geocode_confirmed: true,
      business: {
        name: 'Tiong Bahru Kopi',
        category: 'Kopi stall',
        location: 'Tiong Bahru, Singapore',
        hours: '00:00–23:59',
      },
      products: [
        { name: 'Kopi', price: 180, unit: 'cup' },
        { name: 'Kaya toast', price: 240, unit: 'set' },
      ],
    },
  })
  const proposal = await prepared.json()
  const saved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  const { business_id: id } = await saved.json()
  await enter(page)
  return id as string
}

async function say(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

async function toShop(page: Page) {
  await page.locator('[data-tour="nav-shop"]').click()
  await expect(page.getByTestId('shop-tiles')).toBeVisible()
}

async function toCoach(page: Page) {
  await page.locator('[data-tour="nav-coach"]').click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible()
}

async function closeSheet(page: Page) {
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close' }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function confirmReview(page: Page) {
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible({ timeout: 30_000 })
  await review.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect(review).toHaveCount(0)
}

test('sold out on the screen: the coach lists it on its next answer', async ({ page }) => {
  await savedShop(page)
  await toShop(page)
  await page.getByRole('button', { name: /^Sold out/ }).click()
  const samosa = page.getByRole('switch', { name: 'Available: Kaya toast' })
  await samosa.click()
  await expect(samosa).not.toBeChecked()
  await closeSheet(page)
  await toCoach(page)
  await say(page, 'Which items are sold out?')
  await expect(page.getByRole('log')).toContainText(/Sold out right now: .*Kaya toast/, {
    timeout: 30_000,
  })
})

test('sold out in the chat: the Sold out screen shows it at once', async ({ page }) => {
  await savedShop(page)
  await say(page, 'Kaya toast sold out')
  await confirmReview(page)
  await toShop(page)
  await page.getByRole('button', { name: /^Sold out/ }).click()
  await expect(page.getByRole('switch', { name: 'Available: Kaya toast' })).not.toBeChecked()
})

test('closed today on the screen: the coach knows on its next answer', async ({ page }) => {
  await savedShop(page)
  await toShop(page)
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await page.getByRole('switch', { name: 'Closed today' }).click()
  await confirmReview(page)
  await toCoach(page)
  await say(page, 'Am I open right now?')
  await expect(page.getByRole('log')).toContainText('Customers see you as closed right now.', {
    timeout: 30_000,
  })
})

test('closed today in the chat: Shop details shows the switch on', async ({ page }) => {
  await savedShop(page)
  await say(page, 'We are closed today')
  await confirmReview(page)
  await toShop(page)
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await expect(page.getByRole('switch', { name: 'Closed today' })).toBeChecked()
})

test('a note said in chat links to My shop, which lists it at once', async ({ page }) => {
  await savedShop(page)
  await say(page, 'Remember that the milkman comes at 6')
  const link = page.getByRole('button', { name: 'See it in My shop', exact: true })
  await expect(link).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('log')).toContainText("I'll remember that.")
  await link.click()
  const details = page.getByRole('dialog').last()
  await expect(details.getByText('the milkman comes at 6', { exact: true })).toBeVisible()
})

test('a note typed in My shop needs no chat, and the chat keeps one list', async ({ page }) => {
  await savedShop(page)
  await toShop(page)
  await page.getByRole('button', { name: /^Shop details/ }).click()
  const sheet = page.getByRole('dialog').last()
  await sheet
    .getByRole('textbox', { name: 'Add a note for the coach' })
    .fill('Supplier comes Tuesdays')
  await sheet.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByText('Saved. The coach knows it now.')).toBeVisible()
  await expect(sheet.getByText('Supplier comes Tuesdays', { exact: true })).toBeVisible()
  await closeSheet(page)
  // The coach saves into the same list: the same words are not kept twice.
  await toCoach(page)
  await say(page, 'Remember that supplier comes tuesdays')
  await page.getByRole('button', { name: 'See it in My shop', exact: true }).click()
  await expect(
    page
      .getByRole('dialog')
      .last()
      .getByText(/supplier comes tuesdays/i),
  ).toHaveCount(1)
})

test('find a supplier from Buy stock answered with no model call', async ({ page }) => {
  await savedShop(page)
  await page.route('**/api/v1/coach/stream', async (route) => {
    // The screen's sentence is answered before any model call (instant path).
    const body = route.request().postDataJSON() as { message?: string }
    expect(body.message).toBe('My milk is running low. Find suppliers.')
    await route.fallback()
  })
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page, 'Find a supplier')
  await sheet.getByRole('textbox', { name: 'What do you need?' }).fill('Milk')
  await sheet.getByRole('button', { name: 'Find a supplier', exact: true }).last().click()
  await expect(page.getByRole('log')).toContainText(/suppliers near you for milk/i, {
    timeout: 30_000,
  })
})

async function openMenu(page: Page) {
  await toShop(page)
  await page.getByTestId('shop-tiles').getByRole('button', { name: /^Menu/ }).click()
  const sheet = page.getByRole('dialog').last()
  await expect(sheet.locator('[data-menu-card="Kopi"]')).toBeVisible()
  return sheet
}

async function factsSheet(page: Page) {
  await toShop(page)
  await page.getByRole('button', { name: /^Shop details/ }).click()
  return page.getByRole('dialog').last()
}

test('Find a supplier, Order, Send on a saved shop: On the way shows it', async ({ page }) => {
  await savedShop(page)
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page, 'Find a supplier')
  await sheet.getByRole('textbox', { name: 'What do you need?' }).fill('Milk')
  await sheet.getByRole('textbox', { name: /^(How much|Quantity)/ }).fill('20 L')
  await sheet.getByRole('button', { name: 'Find a supplier', exact: true }).last().click()
  const log = page.getByRole('log')
  await expect(log).toContainText(/suppliers near you for milk/i, { timeout: 30_000 })
  const list = log.getByRole('list', { name: /suppliers? nearby/ }).last()
  await list.getByRole('button', { name: 'Order', exact: true }).first().click()
  await expect(log.getByText(/^Order from number 1: 20 litre milk$/i)).toBeVisible()
  // The instant path's own words: the order card came with no model call.
  await expect(log).toContainText(/Your order to .+ is ready below/, { timeout: 30_000 })
  const send = log.getByRole('button', { name: /^Send to / }).last()
  const supplier = ((await send.getAttribute('aria-label')) ?? '').replace('Send to ', '')
  await send.click()
  await expect(log.getByText(`Sent to ${supplier}`).last()).toBeVisible({ timeout: 30_000 })
  await page.locator('[data-tour="nav-grow"]').click()
  const hub = await openBuyStock(page, 'On the way')
  await expect(hub.getByText(supplier).first()).toBeVisible({ timeout: 30_000 })
})

test('stock said in chat: the menu shows the count', async ({ page }) => {
  await savedShop(page)
  await say(page, 'Kopi is 5 left')
  await confirmReview(page)
  const menu = await openMenu(page)
  await expect(menu.locator('[data-stock="Kopi"]')).toHaveText('5 left')
  // A count is never a price.
  await expect(menu.getByRole('button', { name: /^Edit price: Kopi, .*1\.80$/ })).toBeVisible()
})

test('stock tapped to 0 on the menu: the coach lists it sold out', async ({ page }) => {
  await savedShop(page)
  await say(page, 'Kopi is 1 left')
  await confirmReview(page)
  const menu = await openMenu(page)
  const card = menu.locator('[data-menu-card="Kopi"]')
  await card.getByRole('button', { name: 'One less Kopi' }).click()
  await expect(card.locator('[data-stock="Kopi"]')).toHaveText('Sold out')
  await closeSheet(page)
  await toCoach(page)
  await say(page, 'What is sold out?')
  await expect(page.getByRole('log')).toContainText(/Sold out right now: .*Kopi/, {
    timeout: 30_000,
  })
})

test('price said in chat: the menu shows the new price', async ({ page }) => {
  await savedShop(page)
  await say(page, 'Kopi is 3 dollars now')
  await confirmReview(page)
  const menu = await openMenu(page)
  await expect(menu.getByRole('button', { name: /^Edit price: Kopi, .*3\.00$/ })).toBeVisible()
})

test('price edited on the menu: the coach starts from it', async ({ page }) => {
  await savedShop(page)
  const menu = await openMenu(page)
  await menu.getByRole('button', { name: /^Edit price: Kopi/ }).click()
  const field = menu.getByRole('textbox', { name: 'Edit price: Kopi' })
  await field.fill('2.2')
  await field.press('Enter')
  await menu.getByRole('button', { name: /^Save .*2\.20$/ }).click()
  await expect(menu.getByRole('button', { name: /^Edit price: Kopi, .*2\.20$/ })).toBeVisible()
  await closeSheet(page)
  await toCoach(page)
  await say(page, 'Kopi is 3 dollars now')
  // The coach's message names the old price: the one just saved on the screen.
  await expect(page.getByText(/Kopi: price 2.2 → 3/).first()).toBeAttached({ timeout: 30_000 })
})

test('fact said in chat: Shop details shows it answered', async ({ page }) => {
  await savedShop(page)
  await say(page, 'halal yes')
  await confirmReview(page)
  const sheet = await factsSheet(page)
  await expect(sheet.getByRole('region', { name: 'What customers ask' })).toContainText('Halal')
})

test('fact tapped in Shop details: saved on the record the coach reads', async ({ page }) => {
  const id = await savedShop(page)
  const sheet = await factsSheet(page)
  await sheet.getByRole('button', { name: 'Yes', exact: true }).first().click()
  await confirmReview(page)
  const shops = (await (await page.request.get('/api/v1/businesses')).json()) as { id: string }[]
  expect(JSON.stringify(shops.find((shop) => shop.id === id)).toLowerCase()).toContain('halal')
})
