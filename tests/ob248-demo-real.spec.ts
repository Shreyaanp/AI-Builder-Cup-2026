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
