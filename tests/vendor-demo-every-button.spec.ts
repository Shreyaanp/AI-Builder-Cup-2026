import { test, expect, type Page } from '@playwright/test'

test.setTimeout(90_000)

const NOTICE = "This is a demo shop; changes aren't saved"
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

test('Coach: Reorder opens the purchase order draft', async ({ page }) => {
  await openDemo(page)
  await opensSheet(page, /^Reorder$/, /Purchase orders/)
  await expect(page.getByRole('dialog').getByText(/PO /).first()).toBeVisible()
})

test('Coach: Reply opens the message thread', async ({ page }) => {
  await openDemo(page)
  await opensSheet(page, /^Reply$/, /Messages/)
  await showsThread(page)
})

test('Grow: Open messages opens the message thread', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  await opensSheet(page, /^Open messages$/, /Messages/)
  await showsThread(page)
})

test('Grow: Rescue deals opens the rescue screen', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  await opensSheet(page, /Rescue deals/, /rescue/i)
})

test('Grow: Prep plan opens its own screen', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  await page.getByRole('button', { name: /^Prep plan/ }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Prep plan' })).toBeVisible()
  await expect(
    page
      .getByRole('dialog')
      .getByText(/Masala chai/)
      .first(),
  ).toBeVisible()
  await noErrors(page)
  await expect(page.getByTestId('today')).toBeHidden()
})

test('Shop: Customer page opens its sheet', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await opensSheet(page, /^Customer page/, /Customer page/)
})

test('Shop: Connect your system opens its sheet', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await opensSheet(page, /Connect your system/, /Connect your system/)
})

test('Shop: Messages opens the message thread', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await opensSheet(page, /^Messages/, /Messages/)
  await showsThread(page)
})

test('You: Verify it is you answers with the demo note', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await page
    .getByRole('button', { name: /Verify it/ })
    .first()
    .click()
  await expect(page.getByText(NOTICE)).toBeVisible()
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

test('You: New shop answers with the demo note', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await page.getByRole('button', { name: /New shop/ }).click()
  await expect(page.getByText(NOTICE)).toBeVisible()
  await noErrors(page)
})

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
    await tab(page, 'grow')
    const brief = page.locator('section', { hasText: 'Prep today' }).first()
    await expect(brief).toBeVisible({ timeout: 15_000 })
    const prep = (await brief.innerText()).replace(/\s+/g, ' ')
    const low = /Tea dust Left: [\d.]+ Runs out ([A-Za-z]{3}, [A-Za-z]{3} \d+)/.exec(prep)?.[1]
    // One source of truth: Today and the Grow brief name the same run-out day.
    expect(runsOut, 'Today names a run-out day').toBeTruthy()
    expect(low, 'The Grow brief names the same run-out day').toBe(runsOut)
    const numbers = /Prep today.*?Weather/.exec(prep)?.[0]
    expect(numbers).toMatch(/Masala chai \d+ cup/)
    seen.push(JSON.stringify({ numbers, runsOut, low }))
  }
  expect(new Set(seen).size, seen.join('\n')).toBe(1)
})
