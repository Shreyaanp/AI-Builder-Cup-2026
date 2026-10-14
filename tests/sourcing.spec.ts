import { expect, test, type Page } from '@playwright/test'

// Offline coach script: the same tool calls Gemini makes, so the story runs without a model.
async function openWithShop(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await say(page, 'Shop name: Flour Test Bakery; category: Bakery')
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toBeHidden()
}

async function say(page: Page, text: string) {
  await page.locator('textarea[name="message"]').fill(text)
  await page.locator('form button[type="submit"]').last().click()
}

test('running low → demo suppliers → one-tap order → supplier reply → Orders', async ({ page }) => {
  test.setTimeout(90_000)
  await openWithShop(page)

  await say(page, 'My flour is running low')
  const carousel = page.getByRole('list', { name: /suppliers nearby/ })
  await expect(carousel).toBeVisible()
  const cards = carousel.getByRole('listitem')
  expect(await cards.count()).toBeGreaterThanOrEqual(3)
  // Simulated suppliers are always labelled.
  await expect(cards.first().getByText('Demo', { exact: true })).toBeVisible()
  await expect(page.getByText(/not real businesses/).first()).toBeVisible()

  await say(page, 'The second one looks good, order 20 kg flour and 5 kg sugar from them')
  const send = page.getByRole('button', { name: /^Send to / })
  await expect(send).toBeVisible()
  await expect(page.getByText('20 kg', { exact: true })).toBeVisible()
  await expect(page.getByText('Nothing is sent until you tap Send. No payment.')).toBeVisible()

  await send.click()
  // The demo wholesaler answers automatically and the coach announces it.
  await expect(page.getByText(/replied: “Confirmed:/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Automatic demo reply').first()).toBeVisible()

  await page.getByRole('button', { name: 'Open conversation' }).click()
  const thread = page.getByRole('dialog')
  await thread.getByRole('textbox').fill('Can you deliver by 8am?')
  await thread.getByRole('button', { name: 'Send' }).click()
  await expect(thread.getByText(/Yes, we can deliver by 8/)).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  const tile = page.getByRole('button', { name: /^Orders/ })
  await expect(tile).toContainText('1 open')
  await tile.click()
  await expect(page.getByRole('dialog', { name: 'Orders' })).toContainText('Confirmed')
})
