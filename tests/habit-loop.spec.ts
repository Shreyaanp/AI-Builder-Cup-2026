import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// The owner's daily loop on a 390 px phone (HABIT research, 1 Nov): the evening close stays on
// Today (OB-235 #618), the pulse shows the day just closed (OB-237 #619), and the brief and the
// supply card name one readable run-out day (OB-238 #620). Local only, offline coach.
test.skip(({ isMobile }) => !isMobile, '390×844 phone story')
test.use({ viewport: { width: 390, height: 844 } })

const shopDay = (back: number) =>
  new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)

async function teaStall(page: Page, name: string, products: Record<string, unknown>[]) {
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Tea stall',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products,
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  expect(approved.ok()).toBe(true)
  return ((await approved.json()) as { business_id: string }).business_id
}

async function sell(page: Page, id: string, back: number, sales: Record<string, unknown>[]) {
  const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
    data: { date: shopDay(back), sales },
  })
  const { sales: prepared } = await day.json()
  const saved = await page.request.post(
    `/api/v1/businesses/${id}/import/${prepared.import_id}/approve`,
    { data: { digest: prepared.digest } },
  )
  expect(saved.ok()).toBe(true)
}

async function open(page: Page, name: string) {
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

test('OB-235 + OB-237: at 20:30 Close the day leads Today; once closed the pulse is today’s', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Sharma Chai Corner'
  // Three supplies are low, the case where closing the day used to drop off Today.
  await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 2 },
    { name: 'Sugar', price: 4800, unit: 'kg', stock: 3 },
    { name: 'Tea dust', price: 32000, unit: 'kg', stock: 1 },
  ])
  // A playbook that leads with stock (one Grow visit builds it), and yesterday's takings.
  await page.route('**/api/v1/businesses/*/today', async (route) => {
    const response = await route.fetch()
    const real = await response.json()
    await route.fulfill({
      response,
      json: {
        ...real,
        yesterday: { ...real.yesterday, sales: 253500 },
        hints: {
          focus: null,
          pulse: ['sales'],
          line_topics: [],
          needs_you: ['low_stock', 'questions', 'menu_check', 'missing_info'],
          metrics: ['sales'],
          units: [],
        },
      },
    })
  })
  await open(page, name)
  const rows = page.getByTestId('today-needs').locator('[data-need]')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toHaveAttribute('data-need', 'closeDay')
  await expect(rows.nth(1)).toHaveAttribute('data-need', 'low')
  const pulse = page.getByTestId('today-pulse')
  await expect(pulse).toContainText('Yesterday: ₹2,535')

  await rows.first().getByRole('button', { name: 'Close the day' }).click()
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: /type/i }).first().click()
  await dialog.locator('input[name=item]').fill('Masala chai')
  await dialog.locator('input[name=quantity]').fill('72')
  await dialog.locator('input[name=amount]').fill('2490')
  await dialog.locator('form button[type=submit]').click()
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await dialog.getByRole('button', { name: 'Save day' }).click()
  await expect(dialog.getByText('Day closed')).toBeVisible({ timeout: 20_000 })
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)

  await expect(page.locator('[data-need="closeDay"]')).toHaveCount(0)
  await expect(pulse).toContainText('₹2,490')
  await expect(pulse).not.toContainText('Yesterday')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
})

test('OB-238: the brief and the supply card name the same readable run-out day', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T08:00:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Lantern Lane Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 12 },
  ])
  for (let back = 28; back >= 1; back--) {
    const v = 3 + (back % 3)
    await sell(page, id, back, [
      { item: 'Masala chai', quantity: 20 * v, amount: 20 * v * 20 },
      { item: 'Milk', quantity: v, amount: v * 60 },
    ])
  }
  await open(page, name)
  // The supply card on Today: "Milk runs out Sun, Nov 2". Chai is made here, never reordered.
  const supply = page.locator('[data-tour="today-supply"]')
  await expect(supply).toContainText(/Milk runs out [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/)
  await expect(supply).not.toContainText('Masala chai')
  const day = /Milk runs out ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2})/.exec(
    (await supply.textContent()) ?? '',
  )![1]!

  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const low = page.locator('[aria-roledescription="slide"]').filter({ hasText: 'Running low' })
  await expect(low).toContainText('Milk')
  // The same day, in the same words: never "1 Sun".
  await expect(low).toContainText(`Runs out ${day}`)
  await expect(low).not.toContainText('Masala chai')
})
