import { test, expect, type Page } from '@playwright/test'

// OB-261, OB-262, OB-264: the demo coach understands the owner's own words. The tour's example
// sentence and the Hindi "samosa is sold out" each become one confirm sheet with Undo, never a
// purchase or the examples list. Offline demo: no model is called.
test.setTimeout(90_000)

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `coachwords-${info.testId}-${Math.random()}`,
  })
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

async function say(page: Page, box: string, send: string, text: string) {
  await page.getByRole('textbox', { name: box, exact: true }).fill(text)
  await page.getByRole('button', { name: send, exact: true }).click()
}

test('OB-262 the tour sentence is one confirm sheet, and Undo puts samosa back', async ({
  page,
}) => {
  await openDemo(page)
  await say(page, 'Message', 'Send', 'Chai is 20 rupees now, samosa sold out')
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible({ timeout: 30_000 })
  await expect(review).toContainText('Samosa')
  await review.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect(page.getByText('Samosa: sold out for today')).toBeVisible()
  // The chat is readable again once the sheet closes.
  const log = page.getByRole('log')
  await expect(log).toContainText('Samosa: sold out')
  await expect(log).toContainText('The demo price for Masala chai is ₹20.')
  await expect(log).not.toContainText('I can help with these')
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toHaveCSS('min-height', '48px')
  await undo.click()
  await expect(page.getByText('Samosa: on sale again')).toBeVisible({ timeout: 15_000 })
})

test('OB-261 Hindi: समोसा खत्म हो गया marks samosa sold out, never a tea-dust order', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await openDemo(page, 'छोड़ें')
  await say(page, 'संदेश', 'भेजें', 'समोसा खत्म हो गया')
  const review = page.getByRole('dialog', { name: 'सहेजने से पहले जाँचें' })
  await expect(review).toBeVisible({ timeout: 30_000 })
  await expect(review).toContainText('समोसा')
  await review.getByRole('button', { name: 'पुष्टि करके सहेजें', exact: true }).click()
  await expect(page.getByText('समोसा: आज के लिए ख़त्म')).toBeVisible()
  const log = page.getByRole('log')
  await expect(log).toContainText('समोसा आज के लिए ख़त्म')
  await expect(log).toContainText('अब दुकान → खत्म खोलें।')
  // Never a purchase: no supplier list, no order card, no tea dust.
  await expect(log).not.toContainText('चाय पत्ती')
  await expect(log).not.toContainText(/Shop →|Grow →|Buy stock/)
  await page.getByRole('button', { name: 'वापस लें', exact: true }).click()
  await expect(page.getByText('समोसा: फिर से बिक्री पर')).toBeVisible({ timeout: 15_000 })
})

test('OB-264 what first answers from the shop, with buttons that open each job', async ({
  page,
}) => {
  await openDemo(page)
  await say(page, 'Message', 'Send', 'What should I do first today?')
  const log = page.getByRole('log')
  await expect(log).toContainText('First today: ', { timeout: 30_000 })
  await expect(log).not.toContainText('₹0')
  await expect(log).not.toContainText('I can help with these')
  // A button opens the job; nothing opens by itself.
  await expect(log.getByRole('button', { name: /^Open / }).first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
