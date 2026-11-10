import { test, expect, type Page } from '@playwright/test'
import { shopMore } from './support/shopMore.js'
import { pinShopTime, SHOP_TIMES } from './support/shopClock.js'
import { openBuyStock, openGrowTool, showInGrow } from './support/grow.js'

test.setTimeout(90_000)

const errorsOf = new WeakMap<Page, string[]>()

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  // A separate visitor per test: the public demo limits allocations per address.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `vendor-${info.testId}-${Math.random()}` })
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  errorsOf.set(page, errors)
})

/** Opens /demo, waits for the welcome sheet and skips it, as a visitor would. */
async function openDemo(page: Page) {
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Skip', exact: true })
    .click({ timeout: 30_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

async function tab(page: Page, name: 'coach' | 'shop' | 'grow' | 'you') {
  await page.locator(`[data-tour="nav-${name}"]`).click({ timeout: 5000 })
  await expect(page.locator(`[data-tour="nav-${name}"]`)).toHaveAttribute('aria-current', 'page')
}

async function noErrors(page: Page) {
  const alerts = await page.getByRole('alert').allInnerTexts()
  expect(
    alerts.filter((text) => /couldn.t|could not|failed|went wrong|error|try again/i.test(text)),
  ).toEqual([])
  expect(errorsOf.get(page)).toEqual([])
}

/** The destination is the actual thread list: a demo customer and its conversation are on screen. */
async function showsThread(page: Page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Priya', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(
    dialog.getByText('Is Masala chai available this afternoon?', { exact: false }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Open conversation' }).first()).toBeVisible()
}

/** Taps a button; the sheet it opens is on screen with `heading` and nothing broke. */
async function opensSheet(page: Page, button: RegExp, heading: RegExp) {
  await page.getByRole('button', { name: button }).first().click({ timeout: 5000 })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByText(heading).first()).toBeVisible({ timeout: 10_000 })
  await noErrors(page)
}

test('tabs stay tappable after load, also after a reload', async ({ page }) => {
  await openDemo(page)
  for (const name of ['shop', 'grow', 'you', 'coach'] as const) await tab(page, name)
  await page.reload()
  // The visitor already chose; nothing re-appears over the tabs.
  await page.waitForTimeout(4000)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const name of ['shop', 'grow', 'you', 'coach'] as const) await tab(page, name)
  await noErrors(page)
})

test('Buy stock: Order more opens the purchase order draft', async ({ page }) => {
  await openDemo(page)
  // With 13 kg already on its way and nothing running out, Today has no Reorder or Order more
  // (OB-263): the draft is one tap away in Grow → Buy stock.
  await expect(page.getByRole('button', { name: /^(Reorder|Order more)$/ })).toHaveCount(0)
  await tab(page, 'grow')
  const stock = await openBuyStock(page)
  await stock.getByRole('button', { name: 'Order more', exact: true }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByText(/^Tea dust from Sri Lakshmi Provisions \(Demo\)$/)
      .first(),
  ).toBeVisible()
})

// A waiting customer is time-sensitive: Reply is on the card itself at every hour, never behind
// "N more things", also in the evening when "Close the day" leads. One sandbox for all four hours
// (the public demo caps live sandboxes): the clock moves and the page reloads.
test('Coach: Reply opens the message thread, at every hour of the shop day', async ({ page }) => {
  for (const [index, time] of SHOP_TIMES.entries()) {
    await pinShopTime(page, time)
    if (index === 0) await openDemo(page)
    else await page.reload()
    const card = page.getByTestId('today')
    await expect(card.getByRole('button', { name: /^Reply$/ }), time).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('today-more'), time).toHaveCount(0)
    // The close window really is on: "Close the day" leads, and Reply is still beside it.
    if (time >= '20:00')
      await expect(card.getByRole('button', { name: 'Close the day' }), time).toBeVisible()
  }
  await opensSheet(page, /^Reply$/, /Messages/)
  await showsThread(page)
})

test('Grow: Open messages opens the message thread', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  // The brief's best action, inside its Morning brief row (batch 4a).
  await showInGrow(page, page.getByRole('button', { name: /^Open messages$/ }))
  await opensSheet(page, /^Open messages$/, /Messages/)
  await showsThread(page)
})

test('Grow: Rescue deals opens the rescue screen', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  await opensSheet(page, /Rescue deals/, /rescue/i)
})

test('Grow: How much to make opens its own screen', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  await openGrowTool(page, /^How much to make/)
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'How much to make' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('dialog')
      .getByText(/Masala chai/)
      .first(),
  ).toBeVisible()
  await noErrors(page)
  await expect(page.getByTestId('today')).toBeHidden()
})

test('Shop: Your shop page opens its sheet', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await opensSheet(page, /^Your shop page/, /Your shop page/)
})

test('Shop: Show to customers opens the page switch', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await opensSheet(page, /^Show to customers$/, /Your shop page/)
})

test('Shop: More, Stamp card opens its sheet', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await shopMore(page)
  await opensSheet(page, /^Stamp card/, /Stamp card/)
})

test('Shop: Link your billing app opens its sheet', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await shopMore(page)
  await opensSheet(page, /Link your billing app/, /Link your billing app/)
})

test('Shop: Messages opens the message thread', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await opensSheet(page, /^Messages/, /Messages/)
  await showsThread(page)
})

test('You: the deferred face check is not offered (OB-269)', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await expect(page.getByRole('button', { name: /Start my own shop/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Verify it/ })).toHaveCount(0)
  await noErrors(page)
})

test('You: Remind me turns on without an error', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  const remind = page.getByRole('switch', { name: /Remind me/i })
  await remind.scrollIntoViewIfNeeded()
  await remind.click()
  await expect(remind).toBeChecked()
  await expect(remind).toBeInViewport()
  await expect(page.locator('#reminder-status')).toBeVisible()
  await expect(page.locator('#reminder-status')).not.toHaveText(/couldn|failed|error/i)
  await noErrors(page)
})

// OB-248: a new shop is the visitor's own, so both rows leave the demo for the real start.
for (const row of [/New shop/, /Start my own shop/]) {
  test(`You: ${row.source} leaves the demo for the real start`, async ({ page }) => {
    await openDemo(page)
    await tab(page, 'you')
    await page.getByRole('button', { name: row }).click()
    await expect(page).not.toHaveURL(/\/demo/, { timeout: 15_000 })
    expect(errorsOf.get(page)).toEqual([])
  })
}

for (const shop of ['FreshMart', 'Metro Foods']) {
  test(`You: switch to ${shop}`, async ({ page }) => {
    await openDemo(page)
    await tab(page, 'you')
    await page.getByRole('button', { name: new RegExp(shop) }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(shop)
    await tab(page, 'coach')
    await expect(page.getByTestId('today')).toBeVisible()
    await tab(page, 'grow')
    await expect(page.getByTestId('grow-tiles')).toBeVisible()
    await noErrors(page)
  })
}

test('prep numbers and dates are identical on every reload', async ({ page }) => {
  const seen: string[] = []
  for (let load = 0; load < 3; load++) {
    await page
      .context()
      .setExtraHTTPHeaders({ 'x-forwarded-for': `reload-${load}-${Math.random()}` })
    await page.evaluate(() => {
      try {
        sessionStorage.clear()
      } catch {
        /* about:blank */
      }
    })
    await openDemo(page)
    const today = await page.getByTestId('today').innerText()
    const runsOut = /runs out ([A-Za-z]{3}, [A-Za-z]{3} \d+)/.exec(today)?.[1]
    // Or, with its order on the way counted (OB-263), what is coming instead of a day.
    const coming = /Tea dust: (\d+ kg arriving \w+)/.exec(today)?.[1]
    await tab(page, 'grow')
    // The brief opens in place from its Morning brief row (batch 4a).
    const brief = page.getByRole('region', { name: 'Morning brief' })
    await showInGrow(page, brief)
    const prep = (await brief.innerText()).replace(/\s+/g, ' ')
    const low = /Tea dust Left: [\d.]+ kg Runs out ([A-Za-z]{3}, [A-Za-z]{3} \d+)/.exec(prep)?.[1]
    // One source of truth: Today and the Grow brief name the same run-out day, or both none.
    expect(runsOut ?? coming, 'Today names a run-out day or what is coming').toBeTruthy()
    expect(low, 'The Grow brief names the same run-out day').toBe(runsOut)
    const numbers = /Prep today.*?Weather/.exec(prep)?.[0]
    expect(numbers).toMatch(/Masala chai \d+ cup/)
    seen.push(JSON.stringify({ numbers, runsOut, coming, low }))
  }
  expect(new Set(seen).size, seen.join('\n')).toBe(1)
})
