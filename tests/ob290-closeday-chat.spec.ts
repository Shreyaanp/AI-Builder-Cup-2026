import { test, expect, type Page } from '@playwright/test'

// OB-290 follow-ups: Close the day from the chat in Hindi opens the same sheet as Grow, and once
// the day is closed the chat and the Grow card both say so, in lakhs (₹1,00,000). Offline demo.
test.setTimeout(120_000)

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `ob290-chat-${info.testId}-${Math.random()}`,
  })
  await page.setViewportSize({ width: 360, height: 800 })
})

async function openDemo(page: Page, hindi = false) {
  if (hindi)
    await page.addInitScript(() =>
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
    )
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: hindi ? 'छोड़ें' : 'Skip', exact: true })
    .click({ timeout: 30_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

async function say(page: Page, text: string, hindi = false) {
  await page.getByRole('textbox', { name: hindi ? 'संदेश' : 'Message', exact: true }).fill(text)
  await page.getByRole('button', { name: hindi ? 'भेजें' : 'Send', exact: true }).click()
}

test('OB-290 Hindi: दिन बंद करें in the chat is a button that opens Close the day', async ({
  page,
}) => {
  await openDemo(page, true)
  await say(page, 'दिन बंद करें', true)
  const log = page.getByRole('log')
  const open = log.getByRole('button', { name: 'दिन बंद करें खोलें' })
  await expect(open).toBeVisible({ timeout: 30_000 })
  // Never the shop's hours: बंद is the day here, not the shop.
  await expect(log).not.toContainText('डेमो दुकान का समय')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await open.click()
  const sheet = page.getByRole('dialog', { name: 'दिन बंद करें' })
  await expect(sheet.getByRole('button', { name: 'संख्याएँ खुद लिखें' })).toBeVisible()
})

test('OB-290 a day closed from the chat: the chat and Grow both say it is closed, in lakhs', async ({
  page,
}) => {
  await openDemo(page)
  await say(page, 'Close the day')
  const log = page.getByRole('log')
  await log.getByRole('button', { name: 'Open Close the day' }).click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog', { name: 'Close the day' })
  await sheet.getByRole('button', { name: 'Type the numbers instead' }).click()
  await sheet.locator('input[name="item"]').fill('Masala chai')
  await sheet.locator('input[name="quantity"]').fill('10')
  await sheet.locator('input[name="amount"]').fill('1,00,000')
  await sheet.getByRole('button', { name: 'Review (1 line)' }).click()
  await sheet.getByRole('button', { name: 'Close the day', exact: true }).click()
  // Before the shop's evening the early check asks once.
  const anyway = page.getByRole('button', { name: 'Close anyway' })
  const done = page.getByRole('button', { name: 'Done', exact: true })
  await expect(anyway.or(done)).toBeVisible({ timeout: 30_000 })
  if (await anyway.isVisible()) await anyway.click()
  await expect(sheet).toContainText('Day closed: ₹1,00,000', { timeout: 30_000 })
  await done.click()
  await expect(sheet).toHaveCount(0)

  // Asked again: the chat knows, and the same button edits it.
  await say(page, 'Close the day')
  await expect(log).toContainText('Today is already closed: ₹1,00,000. Open it below to edit.', {
    timeout: 30_000,
  })
  // Home says the same total the sheet saved.
  await page.getByTestId('back-to-today').click()
  await expect(page.getByTestId('today-pulse')).toContainText('₹1,00,000')

  await page.getByRole('navigation').last().getByRole('button', { name: 'Grow' }).click()
  await expect(page.locator('[data-tour="closeday"]')).toContainText('Day closed: ₹1,00,000 · Edit')
})
