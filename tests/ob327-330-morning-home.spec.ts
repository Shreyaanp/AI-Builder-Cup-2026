import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'
import { growTool, openMake } from './support/grow.js'

// Opening the app in the morning shows this morning (OB-327 to OB-330). The server's day is real,
// so "yesterday's close" is a saved day dated yesterday and the browser clock sits at 08:00.
// Local only, offline coach.
test.skip(({ isMobile }) => !isMobile, 'phone story')

const shopDay = (back: number) =>
  new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)

const PREVIEW = { en: 'Continue local preview', hi: 'स्थानीय प्रीव्यू जारी रखें' }

async function shop(page: Page, name: string, category: string, products: object[]) {
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category,
          location: 'Koramangala, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9352, lng: 77.6245, accuracy_m: 0, source: 'pin' },
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

const BAKERY = [
  { name: 'Black forest cake', price: 90000, unit: 'kg', stock: 30 },
  { name: 'Chocolate truffle cake', price: 100000, unit: 'kg', stock: 30 },
  { name: 'Brownie', price: 6000, unit: 'piece', stock: 40 },
]

async function close(page: Page, id: string, back: number, sales: object[]) {
  const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
    data: { date: shopDay(back), sales },
  })
  const prepared = (await day.json()).sales
  const saved = await page.request.post(
    `/api/v1/businesses/${id}/import/${prepared.import_id}/approve`,
    { data: { digest: prepared.digest } },
  )
  expect(saved.ok()).toBe(true)
}

const PRIYA = [
  { item: 'Chocolate truffle cake', quantity: 1.5, amount: 1350 },
  { item: 'Black forest cake', quantity: 2, amount: 2100 },
  { item: 'Brownie', quantity: 12, amount: 720 },
]

async function open(page: Page, language: 'en' | 'hi' = 'en') {
  await page.evaluate(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance: 'light' },
  )
  await page.reload()
  await page.getByRole('button', { name: PREVIEW[language] }).click()
}

async function morning(page: Page, width = 360) {
  await page.setViewportSize({ width, height: width === 360 ? 800 : 844 })
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T08:00:00+05:30`))
  await localOnly(page)
  await enter(page)
}

const send = async (page: Page, text: string) => {
  await page.locator('textarea[name="message"]').fill(text)
  await page.locator('button:has(svg.lucide-arrow-up)').first().click()
}

test('OB-327: a reload lands on Home with today, and the chat is still under the menu', async ({
  page,
}) => {
  await morning(page)
  const id = await shop(page, 'Reload Bakes', 'Home bakery', BAKERY)
  await close(page, id, 1, PRIYA)
  await open(page)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
  await send(page, 'hello from yesterday')
  await expect(page.getByRole('log')).toContainText('hello from yesterday')

  await page.reload()
  await page.getByRole('button', { name: PREVIEW.en }).click()
  const today = page.getByTestId('today')
  await expect(today).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /^Good morning/ })).toBeVisible()
  await expect(page.getByTestId('today-pulse')).toContainText('Yesterday: ₹4,170')
  await expect(page.getByTestId('today-needs')).toBeVisible()
  await expect(page.getByRole('log')).toHaveCount(0)

  // Nothing is lost: an earlier chat opens from ⋯.
  await page.getByRole('button', { name: 'More options' }).click()
  const sheet = page.getByRole('dialog').filter({ hasText: 'Earlier' })
  await sheet
    .getByRole('button')
    .filter({ has: page.locator('svg.lucide-history') })
    .first()
    .click()
  await expect(page.getByRole('log')).toContainText('hello from yesterday')
})

test('OB-327: left open overnight, the new morning shows Home', async ({
  page,
}) => {
  await morning(page)
  const id = await shop(page, 'Overnight Bakes', 'Home bakery', BAKERY)
  await close(page, id, 1, PRIYA)
  await open(page)
  await send(page, 'late night note')
  await expect(page.getByRole('log')).toContainText('late night note')
  await page.clock.setFixedTime(new Date(`${shopDay(-1)}T08:00:00+05:30`))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('log')).toHaveCount(0)
})

for (const [language, chip, title, sold] of [
  ['en', 'How much to make?', 'How much to make', 'Yesterday you sold'],
  ['hi', 'कितना बनाना है?', 'कितना बनाना है', 'कल आपने बेचा'],
] as const) {
  test(`OB-328 ${language}: the Home chip opens the make list, and says nothing for the owner`, async ({
    page,
  }) => {
    await morning(page)
    const id = await shop(page, `Chip Bakes ${language}`, 'Home bakery', BAKERY)
    await close(page, id, 1, PRIYA)
    await open(page, language)
    await page.getByTestId('today-chips').getByRole('button', { name: chip }).click()
    const sheet = page.getByRole('dialog', { name: title })
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await expect(sheet).toContainText(sold)
    await expect(page.getByRole('log')).toHaveCount(0)
    // Back goes to the tab under it, and a later visit opens the plain tab.
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(page.getByTestId('grow-tiles')).toBeVisible()
  })

  test(`OB-328 ${language}: typing the question opens the same list`, async ({ page }) => {
    await morning(page)
    const id = await shop(page, `Typed Bakes ${language}`, 'Home bakery', BAKERY)
    await close(page, id, 1, PRIYA)
    await open(page, language)
    await send(page, chip)
    await expect(page.getByRole('dialog', { name: title })).toBeVisible({ timeout: 15_000 })
  })
}

test('OB-328: a second visit from Home still opens the list after Grow was already seen', async ({
  page,
}) => {
  await morning(page)
  const id = await shop(page, 'Twice Bakes', 'Home bakery', BAKERY)
  await close(page, id, 1, PRIYA)
  await open(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect(page.getByTestId('grow-tiles')).toBeVisible()
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await page.getByTestId('today-chips').getByRole('button', { name: 'How much to make?' }).click()
  await expect(page.getByRole('dialog', { name: 'How much to make' })).toBeVisible()
})

test('OB-329: after one close the morning says what sold and how much to make, everywhere', async ({
  page,
}) => {
  await morning(page)
  const id = await shop(page, 'Priya Bakes', 'Home bakery', BAKERY)
  await close(page, id, 1, PRIYA)
  await open(page)

  // Home.
  await expect(page.getByTestId('today-pulse')).toContainText(
    'Make about the same: 2 kg Black forest cake, 1.5 kg Chocolate truffle cake',
    { timeout: 15_000 },
  )

  // The make list.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const row = await growTool(page, /^How much to make/)
  await expect(row).toContainText('Yesterday you sold: 2 kg Black forest cake')
  await expect(row).not.toContainText('4 weeks')
  const sheet = await openMake(page)
  await expect(sheet.getByTestId('last-day-plan')).toContainText('Yesterday you sold')
  await expect(sheet.getByTestId('last-day-plan')).toContainText('Make about the same today.')
  await expect(sheet.getByRole('listitem').first()).toContainText('Black forest cake2 kg')
  await expect(sheet.getByRole('listitem').nth(2)).toContainText('Brownie12')
  await expect(sheet).not.toContainText('4 weeks')
  await page.keyboard.press('Escape')

  // The morning brief, and its best action.
  const brief = await (await page.request.get(`/api/v1/businesses/${id}/brief`)).json()
  expect(brief.last_day.rows[0].item).toBe('Black forest cake')
  expect(brief.best_action.kind).not.toBe('record_sales')
  expect(brief.summary).toContain('Yesterday you sold')
  const openBrief = page.getByRole('button', { name: /^Morning brief/ }).first()
  if ((await openBrief.getAttribute('aria-expanded')) === 'false') await openBrief.click()
  const carousel = page.locator('section[aria-roledescription="carousel"]')
  await expect(carousel).toContainText('Yesterday you sold')
  await expect(carousel).not.toContainText('Close one day')
})

test('OB-329: a kirana sees what sold, and is never told to make it', async ({ page }) => {
  await morning(page)
  const id = await shop(page, 'Ahmed Kirana', 'Kirana store', [
    { name: 'Toor Dal', price: 16000, unit: 'kg', stock: 50, source: 'bought' },
  ])
  await close(page, id, 1, [{ item: 'Toor Dal', quantity: 9, amount: 1440 }])
  await open(page)
  await expect(page.getByTestId('today-pulse')).toContainText('Yesterday: ₹1,440', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('today-pulse')).not.toContainText('Make about')
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const sheet = await openMake(page)
  await expect(sheet.getByTestId('last-day-plan')).toContainText('Toor Dal')
  await expect(sheet.getByTestId('last-day-plan')).not.toContainText('Make about')
})

test('OB-329: a shop that never closed a day is still asked to', async ({ page }) => {
  await morning(page)
  const id = await shop(page, 'New Bakes', 'Home bakery', BAKERY)
  const brief = await (await page.request.get(`/api/v1/businesses/${id}/brief`)).json()
  expect(brief.last_day).toBeNull()
  expect(brief.summary).toContain('Close one day')
})

async function closeTonight(page: Page, lines: string[][], language: 'en' | 'hi' = 'en') {
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T20:30:00+05:30`))
  await page
    .getByRole('button', { name: language === 'hi' ? 'बढ़ाएँ' : 'Grow', exact: true })
    .click()
  await page.locator('[data-tour="closeday"]').click()
  const dialog = page.getByRole('dialog').filter({ has: page.locator('#close-day-title') })
  await dialog.locator('button:has(svg.lucide-keyboard)').click()
  const inputs = dialog.locator('input:not([type=file]):not([type=checkbox])')
  for (const [item, quantity, amount] of lines) {
    await inputs.nth(0).fill(item!)
    await inputs.nth(1).fill(quantity!)
    await inputs.nth(2).fill(amount!)
    await dialog.locator('button:has(svg.lucide-plus)').click()
  }
  await dialog.getByRole('button', { name: language === 'hi' ? /^जाँचें/ : /^Review/ }).click()
  await dialog
    .getByRole('button', { name: language === 'hi' ? /दिन बंद/ : /^Close the day$/ })
    .last()
    .click()
  return dialog
}

test('OB-330: kilos and pieces stay apart, best seller by money, and the plan picks it up', async ({
  page,
}) => {
  await morning(page)
  const id = await shop(page, 'Units Bakes', 'Home bakery', BAKERY)
  await open(page)
  const dialog = await closeTonight(page, [
    ['Chocolate truffle cake', '1.5', '1,350'],
    ['Black forest cake', '2', '2,100'],
    ['Brownie', '12', '720'],
  ])
  await expect(dialog.getByText('You sold 3.5 kg cake + 12 brownies.')).toBeVisible()
  await expect(dialog.getByText('Best seller: Black forest cake (₹2,100)')).toBeVisible()
  await expect(dialog).not.toContainText('15.5')
  await expect(dialog.getByText('Day closed: ₹4,170')).toBeVisible()
  // The promise on this screen is now true, the same evening.
  const brief = await (await page.request.get(`/api/v1/businesses/${id}/brief`)).json()
  expect(brief.last_day.date).toBe(shopDay(0))
  expect(brief.summary).toContain('Today you sold')
})

test('OB-330 hi: the summary is in Hindi with its units', async ({ page }) => {
  await morning(page)
  await shop(page, 'Hindi Bakes', 'Home bakery', BAKERY)
  await open(page, 'hi')
  const dialog = await closeTonight(
    page,
    [
      ['Black forest cake', '2', '2,100'],
      ['Brownie', '12', '720'],
    ],
    'hi',
  )
  await expect(dialog).toContainText(/आपने 2 \S+ .*केक|आपने 2 \S+ Black forest cake/)
  await expect(dialog).toContainText('+ 12')
  await expect(dialog).toContainText('₹2,100')
  await expect(dialog).not.toContainText('14')
})

test('OB-330: counted items still add up, and one item is still named', async ({ page }) => {
  await morning(page)
  await shop(page, 'Chai Corner', 'Tea stall', [
    { name: 'Masala chai', price: 2000, unit: 'cup', stock: 200 },
    { name: 'Samosa', price: 1500, unit: 'piece', stock: 200 },
  ])
  await open(page)
  const dialog = await closeTonight(page, [
    ['Masala chai', '40', '800'],
    ['Samosa', '27', '405'],
  ])
  await expect(dialog.getByText('You sold 67 items.')).toBeVisible()
  await expect(dialog.getByText('Best seller: Masala chai (₹800)')).toBeVisible()
})
