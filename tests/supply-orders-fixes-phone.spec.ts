import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

// Owner scenario walk, 30 Oct (OB-222 #593, OB-225 #596, OB-226 #597, OB-227 #598). Local only,
// offline coach: the demo never calls a paid model.
const WIDTHS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]

async function say(page: Page, text: string) {
  await page.locator('textarea[name="message"]').fill(text)
  await page.locator('form button[type="submit"]').last().click()
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}

async function startShop(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.keyboard.press('Escape')
}

for (const size of WIDTHS) {
  test(`OB-222 + OB-225 at ${size.width}: an edited draft retires the old card; a sent order can be changed or cancelled`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await startShop(page, size)
    await say(page, 'My onions are running low')
    await expect(page.getByRole('list', { name: /suppliers nearby/ })).toBeVisible()
    await say(page, 'order 20 kg onions from the first one')
    const send = page.getByRole('button', { name: /^Send to / })
    await expect(send).toHaveCount(1)
    await say(page, 'change onions to 30 kg')
    await expect(page.getByText('30 kg', { exact: true })).toBeVisible()
    // #593: the 20 kg card no longer offers a Send that can only fail.
    await expect(page.getByText('Replaced by your new order.')).toBeVisible()
    await expect(send).toHaveCount(1)
    await send.click()
    await expect(page.getByText(/replied: “Confirmed:/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Couldn’t send. Try again.')).toHaveCount(0)

    // #596: change the quantity of the sent order, then cancel it; each shows what the
    // supplier gets, waits for a confirm and can be undone.
    await page.getByRole('button', { name: 'Open conversation' }).click()
    const thread = page.getByRole('dialog')
    await thread.getByRole('button', { name: 'Change quantity' }).click()
    await expect(thread).toContainText('gets the new quantities and confirms again')
    const amount = thread.getByRole('spinbutton')
    await expect(amount).toHaveValue('30')
    await amount.fill('40')
    await noSideScroll(page)
    await thread.getByRole('button', { name: 'Send change' }).click()
    await expect(thread.getByRole('status')).toContainText(/Sending in \d s/)
    await expect(thread.getByText(/\(was 30 kg\)/)).toBeVisible({ timeout: 15_000 })
    await expect(thread.getByText(/Noted, we've updated your order/)).toBeVisible({
      timeout: 30_000,
    })

    await thread.getByRole('button', { name: 'Cancel order' }).click()
    await expect(thread).toContainText('gets: “Sorry, please cancel this order.”')
    await thread.getByRole('button', { name: 'Send cancellation' }).click()
    await thread.getByRole('button', { name: 'Undo' }).click()
    // Undone: nothing went out, the confirm is back.
    await expect(thread.getByRole('button', { name: 'Send cancellation' })).toBeVisible()
    await expect(thread.getByText('Sorry, please cancel this order.', { exact: true })).toHaveCount(
      0,
    )
    await noSideScroll(page)
    await thread.getByRole('button', { name: 'Send cancellation' }).click()
    await expect(thread.getByText('Sorry, please cancel this order.', { exact: true })).toBeVisible(
      { timeout: 15_000 },
    )
    await expect(thread.getByText('No problem, the order is cancelled.')).toBeVisible({
      timeout: 30_000,
    })
    await expect(thread.getByRole('button', { name: 'Cancel order' })).toHaveCount(0)
  })

  test(`OB-226 + OB-225 at ${size.width}: reorder counts milk on its way; a sent PO can be cancelled`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await startShop(page, size)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
    const today = page.getByRole('region', { name: 'Supply chain' })
    await expect(today).toContainText(/Milk runs out/)
    // The demo's earlier 12 l order is on its way; Today says so.
    await expect(today).toContainText(/12 l on order, arriving/)
    await today.getByRole('button', { name: 'Reorder', exact: true }).click()
    const card = page.getByRole('article')
    await expect(card).toContainText('12 l Milk')
    await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
    await expect(card).toContainText('Marked Sent')
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // #597: with 24 l on its way, another reorder drafts nothing and says why.
    await expect(today).toContainText(/24 l on order/)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    // Grow agrees with Today: milk is covered, so no supplier search is offered for it.
    const runsOut = page.getByRole('button', { name: /^Milk runs out/ })
    await expect(runsOut).toContainText(/24 l on order, arriving/)
    await expect(runsOut).not.toContainText('Find suppliers')

    // An uncovered item (nothing on order) still shows the need and offers suppliers.
    await page.route(/\/businesses\/[^/]+\/supply$/, async (route) => {
      const body = await (await route.fetch()).json()
      for (const need of body.needs ?? []) {
        delete need.on_order
        delete need.arrives
      }
      await route.fulfill({ json: body })
    })
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Milk runs out/ })).toContainText(
      'Find suppliers',
    )
    await page.unroute(/\/businesses\/[^/]+\/supply$/)
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Purchase orders', exact: true })
    const list = sheet.getByRole('list', { name: 'Purchase orders' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
    await expect(sheet.getByRole('status')).toContainText(
      /24 l Milk is already on order, arriving .+\. No new order needed\./,
    )
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await noSideScroll(page)

    // #596: cancel a sent purchase order, with a confirm and an undo window.
    await list.getByRole('button').first().click()
    // The detail sheet is named after the order: "Purchase orders PO 45…".
    const detail = page.getByRole('dialog', { name: /^Purchase orders PO \d+$/ })
    await detail.getByRole('button', { name: 'Cancel order' }).click()
    await expect(detail).toContainText(
      'Cancel this order? Fresh Dairy (Demo) is a demo supplier: the app tells it.',
    )
    await detail.getByRole('button', { name: 'Cancel order' }).click()
    await expect(detail.getByRole('status')).toContainText(/Cancelling in \d s/)
    await detail.getByRole('button', { name: 'Undo' }).click()
    await detail.getByRole('button', { name: 'Cancel order' }).click()
    await expect(detail).toContainText('Cancelled. Fresh Dairy (Demo) was told.', {
      timeout: 15_000,
    })
    await noSideScroll(page)
  })

  test(`OB-227 at ${size.width}: empty supply states say why and what to do`, async ({ page }) => {
    test.setTimeout(90_000)
    await startShop(page, size)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const tile = page.getByRole('button', { name: /^Supply chain/ })
    await expect(tile).toContainText('No partners yet')
    await expect(tile).toContainText('Suppliers show here after your first order')
    await expect(tile).not.toContainText('all on time')
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Purchase orders', exact: true })
    await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
    // In the sheet, not a toast over it.
    await expect(sheet.getByRole('status')).toContainText(
      'Nothing runs out soon, so there is nothing to reorder. Add stock counts and sales to get a forecast.',
    )
    await expect(page.getByRole('alert').filter({ hasText: 'No purchase orders yet' })).toHaveCount(
      0,
    )
    await noSideScroll(page)
  })
}
