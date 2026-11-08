import { expect, test, type Page } from '@playwright/test'
import { openBuyStock } from './support/grow.js'

// OB-263, OB-301: Home stops asking you to reorder what is already on the way. After Reorder →
// Approve and send the row says "N kg arriving … ✓" with nothing to tap; after Goods arrived it
// says the stock was topped up, once, and no goods receipt is left "needing" the owner. A rainy
// morning keeps a compact rain cue within the 360 fit.

test.setTimeout(150_000)

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob263-${info.testId}-${Math.random()}` })
})

/** Today at hh:mm in the demo shop's time (India), never ahead of the server's clock. */
function shopTime(hh: number) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const at = new Date(`${day}T${String(hh).padStart(2, '0')}:00:00+05:30`)
  return at.getTime() <= Date.now() ? at : new Date(at.getTime() - 24 * 3600_000)
}

async function openDemo(page: Page, width = 390, height = 844) {
  await page.setViewportSize({ width, height })
  await page.clock.setFixedTime(shopTime(10))
  await page.goto('/demo')
  // The intro's last button is Skip, in any language.
  await page.getByRole('dialog').getByRole('button').last().click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today-needs')).toBeVisible({ timeout: 15_000 })
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

/**
 * The demo's 13 kg is already on its way and nothing runs out before it lands, so Today asks
 * for nothing. Ordering more is Buy stock → Draft a reorder → Approve and send, with the sheet
 * still open afterwards.
 */
async function reorder(page: Page) {
  const row = page.getByTestId('today-needs').locator('[data-tour="today-supply"]')
  await expect(row.getByTestId('today-supply-line')).toHaveText(
    /^Tea dust: 13 kg arriving [A-Z][a-z]{2}\u00a0✓$/,
    { timeout: 15_000 },
  )
  // No button, and no "Order more" that would ask for a second order for no reason.
  await expect(row.getByRole('button')).toHaveCount(0)
  await expect(row).not.toContainText(/Still runs out/)
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page, 'To do')
  // Arriving news is not a to do: no ✓ row under To do.
  await expect(sheet).not.toContainText('arriving')
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  const card = page.getByRole('dialog').locator('article')
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(card.getByTestId('supplier-talk')).toContainText('Your order is on the way', {
    timeout: 30_000,
  })
  return { row, card }
}

/** Closes the order sheet and goes back to Today. */
async function backToToday(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('[data-tour="nav-coach"]').click()
  await expect(page.getByTestId('today-needs')).toBeVisible({ timeout: 15_000 })
}

test('OB-263 after Reorder → Approve and send, Today says it is arriving and asks nothing', async ({
  page,
}) => {
  await openDemo(page)
  const { row } = await reorder(page)
  await backToToday(page)
  await expect(row.getByTestId('today-supply-line')).toHaveText(
    /^Tea dust: \d+ kg arriving [A-Z][a-z]{2}\u00a0✓$/,
  )
  expect(Number(/(\d+) kg/.exec((await row.textContent()) ?? '')![1])).toBeGreaterThan(13)
  // No run-out day that ignores the delivery, and nothing to order again.
  await expect(row).not.toContainText('runs out')
  await expect(row.getByRole('button')).toHaveCount(0)
  const today = page.getByTestId('today')
  // One "Needs you now" list: no second block, no order numbers, no delivery before its day.
  await expect(today).not.toContainText(/needs? you now$|things? needs? you now/m)
  await expect(today).not.toContainText(/Order \d{6,}|\b45\d{8}\b/)
  await expect(today.getByText('Needs you now', { exact: true })).toHaveCount(1)
  await page.screenshot({ path: test.info().outputPath('ob263-after-send.png') })
})

test('OB-263 Goods arrived: what came and the stock now, Undo, then topped up once', async ({
  page,
}) => {
  await openDemo(page, 360, 800)
  const before = await teaDustStock(page)
  const { row, card } = await reorder(page)
  await card.getByRole('button', { name: 'Goods arrived', exact: true }).click()
  // The note names what came and the stock now; no review sheet, no selling price.
  const note = page.locator('.MuiSnackbar-root').filter({ hasText: 'received' })
  await expect(note).toHaveText(/(\d+) kg Tea dust received\. Stock is now (\d+) kg\.Undo/, {
    timeout: 15_000,
  })
  const [, came, now] = /(\d+) kg Tea dust received\. Stock is now (\d+) kg/.exec(
    (await note.textContent()) ?? '',
  )!
  expect(Number(now)).toBe(before + Number(came))
  await expect(page.getByText('Check before saving')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('₹320')
  expect(await teaDustStock(page)).toBe(Number(now))
  // Over the order sheet the note keeps off its header: the title and the back arrow stay
  // uncovered and tappable (360 wide).
  const header = page.getByRole('dialog').getByRole('heading', { level: 2, name: /Tea dust from/ })
  const noteOnSheet = (await note.boundingBox())!
  const headerBox = (await header.boundingBox())!
  expect(
    noteOnSheet.y >= headerBox.y + headerBox.height ||
      noteOnSheet.y + noteOnSheet.height <= headerBox.y,
    'the Undo note covers the order sheet header',
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath('ob263-note-on-sheet.png') })

  await backToToday(page)
  // The Undo note is still up, and it does not cover the "topped up" row (360 wide).
  const noteBox = await note.boundingBox()
  const rowBox = await row.boundingBox()
  if (noteBox && rowBox)
    expect(
      noteBox.y + noteBox.height <= rowBox.y || noteBox.y >= rowBox.y + rowBox.height,
      'the Undo note covers the topped up row',
    ).toBe(true)
  await expect(row.getByTestId('today-supply-line')).toHaveText(
    `Tea dust stock topped up: ${now} kg\u00a0✓`,
  )
  await expect(row.getByRole('button')).toHaveCount(0)
  // The goods receipt went with Goods arrived: nothing about this delivery needs the owner.
  const today = page.getByTestId('today')
  await expect(today).not.toContainText(/Goods receipt|thing needs you now/)
  await expect(today).not.toContainText(/Order \d{6,}/)
  await page.screenshot({ path: test.info().outputPath('ob263-topped-up.png') })

  // Said once: the next visit shows what is still on its way instead.
  await page.reload()
  await expect(page.getByTestId('today-needs')).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByTestId('today-needs').locator('[data-tour="today-supply"]'),
  ).not.toContainText('topped up', { timeout: 15_000 })
  await expect(page.getByTestId('today')).not.toContainText(/Goods receipt/)
})

test('OB-263 Undo after Goods arrived puts the stock back', async ({ page }) => {
  await openDemo(page)
  const before = await teaDustStock(page)
  const { card } = await reorder(page)
  await card.getByRole('button', { name: 'Goods arrived', exact: true }).click()
  const note = page.locator('.MuiSnackbar-root').filter({ hasText: 'received' })
  // The note sits outside the open sheet, which hides the rest of the page from roles.
  await note.locator('button', { hasText: 'Undo' }).click({ timeout: 15_000 })
  await expect(page.locator('.MuiSnackbar-root')).toContainText(
    'Undone. The order is on its way again.',
  )
  await expect.poll(() => teaDustStock(page), { timeout: 15_000 }).toBe(before)
  await expect(card.getByRole('button', { name: 'Goods arrived', exact: true })).toBeVisible()
})

/** How far Today runs past its screen (0 when it fits). */
function overflow(page: Page) {
  return page.evaluate(() => {
    let scroller = document.querySelector<HTMLElement>('[data-testid="today"]')!.parentElement
    while (scroller && getComputedStyle(scroller).overflowY !== 'auto')
      scroller = scroller.parentElement
    return scroller!.scrollHeight - scroller!.clientHeight
  })
}

for (const language of ['en', 'hi'] as const) {
  test(`OB-301 a rainy morning on 360×800 in ${language}: a rain cue, one screenful`, async ({
    page,
  }) => {
    await page.addInitScript(
      (lang) =>
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: lang })),
      language,
    )
    await page.route(/\/businesses\/[^/]+\/today(\?|$)/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      await route.fulfill({ response, json: { ...body, line: { kind: 'rain', rain: 70 } } })
    })
    await openDemo(page, 360, 800)
    const pulse = page.getByTestId('today-pulse')
    await expect(pulse).toContainText('☔ 70%')
    await expect(pulse).toHaveAttribute(
      'aria-label',
      language === 'hi' ? /आज बारिश की संभावना \(70%\)/ : /Rain likely today \(70%\)/,
    )
    await page.waitForTimeout(1500)
    expect(await overflow(page), 'Today scrolls past one screenful').toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    await page.screenshot({ path: test.info().outputPath(`ob301-rain-360-${language}.png`) })
  })
}
