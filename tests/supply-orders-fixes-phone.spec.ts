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

/** A kirana with onions (kg) and milk (l), 12 of each and four weeks of sales: both run out
 * within the week (#603: more than one need). */
async function kirana(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await localOnly(page)
  await enter(page)
  const name = 'Corner Store'
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Grocery',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          phone: '+919876543210',
          weekly_hours: [{ day: 'thu', open: '07:00', close: '20:00', closed: false }],
          stamps_needed: 8,
          reward_text: 'Your tenth bag is free',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Onions', price: 4000, unit: 'kg', category: 'Veg', stock: 12 },
          { name: 'Milk', price: 6000, unit: 'l', category: 'Dairy', stock: 12 },
        ],
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  const { business_id: id } = await approved.json()
  const shopDay = (back: number) =>
    new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
  for (let back = 28; back >= 1; back--) {
    const v = 3 + (back % 3)
    const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
      data: {
        date: shopDay(back),
        sales: [
          { item: 'Onions', quantity: v, amount: v * 40 },
          { item: 'Milk', quantity: v, amount: v * 60 },
        ],
      },
    })
    const { sales } = await day.json()
    await page.request.post(`/api/v1/businesses/${id}/import/${sales.import_id}/approve`, {
      data: { digest: sales.digest },
    })
  }
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
  await page.keyboard.press('Escape')
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
        need.covered = false
        need.cover = 'none'
        need.on_order_other = []
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
    // The detail sheet is named after the order: "Purchase orders Milk from Fresh Dairy".
    const detail = page.getByRole('dialog', { name: /^Purchase orders .+ from / })
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
    await expect(tile).toContainText('No suppliers yet')
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

  test(`#603 at ${size.width}: a covered item never hides the next one that runs out, on Today and Grow`, async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await kirana(page, size)
    const today = page.getByRole('region', { name: 'Supply chain' })
    await expect(today).toContainText(/(Onions|Milk) runs out/, { timeout: 30_000 })
    await expect(today).toContainText('1 more item runs out')
    const first = (await today.innerText()).includes('Onions runs out') ? 'Onions' : 'Milk'
    const other = first === 'Onions' ? 'Milk' : 'Onions'
    await today.getByRole('button', { name: 'Reorder', exact: true }).click()
    const card = page.getByRole('article')
    await card
      .getByRole('button', { name: 'Approve and send', exact: true })
      .click({ timeout: 30_000 })
    await expect(card).toContainText('Marked Sent')
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    // Same screen, no navigation: the item still to order leads, with its own Reorder.
    await expect(today).toContainText(`${other} runs out`)
    await expect(today).not.toContainText('on order')
    await expect(today).not.toContainText('more item')
    await expect(today.getByRole('button', { name: 'Reorder', exact: true })).toBeVisible()
    await noSideScroll(page)

    // Grow reads the same needs: the same item and day, with Find suppliers for it.
    const day = (await today.innerText()).match(new RegExp(`${other} runs out (.+)`))?.[1]
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const tile = page.getByRole('button', { name: new RegExp(`^${other} runs out`) })
    await expect(tile).toContainText('Find suppliers')
    await expect(tile).toContainText(day?.trim() ?? '')
    await expect(page.getByRole('button', { name: new RegExp(`^${first} runs out`) })).toHaveCount(
      0,
    )
    await noSideScroll(page)

    // Grow has no "runs out" rule of its own: when the needs say nothing runs out, it shows
    // nothing, whatever the forecast its prep plan reads.
    await page.route(/\/businesses\/[^/]+\/supply$/, async (route) => {
      const body = await (await route.fetch()).json()
      await route.fulfill({ json: { ...body, needs: [] } })
    })
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Prep plan/ })).toContainText(/Onions|Milk/)
    await expect(page.getByRole('button', { name: /runs out|running low/ })).toHaveCount(0)
  })

  test(`#603 at ${size.width}: the Grow tile follows its own Purchase orders sheet`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await startShop(page, size)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Supply chain' })).toContainText(/Milk runs out/)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const tile = page.getByRole('button', { name: /^Milk runs out/ })
    // 12 l on its way is short of the week's 25 l: still to order, with what is coming shown.
    await expect(tile).toContainText('Find suppliers')
    await expect(tile).toContainText(/12 l on order, arriving/)

    // Draft and approve on Grow's own sheet, close it: the tile reads covered at once.
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    const sheet = page.getByRole('dialog', { name: /^Purchase orders/ })
    await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
    const card = page.getByRole('article')
    await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
    await expect(card).toContainText('Marked Sent')
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tile).toContainText(/24 l on order, arriving/)
    await expect(tile).not.toContainText('Find suppliers')

    // Cancel one sent order on the same sheet, close it: no stale "24 l on order".
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await sheet.getByRole('list', { name: 'Purchase orders' }).getByRole('button').first().click()
    const detail = page.getByRole('dialog', { name: /^Purchase orders .+ from / })
    await detail.getByRole('button', { name: 'Cancel order' }).click()
    await detail.getByRole('button', { name: 'Cancel order' }).click()
    await expect(detail).toContainText('Cancelled. Fresh Dairy (Demo) was told.', {
      timeout: 15_000,
    })
    await detail.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tile).toContainText(/12 l on order, arriving/)
    await expect(tile).toContainText('Find suppliers')
    await noSideScroll(page)
  })

  test(`#603 at ${size.width}: the Grow tile follows a goods receipt on the Supply chain sheet`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await startShop(page, size)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Supply chain' })).toContainText(/Milk runs out/)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const tile = page.getByRole('button', { name: /^Milk runs out/ })
    await expect(tile).toContainText(/12 l on order, arriving/)

    // Receive the whole order from the Supply chain sheet, close it: no stale "on order".
    await page.getByRole('button', { name: /^Supply chain/ }).click()
    const hub = page.getByRole('dialog', { name: 'Supply chain' })
    await hub.getByRole('button', { name: /^On the way/ }).click()
    await hub.getByRole('button', { name: /^Fresh Dairy \(Demo\)/ }).click()
    const dairy = page.getByRole('dialog', { name: 'Fresh Dairy (Demo)' })
    await dairy.getByRole('button', { name: 'Goods arrived', exact: true }).click()
    await dairy.getByRole('button', { name: 'All received', exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Check before saving' })
    await review.getByRole('button', { name: 'Confirm and save', exact: true }).click()
    await expect(review).toHaveCount(0)
    await dairy.getByRole('button', { name: 'Close', exact: true }).click()
    await hub.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText(/on order, arriving/)).toHaveCount(0)
    await noSideScroll(page)
  })
}

for (const size of WIDTHS) {
  test(`#603 at ${size.width}: a buyer's order the shop must ship is not stock on order`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await startShop(page, size)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Supply chain' })).toContainText(/Milk runs out/)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const tile = page.getByRole('button', { name: /^Milk runs out/ })
    await expect(tile).toContainText(/12 l on order, arriving/)

    // The demo partner is a buyer: its order for 20 l Milk is one to ship, not stock coming in.
    await page.getByRole('button', { name: /^Supply chain/ }).click()
    const hub = page.getByRole('dialog', { name: 'Supply chain' })
    await hub.getByRole('button', { name: /^On the way/ }).click()
    const next = hub.getByRole('button', { name: 'Show next step (demo)' })
    await next.click()
    await expect(hub).toContainText(/Forecast · Expects 20 l Milk/)
    await next.click()
    await expect(hub).toContainText(/New order · Milk/)
    await hub.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tile).toContainText(/12 l on order, arriving/)
    await expect(tile).toContainText('Find suppliers')
    await expect(page.getByText(/32 l on order/)).toHaveCount(0)
    await noSideScroll(page)
  })
}

for (const size of WIDTHS) {
  test(`#603 at ${size.width}: an invoiced order that has not arrived is still on order`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await startShop(page, size)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Supply chain' })).toContainText(/Milk runs out/)

    // The supplier's invoice arrives before the goods (demo simulate), up to "invoiced".
    const shops = await (await page.request.get('/api/v1/businesses')).json()
    const list = shops.businesses ?? shops
    const last = list[list.length - 1]
    const bid = last.id ?? last.business_id
    const supply = async () => (await page.request.get(`/api/v1/businesses/${bid}/supply`)).json()
    for (let step = 0; step < 6; step++) {
      const po = (await supply()).orders.find((o: { number: string }) => o.number === '4500012345')
      if (po.status === 'invoiced') break
      const path = po.status === 'changed' ? 'accept' : 'simulate'
      const res = await page.request.post(
        `/api/v1/businesses/${bid}/supply/orders/${po.id}/${path}`,
        { data: { version: po.version } },
      )
      expect(res.ok()).toBe(true)
    }
    const po = (await supply()).orders.find((o: { number: string }) => o.number === '4500012345')
    expect([po.status, !!po.received]).toEqual(['invoiced', false])

    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const tile = page.getByRole('button', { name: /^Milk runs out/ })
    await expect(tile).toContainText(/12 l on order, arriving/)
    await expect(tile).toContainText('Find suppliers')
    await noSideScroll(page)
  })
}
