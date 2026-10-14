import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

test.skip(({ isMobile }) => !isMobile, '390×844 phone proof')
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
})

const products = [
  {
    id: 'sold',
    name: 'Teh',
    price: 160,
    unit: 'cup',
    stock: null,
    category: 'drinks',
    available: false,
  },
  { id: 'misc', name: 'Daily special', price: 300, unit: 'item', stock: null },
  {
    id: 'kopi',
    name: 'Kopi',
    price: 180,
    unit: 'cup',
    stock: null,
    category: 'drinks',
    available: true,
  },
  {
    id: 'toast',
    name: 'Kaya toast',
    price: 250,
    unit: 'set',
    stock: null,
    category: 'food',
    available: true,
  },
]
const business = {
  id: '00000000-0000-4000-8000-000000000012',
  revision: 1,
  registration: 'draft',
  public: true,
  google_publication: 'not_connected',
  fields: {
    name: 'Katong Kopi',
    category: 'Kopi shop',
    location: 'Katong, Singapore',
    hours: '09:00–18:00',
    phone: '',
    currency: 'SGD',
  },
}

async function enter(page: Page, fixture = true) {
  if (fixture) {
    await page.route('**/api/v1/businesses', (route) =>
      route.fulfill({
        json: [{ ...business, fields: { ...business.fields, phone: '+65 6000 0000' } }],
      }),
    )
    await page.route('**/api/v1/businesses/*/inventory', (route) =>
      route.fulfill({ json: products }),
    )
    await page.route('**/api/v1/businesses/*/inquiries', (route) =>
      route.fulfill({ json: [{ id: 'waiting', unread: true, done: false }] }),
    )
    await page.route('**/api/v1/businesses/*/freshness', (route) =>
      route.fulfill({
        json: { today: '2026-10-14', last_confirmed: null, monday: false, recap_week: '2026-W42' },
      }),
    )
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

async function proof(page: Page, id: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.screenshot({ path: `docs/bugs/${id}.png`, animations: 'disabled' })
}

test('B8: compact pending, freshness and completed readiness', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  const pending = page.getByRole('region', { name: '1 customer is waiting' })
  await expect(pending).toBeVisible()
  expect((await pending.boundingBox())!.height).toBeLessThanOrEqual(80)
  const readiness = page.getByRole('button', { name: /Readiness 6 of 6 ready/ })
  expect((await readiness.boundingBox())!.height).toBeLessThanOrEqual(64)
  await proof(page, 'B8')
  await page.getByRole('button', { name: /^Customer page/ }).click()
  const sharing = page.getByText('Customers with this link see your shop and live prices.', {
    exact: true,
  })
  await expect(sharing).toBeVisible()
  expect(
    await sharing.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeLessThanOrEqual(14)
  const link = page.getByRole('link', { name: 'Open page', exact: true })
  await expect(link).toBeVisible()
  expect(
    await link.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeLessThanOrEqual(14)
})

test('B9: one notice at practice, with a clearly named practice modal', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Google', exact: true }).click()
  const notice = page.getByText('Simulated — no Google listing is created or changed', {
    exact: true,
  })
  await expect(notice).toHaveCount(1)
  await page.getByRole('button', { name: 'Practice the steps', exact: true }).click()
  await page.locator('#google-practice').scrollIntoViewIfNeeded()
  await expect(notice).toBeVisible()
  await proof(page, 'B9')
})

test('B10: recap attribution uses distinct chips', async ({ page }) => {
  await enter(page)
  await page.route('**/api/v1/businesses/*/recap?*', (route) =>
    route.fulfill({
      json: {
        week: '2026-W42',
        currency: 'SGD',
        sales_days: 0,
        previous_sales_days: 0,
        top_sellers: [],
        slow_movers: [],
        revenue: 0,
        previous_revenue: 0,
        revenue_change: 0,
        revenue_change_percent: null,
        sold_out_count: 0,
        customer_questions_count: 0,
        summary: 'Import your sales to prepare next week’s recap.',
        language: 'en',
        mode: 'offline',
      },
    }),
  )
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Weekly recap/ }).click()
  const ai = page.getByText('Written by AI', { exact: true })
  const offline = page.getByText('Offline template', { exact: true })
  await expect(ai).toBeVisible()
  await expect(offline).toBeVisible()
  const left = (await ai.boundingBox())!,
    right = (await offline.boundingBox())!
  expect(right.x).toBeGreaterThan(left.x + left.width)
  await proof(page, 'B10')
})

test('B11: weekday hours are reviewed, saved and shown publicly', async ({ page }) => {
  await enter(page, false)
  await page.getByRole('button', { name: 'Add my shop', exact: true }).click()
  await page.getByLabel('Shop name').fill('Katong Night Kopi')
  await page.getByLabel('Opening hours', { exact: true }).fill('Ask about holiday hours')
  await page.getByLabel('Set hours by weekday').check()
  await page.getByLabel('Monday: Closed', { exact: true }).uncheck()
  await page.getByLabel('Monday: Opens', { exact: true }).fill('22:00')
  await page.getByLabel('Monday: Closes', { exact: true }).fill('02:00')
  await page.getByLabel('Sunday: Closed', { exact: true }).scrollIntoViewIfNeeded()
  await proof(page, 'B11')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Weekly hours' })).toContainText('22:00–02:00 (+1)')
  await page.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Katong Night Kopi' })).toBeVisible()
  const saved = (await page.evaluate(async () => (await fetch('/api/v1/businesses')).json())) as {
    id: string
    fields: { weekly_hours: unknown[] }
  }[]
  expect(saved[0].fields.weekly_hours).toHaveLength(7)
  await page.evaluate(
    async (id) =>
      fetch(`/api/v1/businesses/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: true }),
      }),
    saved[0].id,
  )
  await page.goto(`/explore/s/${saved[0].id}`)
  await expect(page.getByRole('region', { name: 'Weekly hours' })).toContainText('22:00–02:00 (+1)')
  await expect(page.getByRole('region', { name: 'Weekly hours' })).toContainText('TuesdayClosed')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('B12: compact categories, uncategorised last and sold-out last', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Menu' })
  await expect(
    dialog.getByRole('region', { name: 'Drinks', exact: true }).getByRole('button'),
  ).toHaveText(['Kopicup$1.80', 'TehSold out · cup$1.60'])
  expect(
    await dialog
      .getByRole('region')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))),
  ).toEqual(['Drinks', 'Food', 'Uncategorised'])
  await proof(page, 'B12')
  await dialog.getByRole('button', { name: 'Edit Kopi', exact: true }).click()
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('drinks')
  await page.getByLabel('Category', { exact: true }).fill('House specials')
  await page.route('**/api/v1/proposals', (route) => {
    const data = route.request().postDataJSON()
    expect(data.products[0].category).toBe('House specials')
    return route.fulfill({ status: 503, json: {} })
  })
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.route(`**/api/v1/public/shops/${business.id}`, (route) =>
    route.fulfill({ json: { id: business.id, ...business.fields, products, open_now: null } }),
  )
  await page.goto(`/explore/s/${business.id}`)
  await expect(page.getByRole('region', { name: 'Drinks', exact: true })).toContainText('Kopi')
  expect(
    await page
      .getByRole('region')
      .filter({ has: page.getByRole('heading', { level: 3 }) })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))),
  ).toEqual(['Drinks', 'Food', 'Uncategorised'])
  const drinks = page.getByRole('region', { name: 'Drinks', exact: true })
  expect(await drinks.getByRole('listitem').allTextContents()).toEqual([
    'Kopi/ cup$1.80',
    expect.stringContaining('Teh'),
  ])
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})
