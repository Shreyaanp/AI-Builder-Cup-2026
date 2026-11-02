import { expect, test, type Page, type Request } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// HABIT slice 1, the evening loop on a phone. At 20:30 "Close the day" leads Today even with a
// stock-first playbook and three low items (change 1); the close screen pays back only true
// facts: today's total and a comparison with the same weekday, left out in a shop's first week
// (change 3); and the visit is counted as numbers only, never names (section 9). Local only,
// offline coach.
test.skip(({ isMobile }) => !isMobile, '390×844 phone story')
test.use({ viewport: { width: 390, height: 844 } })

const shopDay = (back: number) =>
  new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
const weekday = (back: number) =>
  new Intl.DateTimeFormat('en-SG', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${shopDay(back)}T12:00:00Z`),
  )

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

/** Type one sales line in Close the day and save it. */
async function closeWith(page: Page, item: string, quantity: string, amount: string) {
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: /type/i }).first().click()
  await dialog.locator('input[name=item]').fill(item)
  await dialog.locator('input[name=quantity]').fill(quantity)
  await dialog.locator('input[name=amount]').fill(amount)
  await dialog.locator('form button[type=submit]').click()
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await dialog.getByRole('button', { name: 'Save day' }).click()
  return dialog
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)

test('Close the day leads at 20:30, pays back a same-weekday comparison, and counts no names', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Sharma Evening Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 2 },
    { name: 'Sugar', price: 4800, unit: 'kg', stock: 3 },
    { name: 'Tea dust', price: 32000, unit: 'kg', stock: 1 },
  ])
  // Last week's same day is on record (₹2,250), and a bigger day before that never counts.
  await sell(page, id, 7, [{ item: 'Masala chai', quantity: 75, amount: 2250 }])
  await sell(page, id, 1, [{ item: 'Masala chai', quantity: 90, amount: 4000 }])
  // A playbook that leads with stock, the case where the close prompt used to drop off.
  await page.route('**/api/v1/businesses/*/today', async (route) => {
    const response = await route.fetch()
    const real = await response.json()
    await route.fulfill({
      response,
      json: {
        ...real,
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
  const counted: Record<string, unknown>[] = []
  const bodies: string[] = []
  page.on('request', (request: Request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/businesses/${id}/habit`)) {
      bodies.push(request.postData() ?? '')
      counted.push(...(request.postDataJSON() as { events: Record<string, unknown>[] }).events)
    }
  })
  await open(page, name)
  const rows = page.getByTestId('today-needs').locator('[data-need]')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toHaveAttribute('data-need', 'closeDay')
  await expect(rows.nth(1)).toHaveAttribute('data-need', 'low')
  await expect(rows.nth(2)).toHaveAttribute('data-need', 'low')

  await rows.first().getByRole('button', { name: 'Close the day' }).click()
  const dialog = await closeWith(page, 'Masala chai', '72', '2490')
  await expect(dialog.getByRole('heading', { name: 'Day closed: ₹2,490' })).toBeVisible({
    timeout: 20_000,
  })
  // Only the same weekday is compared: last week's ₹2,250, not yesterday's ₹4,000.
  const reward = dialog.getByTestId('close-reward')
  await expect(reward).toHaveText(`₹240 more than last ${weekday(7)}`)
  await expect(dialog).not.toContainText('4,000')
  expect(await fitsWidth(page)).toBe(true)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)

  // The row is gone and the pulse says today's amount.
  await expect(page.locator('[data-need="closeDay"]')).toHaveCount(0)
  const pulse = page.getByTestId('today-pulse')
  await expect(pulse).toContainText('₹2,490')
  await expect(pulse).not.toContainText('Yesterday')
  // The chat path gives the same facts: tapping today's pulse asks how today went.
  await expect(pulse).toHaveAccessibleName(/How did today go\?$/)
  await pulse.click()
  await expect(
    page.getByText(`₹2,490 saved. That is ₹240 more than last ${weekday(7)}.`),
  ).toBeVisible({
    timeout: 20_000,
  })

  // The visit was counted: opened, the close prompt shown and acted on, the day closed.
  await expect
    .poll(() => counted.map((e) => `${e.event}${e.kind ? `:${e.kind}` : ''}`), { timeout: 10_000 })
    .toEqual(
      expect.arrayContaining([
        'opened',
        'prompt_shown:closeDay',
        'prompt_shown:low',
        'action_done:closeDay',
        'closed',
      ]),
    )
  const first = counted.find((e) => e.event === 'action_done')!
  expect(typeof first.seconds).toBe('number')
  // Counts only: no shop name, item or amount ever leaves in a count.
  for (const body of bodies) {
    expect(body).not.toContain('Sharma')
    expect(body).not.toContain('Masala')
    expect(body).not.toContain('2490')
  }
})

test('A shop in its first week closes the day with no comparison line (360 px, dark)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 360, height: 780 })
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'New Week Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
  ])
  // Six days of records: no earlier same weekday exists yet.
  for (let back = 6; back >= 1; back--)
    await sell(page, id, back, [{ item: 'Masala chai', quantity: 50, amount: 1000 }])
  await page.evaluate(() =>
    localStorage.setItem(
      'niva.starter.preferences',
      JSON.stringify({ language: 'en', appearance: 'dark' }),
    ),
  )
  await open(page, name)
  const close = page.locator('[data-need="closeDay"]')
  await expect(close).toBeVisible()
  await close.getByRole('button', { name: 'Close the day' }).click()
  const dialog = await closeWith(page, 'Masala chai', '60', '1200')
  await expect(dialog.getByRole('heading', { name: 'Day closed: ₹1,200' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(dialog.getByTestId('close-reward')).toHaveCount(0)
  await expect(dialog).not.toContainText(/more than|less than|Same as/)
  expect(await fitsWidth(page)).toBe(true)
  // The main action stays a full thumb target.
  const done = await dialog.getByRole('button', { name: 'Done' }).boundingBox()
  expect(done!.height).toBeGreaterThanOrEqual(48)
})

test('Hindi: the close screen says the same-weekday line in Hindi', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 412, height: 900 })
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const id = await teaStall(page, 'Hindi Chai Corner', [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
  ])
  await sell(page, id, 7, [{ item: 'Masala chai', quantity: 80, amount: 2600 }])
  await page.evaluate(() =>
    localStorage.setItem(
      'niva.starter.preferences',
      JSON.stringify({ language: 'hi', appearance: 'light' }),
    ),
  )
  await page.reload()
  await page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await page.locator('[data-need="closeDay"]').getByRole('button').first().click()
  const dialog = page.getByRole('dialog')
  await dialog
    .locator('button', { has: page.locator('svg.lucide-keyboard') })
    .first()
    .click()
  await dialog.locator('input[name=item]').fill('Masala chai')
  await dialog.locator('input[name=quantity]').fill('70')
  await dialog.locator('input[name=amount]').fill('2490')
  await dialog.locator('form button[type=submit]').click()
  await dialog.locator('button.MuiButton-sizeLarge').click()
  await dialog.locator('button.MuiButton-sizeLarge').click()
  await expect(dialog.getByRole('heading', { name: 'दिन बंद हुआ: ₹2,490' })).toBeVisible({
    timeout: 20_000,
  })
  // ₹110 less than last week's same day, said plainly once.
  await expect(dialog.getByTestId('close-reward')).toContainText('पिछले')
  await expect(dialog.getByTestId('close-reward')).toContainText('₹110 कम')
  expect(await fitsWidth(page)).toBe(true)
})
