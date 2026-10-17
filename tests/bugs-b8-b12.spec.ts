import { createShop, detailsStep, editShopDetails } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/api/generated.js'

type DayHours = components['schemas']['DayHours']
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

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

async function enter(page: Page, fixture = true, weekly_hours?: DayHours[]) {
  if (fixture) {
    await page.route('**/api/v1/businesses', (route) =>
      route.fulfill({
        json: [
          { ...business, fields: { ...business.fields, phone: '+65 6000 0000', weekly_hours } },
        ],
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
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  const pending = page.getByRole('region', { name: '1 customer is waiting' })
  await expect(pending).toBeVisible()
  expect((await pending.boundingBox())!.height).toBeLessThanOrEqual(80)
  await proof(page, 'B8')
  // Readiness lives on Grow now, as the Get on Google card.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Get on Google Ready to list/ })).toBeVisible()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
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

test('B10: empty recap is compact, has no empty headings and uses a date range', async ({
  page,
}) => {
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
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const tile = page.getByRole('button', { name: /^Weekly recap/ })
  await expect(tile).not.toContainText('2026-W42')
  await expect(tile).toContainText('12–18 Oct')
  await tile.click()
  const sheet = page.getByRole('dialog', { name: 'Weekly recap' })
  await expect(sheet).toContainText('12–18 Oct')
  await expect(sheet.getByRole('alert')).toContainText('No saved sales this week')
  await expect(sheet).toContainText('Recorded sold-out switches: 0')
  await expect(sheet).toContainText('Customer messages: 0')
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveCount(0)
  await expect(sheet.getByText('Written by AI', { exact: true })).toHaveCount(0)
  await expect(sheet.getByText('Offline template', { exact: true })).toHaveCount(0)
  await expect(sheet).not.toContainText('Import your sales to prepare')
  expect((await sheet.boundingBox())!.height).toBeLessThan(360)
  await proof(page, 'B10')
})

test('#149: radar with omitted opportunities shows an empty sheet', async ({ page }) => {
  await enter(page)
  await page.route('**/api/v1/businesses/*/radar', (route) =>
    route.fulfill({
      json: { area_label: null, approximate: true, radius: 2000, days: 14, demo: false },
    }),
  )
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const tile = page.getByRole('button', { name: /^Asked nearby/ })
  await expect(tile).toBeVisible()
  await tile.click()
  await expect(page.getByRole('dialog', { name: 'Asked nearby' })).toBeVisible()
})

test('#150: recap with omitted recap_week stays hidden', async ({ page }) => {
  await enter(page)
  await page.route('**/api/v1/businesses/*/freshness', (route) =>
    route.fulfill({ json: { today: '2026-10-14', last_confirmed: null, monday: false } }),
  )
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Weekly recap/ })).toHaveCount(0)
})

for (const mode of ['offline', 'gemini']) {
  test(`B10: ${mode} recap has exactly one truthful source label`, async ({ page }) => {
    await enter(page)
    await page.route('**/api/v1/businesses/*/recap?*', (route) =>
      route.fulfill({
        json: {
          week: '2026-W42',
          currency: 'SGD',
          sales_days: 2,
          previous_sales_days: 1,
          top_sellers: [{ item: 'Kopi', quantity: 20, revenue: 3600 }],
          slow_movers: [],
          revenue: 3600,
          previous_revenue: 1800,
          revenue_change: 1800,
          revenue_change_percent: 100,
          sold_out_count: 1,
          customer_questions_count: 2,
          summary: 'Two saved sales days this week.',
          language: 'en',
          mode,
        },
      }),
    )
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Weekly recap/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Weekly recap' })
    await expect(
      sheet.getByText(mode === 'offline' ? 'Offline template' : 'Written by AI', { exact: true }),
    ).toBeVisible()
    await expect(
      sheet.getByText(mode === 'offline' ? 'Written by AI' : 'Offline template', { exact: true }),
    ).toHaveCount(0)
    await expect(sheet.getByRole('heading', { name: 'Top sellers' })).toBeVisible()
    await expect(sheet.getByRole('heading', { name: 'Slow movers' })).toHaveCount(0)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  })
}

test('B11: weekday hours are reviewed, saved and shown publicly', async ({ page }) => {
  await enter(page, false)
  await createShop(page, 'name: Katong Night Kopi')
  await editShopDetails(page)
  await detailsStep(page, 'Hours')
  await page.getByLabel('Hours note (optional)', { exact: true }).fill('Ask about holiday hours')
  await page.getByLabel('Set hours by weekday').check()
  await expect(page.locator('input[type="time"]')).toHaveCount(2)
  for (const day of [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]) {
    await expect(page.getByRole('button', { name: day, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
  await expect(
    page.getByText('Closing before opening means the next day.', { exact: true }),
  ).toHaveCount(0)
  await page.getByLabel('Opens', { exact: true }).fill('22:00')
  await page.getByLabel('Closes', { exact: true }).fill('02:00')
  await page.getByRole('button', { name: 'Sunday', exact: true }).click()
  await page
    .getByRole('button', { name: 'Different hours on some days', exact: true })
    .scrollIntoViewIfNeeded()
  await proof(page, 'B11')
  await page.getByRole('button', { name: 'Different hours on some days', exact: true }).click()
  await expect(page.locator('input[type="time"]')).toHaveCount(14)
  await page.getByLabel('Saturday: Opens', { exact: true }).fill('21:00')
  await page
    .getByLabel('Set hours by weekday')
    .evaluate((node) => node.closest('label')!.scrollIntoView({ block: 'start' }))
  await proof(page, 'B11-expanded')
  await page.getByLabel('Saturday: Opens', { exact: true }).fill('22:00')
  await expect(page.locator('input[type="time"]')).toHaveCount(2)
  await expect(
    page.getByRole('button', { name: 'Different hours on some days', exact: true }),
  ).toBeFocused()
  for (const target of await page
    .getByRole('dialog')
    .locator('input[type="time"], button[aria-pressed], button[aria-expanded]')
    .all()) {
    const bounds = (await target.boundingBox())!
    expect(bounds.height).toBeGreaterThanOrEqual(48)
    expect(bounds.width).toBeGreaterThanOrEqual(48)
  }
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Weekly hours' })).toContainText('22:00–02:00 (+1)')
  await page.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Katong Night Kopi' })).toBeVisible()
  const saved = (await page.evaluate(async () => (await fetch('/api/v1/businesses')).json())) as {
    id: string
    fields: { weekly_hours: unknown[] }
  }[]
  expect(saved[0].fields.weekly_hours).toEqual(
    weekdays.map((day) => ({
      day,
      closed: day === 'sun',
      open: day === 'sun' ? null : '22:00',
      close: day === 'sun' ? null : '02:00',
    })),
  )
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
  // Hours sit behind the Weekly hours toggle so the menu leads the page.
  await page.getByRole('button', { name: /^Weekly hours/ }).click()
  await expect(page.getByRole('region', { name: 'Weekly hours' })).toContainText('22:00–02:00 (+1)')
  await expect(page.getByRole('region', { name: 'Weekly hours' })).toContainText('SundayClosed')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('B11: existing different hours survive editing, and shared times survive closing every day', async ({
  page,
}) => {
  const hours: DayHours[] = weekdays.map((day) => ({
    day,
    closed: false,
    open: day === 'sat' ? '10:00' : '09:00',
    close: '18:00',
  }))
  await enter(page, true, hours)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await detailsStep(page, 'Hours')
  await expect(page.locator('input[type="time"]')).toHaveCount(14)
  await expect(page.getByLabel('Saturday: Opens', { exact: true })).toHaveValue('10:00')
  await page.route('**/api/v1/proposals', (route) => {
    expect(route.request().postDataJSON().business.weekly_hours).toEqual(hours)
    return route.fulfill({ status: 503, json: {} })
  })
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Saturday: Opens', { exact: true }).fill('09:00')
  await expect(page.locator('input[type="time"]')).toHaveCount(2)
  const dayButtons = page.getByRole('dialog').locator('button[aria-pressed]')
  for (const button of await dayButtons.all()) await button.click()
  await expect(page.getByLabel('Opens', { exact: true })).toHaveValue('09:00')
  await page.getByRole('button', { name: 'Monday', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Monday', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByLabel('Closes', { exact: true })).toHaveValue('18:00')
  await page.getByLabel('Set hours by weekday').uncheck()
  await expect(page.locator('input[type="time"]')).toHaveCount(0)
  await expect(page.getByLabel('Hours note (optional)', { exact: true })).toHaveValue(
    business.fields.hours,
  )
})

for (const locale of [
  'en-SG',
  'zh-Hans-SG',
  'ms-MY',
  'ta-SG',
  'ja-JP',
  'ko-KR',
  'id-ID',
  'th-TH',
  'vi-VN',
  'fil-PH',
]) {
  test.describe(`B10 date locale ${locale}`, () => {
    test.use({ locale })
    test('formats the week and a year boundary using the device locale', async ({ page }) => {
      // Keep controls in English while retaining the browser's native Intl date locale.
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'languages', { get: () => ['en-SG'] }),
      )
      await enter(page)
      for (const [week, first, last] of [
        ['2026-W42', '2026-10-12', '2026-10-18'],
        ['2020-W53', '2020-12-28', '2021-01-03'],
      ]) {
        await page.route('**/api/v1/businesses/*/freshness', (route) =>
          route.fulfill({
            json: { today: '2026-10-14', last_confirmed: null, monday: false, recap_week: week },
          }),
        )
        await page.getByRole('button', { name: 'Grow', exact: true }).click()
        const expected = await page.evaluate(
          ({ first, last }) =>
            new Intl.DateTimeFormat(undefined, {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
              year: first.slice(0, 4) !== last.slice(0, 4) ? 'numeric' : undefined,
            }).formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`)),
          { first, last },
        )
        await expect(page.getByRole('button', { name: /^Weekly recap/ })).toContainText(expected)
        await page.getByRole('button', { name: 'Coach', exact: true }).click()
      }
    })
  })
}

test('B12: compact categories, uncategorised last and sold-out last', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Menu' })
  // B28: each category is a grid of item cards; sold-out items are marked and sort last.
  await expect(
    dialog.getByRole('region', { name: 'Drinks', exact: true }).getByRole('listitem'),
  ).toHaveText(['KopicupS$1.80', 'TehcupSold outS$1.60'])
  expect(
    await dialog
      .getByRole('region')
      .evaluateAll((nodes) => nodes.map((node) => node.querySelector('h3')?.textContent)),
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
    'Kopi/ cupS$1.80',
    expect.stringContaining('Teh'),
  ])
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})
