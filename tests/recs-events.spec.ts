import { expect, test, type Page, type Request } from '@playwright/test'

// Recommendations AI events (backend/app/recs_routes.py): the customer page reports real actions
// with the anonymous device id only, and stops for the session once the server switch says off.
const shop = {
  id: 'demo-recs-kopi',
  name: 'Recs Kopi Corner',
  category: 'Kopitiam',
  location: 'Somewhere (demo)',
  lat: 1.3,
  lng: 103.8,
  place_id: null,
  timezone: 'Asia/Singapore',
  demo: true,
  hours: '07:00–14:00',
  phone: '',
  currency: 'SGD',
  facts: {},
  products: [
    { name: 'Kopi O', price: 150, unit: 'cup', available: true },
    { name: 'Teh tarik', price: 180, unit: 'cup', available: false },
  ],
  last_confirmed: null,
}

// The shared machine serves the dev build slowly; these only wait on the page itself.
test.setTimeout(120_000)

async function serve(page: Page, enabled: boolean) {
  const events: Record<string, unknown>[] = []
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.route(`**/api/v1/public/shops/${shop.id}`, (route) => route.fulfill({ json: shop }))
  await page.route('**/api/v1/public/recs/events', (route, request: Request) => {
    events.push(request.postDataJSON() as Record<string, unknown>)
    return route.fulfill({ status: 202, json: { accepted: enabled, enabled } })
  })
  return events
}

test('opening a shop sends one anonymous shop_open event', async ({ page }) => {
  const events = await serve(page, true)
  await page.goto(`/s/${shop.id}`, { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: shop.name })).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => events.length).toBe(1)
  const [event] = events
  expect(event).toMatchObject({ kind: 'shop_open', shop_id: shop.id })
  expect(String(event.visitor)).toMatch(/^[0-9a-f-]{36}$/i)
  expect(Object.keys(event).sort()).toEqual(['kind', 'shop_id', 'visitor'])
})

async function remindMe(page: Page) {
  await page.route(`**/api/v1/public/shops/${shop.id}/stock-alerts`, (route) =>
    route.fulfill({ json: { expires: Date.now() / 1000 + 86_400 } }),
  )
  await page.getByRole('button', { name: 'Tell me when it’s back' }).click()
  await expect(page.getByRole('button', { name: 'Reminder saved' })).toBeDisabled()
}

test('a back-in-stock reminder reports interest in that item', async ({ page }) => {
  const events = await serve(page, true)
  await page.goto(`/s/${shop.id}`, { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: shop.name })).toBeVisible({ timeout: 60_000 })
  await remindMe(page)
  await expect.poll(() => events.length).toBe(2)
  expect(events[1]).toMatchObject({
    kind: 'remind',
    shop_id: shop.id,
    item: { name: 'Teh tarik', unit: 'cup' },
    visitor: events[0].visitor,
  })
})

test('the app stops sending once the server switch is off', async ({ page }) => {
  const events = await serve(page, false)
  await page.goto(`/s/${shop.id}`, { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: shop.name })).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => events.length).toBe(1)
  await remindMe(page)
  await page.waitForTimeout(500)
  expect(events).toHaveLength(1)
})
