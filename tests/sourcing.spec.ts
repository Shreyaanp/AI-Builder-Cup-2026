import { expect, test, type Page } from '@playwright/test'
import { openBuyStock, stockTile } from './support/grow.js'

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
  const carousel = page.getByRole('list', { name: /suppliers? nearby/ })
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

  // A slow network: the orders arrive a moment after the sheet opens. Until then it holds the
  // order's place; it never flashes the Orders list and its search field to type into by mistake.
  await page.route('**/api/v1/businesses/*/orders', async (route) => {
    await new Promise((done) => setTimeout(done, 1500))
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Open conversation' }).click()
  const thread = page.getByRole('dialog')
  await thread.getByRole('textbox').fill('Can you deliver by 8am?')
  await thread.getByRole('button', { name: 'Send' }).click()
  await expect(thread.getByText(/Yes, we can deliver by 8/)).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  // The order is Shop → Buy stock → On the way (simplify batch 4b, OB-339).
  const tile = await stockTile(page)
  await expect(tile).toContainText('1 on the way')
  const orders = await openBuyStock(page, 'On the way')
  await expect(orders).toContainText('Confirmed')
  // Delivered: no menu item matches the flour, so there is no stock review, only the status.
  await orders.getByRole('button', { name: /Lakshmi|Kallang|Cash & Carry/ }).click()
  await page.getByRole('button', { name: 'Mark as received' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile).not.toContainText('on the way')
})

async function orderFrom(page: Page, running: string, order: string) {
  await say(page, running)
  await expect(page.getByRole('list', { name: /suppliers? nearby/ }).last()).toBeVisible()
  await say(page, order)
  await page
    .getByRole('button', { name: /^Send to / })
    .last()
    .click()
  await expect(page.getByText(/replied: “Confirmed:/).last()).toBeVisible({ timeout: 30_000 })
}

test('a second order in the same session opens its thread without flashing the list', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openWithShop(page)
  await orderFrom(
    page,
    'My flour is running low',
    'The second one looks good, order 20 kg flour from them',
  )
  await page.getByRole('button', { name: 'Open conversation' }).first().click()
  await expect(page.getByRole('dialog').getByRole('textbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await orderFrom(
    page,
    'My sugar is running low',
    'The first one looks good, order 5 kg sugar from them',
  )
  // The sheet is still mounted with the first order's list; the new order is not in it yet.
  await page.route('**/api/v1/businesses/*/orders', async (route) => {
    await new Promise((done) => setTimeout(done, 1500))
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Open conversation' }).last().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Find a supplier')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /Kallang|Cash & Carry/ })).toHaveCount(0)
  await expect(sheet.locator('[aria-busy="true"]')).toBeVisible()
  await expect(sheet.getByRole('textbox')).toBeVisible({ timeout: 10_000 })
  await sheet.getByRole('textbox').fill('Can you deliver by 8am?')
  await sheet.getByRole('button', { name: 'Send' }).click()
  await expect(sheet.getByText(/Yes, we can deliver by 8/)).toBeVisible({ timeout: 30_000 })
})

test('orders that fail to load say so and can be retried', async ({ page }) => {
  test.setTimeout(90_000)
  await openWithShop(page)
  await orderFrom(
    page,
    'My flour is running low',
    'The second one looks good, order 20 kg flour from them',
  )
  let fail = true
  await page.route('**/api/v1/businesses/*/orders', async (route) => {
    if (fail) return route.abort('failed')
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Open conversation' }).last().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Couldn’t load your orders. Try again')).toBeVisible()
  await expect(sheet.locator('[aria-busy="true"]')).toHaveCount(0)
  fail = false
  await sheet.getByRole('button', { name: 'Try again' }).click()
  await expect(sheet.getByRole('textbox')).toBeVisible({ timeout: 10_000 })
})
