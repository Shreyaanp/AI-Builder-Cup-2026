import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

const suppliers = {
  item: 'tea leaves',
  quantity: 1,
  unit: 'kg',
  currency: 'INR',
  generated_demo_suppliers: true,
  approximate_location: false,
  cheapest_id: 's1',
  nearest_id: 's1',
  suppliers: [1, 2, 3].map((rank) => ({
    rank,
    id: `s${rank}`,
    name: `Supplier ${rank}`,
    distance_km: rank,
    demo: true,
    delivery: 'Today',
    min_order: '1 kg',
    item: { name: 'Tea leaves', price: 400, unit: 'kg', available: true },
    estimate: 400,
    in_stock: [],
  })),
}

test('OB-108: supplier cards scroll inside the coach at phone widths', async ({ page }) => {
  await localOnly(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await enter(page)
  await seedShop(page)
  await page.route('**/api/v1/coach/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: [
        { kind: 'ready', mode: 'offline' },
        { kind: 'suppliers', data: suppliers },
        { kind: 'reply', text: 'Here are nearby tea suppliers.' },
        { kind: 'turn_complete' },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(''),
    }),
  )
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('Find suppliers for tea leaves')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const row = page.getByRole('list', { name: /3 suppliers nearby/i })
  await expect(row).toBeVisible()
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 800 })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true)
    const button = row.getByRole('button', { name: 'Choose' }).first()
    await expect
      .poll(() => button.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(48)
    expect(await row.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
      await row.evaluate((node) => node.clientWidth),
    )
  }
})

test('OB-109: Grow perks and Today phone shortcuts open their matching details step', async ({
  page,
}) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.getByTestId('today-day-one').getByRole('button').first().click()
  await expect(page.locator('[data-step="phone"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: 'Stamps & perks' }).click()
  await expect(page.locator('[data-step="reward"]')).toBeVisible()
})

test('OB-110: Purchase orders do not show SAP sample orders for a small shop', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Purchase orders/ }).click()
  await expect(page.getByRole('dialog', { name: 'Purchase orders' })).toBeVisible()
  await expect(page.getByText('Live from SAP sandbox')).toHaveCount(0)
  await expect(page.getByText(/\$332\.50/)).toHaveCount(0)
})

test('OB-111: Rescue links missing closing hours to the Hours step', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business_id: shop.id,
      revision: shop.revision,
      business: { ...shop.fields, weekly_hours: [] },
    },
  })
  const proposal = await prepared.json()
  expect(
    (
      await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
        data: { digest: proposal.digest },
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /Rescue/ }).click()
  await expect(page.getByText('Save your closing hours first to send a rescue.')).toBeVisible()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.locator('[data-step="hours"]')).toBeVisible()
})

test('OB-113: demo privacy explains deletion is unavailable without offering a failing action', async ({
  page,
}) => {
  await localOnly(page)
  await page.addInitScript(() => sessionStorage.setItem('chalkboard.demo.welcome.v1', '1'))
  await page.goto('/demo')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('button', { name: /^Privacy & your data/ }).click()
  await expect(page.getByRole('button', { name: 'Delete all my data' })).toHaveCount(0)
})

test('OB-114: deleting an account stops shop inquiry requests before sign-out', async ({
  page,
}) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('button', { name: /^Privacy & your data/ }).click()
  let inquiryRequests = 0
  await page.route('**/api/v1/businesses/*/inquiries**', (route) => {
    inquiryRequests += 1
    return route.fallback()
  })
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible({
    timeout: 30_000,
  })
  const afterDelete = inquiryRequests
  await page.waitForTimeout(1200)
  expect(inquiryRequests).toBe(afterDelete)
})
