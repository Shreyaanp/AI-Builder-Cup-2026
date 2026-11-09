import { expect, test, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { enter, localOnly, seedShop } from './stories/support.js'
import { saveCloseDay } from './closeDaySupport.js'

// Expenses and cash in hand: the close screen's Money today, the chat, home and the week.
test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })

const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const yesterday = new Date(new Date(`${day}T12:00:00Z`).getTime() - 86400_000)
  .toISOString()
  .slice(0, 10)

type Money = {
  spent: number
  sales: number | null
  left: number | null
  expenses: { amount: number; category: string; method: string; note: string; source: string }[]
  cash: { expected: number; counted: number | null; difference: number | null }
}

async function shopId(page: Page): Promise<string> {
  const [shop] = await (await page.request.get('/api/v1/businesses')).json()
  return shop.id
}

async function moneyOn(page: Page, date = day): Promise<Money> {
  const id = await shopId(page)
  return (await page.request.get(`/api/v1/businesses/${id}/money?day=${date}`)).json()
}

/** A seeded INR shop at 21:00 shop time, with the app open on Today. */
async function start(page: Page, language: 'en' | 'hi' = 'en') {
  await localOnly(page)
  await page.clock.setFixedTime(new Date(`${day}T21:00:00+05:30`))
  await enter(page)
  await seedShop(page)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  if (language === 'hi') {
    await page.getByRole('button', { name: 'You', exact: true }).click()
    await page.getByRole('combobox', { name: 'Language', exact: true }).click()
    await page.getByRole('option', { name: /हिन्दी/ }).click()
  }
}

async function openCloseDay(page: Page, title = 'Close the day') {
  await page.locator('[data-tour="nav-grow"]').click()
  await page.locator('[data-tour="closeday"]').click()
  return page.getByRole('dialog', { name: title })
}

/** Close the day with one typed line (Kopi, ₹3,000) and land on the done screen. */
async function closeWithSales(page: Page) {
  const dialog = await openCloseDay(page)
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.locator('input[name=item]').fill('Kopi')
  await dialog.locator('input[name=quantity]').fill('100')
  await dialog.locator('input[name=amount]').fill('3,000')
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await saveCloseDay(dialog)
  await expect(dialog.getByText('Day closed: ₹3,000', { exact: true })).toBeVisible()
  return dialog
}

test('manual add reads 1,000 and 170/-, asks about 1,5, and delete has Undo', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await start(page)
  const dialog = await openCloseDay(page)
  const section = dialog.getByTestId('money-today')
  await expect(section.getByRole('heading', { name: 'Money today' })).toBeVisible()
  await expect(section).toContainText('No expenses noted today.')
  await section.getByRole('button', { name: 'Add expense' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add an expense' })
  const amount = sheet.getByLabel('Amount (₹)', { exact: true })
  await amount.fill('1,5')
  await expect(sheet.getByText('Did you mean ₹1.50 or ₹15? Please type it again.')).toBeVisible()
  await amount.fill('1,000')
  await expect(sheet.getByText('= ₹1,000', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Rent', exact: true }).click()
  await sheet.getByRole('button', { name: 'UPI', exact: true }).click()
  await sheet.getByLabel('Note (optional)').fill('Shop rent')
  // Keyboard open on a 360 phone: Save stays in view.
  await amount.focus()
  await page.screenshot({ path: info.outputPath('add-expense-360-en-light.png') })
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(section.getByTestId('money-spent')).toContainText('₹1,000')
  await expect(section.getByRole('button', { name: 'Change Shop rent ₹1,000' })).toBeVisible()
  // UPI is not cash out of the drawer.
  expect((await moneyOn(page)).cash.expected).toBe(0)
  // The day's sales are not in: the drawer says so instead of a figure.
  await expect(dialog.getByTestId('cash-expected')).toContainText('After today’s sales')
  expect((await moneyOn(page)).expenses).toMatchObject([
    { amount: 100000, category: 'rent', method: 'upi', note: 'Shop rent', source: 'manual' },
  ])

  // Change it: 170/- is a hundred and seventy.
  await section.getByRole('button', { name: 'Change Shop rent ₹1,000' }).click()
  const edit = page.getByRole('dialog', { name: 'Change expense' })
  await edit.getByLabel('Amount (₹)', { exact: true }).fill('170/-')
  await expect(edit.getByText('= ₹170', { exact: true })).toBeVisible()
  await edit.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(section.getByTestId('money-spent')).toContainText('₹170')
  expect((await moneyOn(page)).spent).toBe(17000)

  // Delete, then Undo brings it back exactly.
  await section.getByRole('button', { name: 'Change Shop rent ₹170' }).click()
  await page
    .getByRole('dialog', { name: 'Change expense' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(section).toContainText('No expenses noted today.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(section.getByRole('button', { name: 'Change Shop rent ₹170' })).toBeVisible()
  expect((await moneyOn(page)).expenses).toMatchObject([{ amount: 17000, note: 'Shop rent' }])
  await page.screenshot({ path: info.outputPath('money-today-360-en-light.png'), fullPage: true })

  // A delete that fails says so, and the expense stays.
  await page.route('**/expenses/*/*', (route) =>
    route.request().method() === 'DELETE' ? route.abort() : route.continue(),
  )
  await section.getByRole('button', { name: 'Change Shop rent ₹170' }).click()
  await page
    .getByRole('dialog', { name: 'Change expense' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(section.getByTestId('money-problem')).toHaveText(
    'Couldn’t delete. Check your connection and try again.',
  )
  await expect(section.getByRole('button', { name: 'Change Shop rent ₹170' })).toBeVisible()
})

test('a count before the sales are in waits for them, then compares', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await start(page)
  const id = await shopId(page)
  await page.request.put(`/api/v1/businesses/${id}/money/${day}/cash`, {
    data: { opening: '100', counted: '3,050' },
  })
  let dialog = await openCloseDay(page)
  let drawer = dialog.getByTestId('cash-drawer')
  await expect(drawer.getByTestId('cash-waiting')).toHaveText(
    'Short or extra shows after you save today’s sales.',
  )
  await expect(drawer.getByTestId('cash-difference')).toHaveCount(0)
  await expect(drawer.getByTestId('cash-expected')).toContainText('After today’s sales')
  await drawer.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('cash-waiting-360-en-light.png'), fullPage: true })
  // Sales saved as one total, with the split: the same count now compares, and one UPI figure.
  expect(
    (
      await page.request.post(`/api/v1/businesses/${id}/day/total`, {
        data: { date: day, total: 3000, cash: 2950, upi: 50 },
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  dialog = await openCloseDay(page)
  drawer = dialog.getByTestId('cash-drawer')
  await expect(dialog.getByTestId('money-sales')).toContainText('₹3,000')
  await expect(drawer.getByTestId('cash-expected')).toContainText('₹3,050')
  await expect(drawer.getByTestId('cash-difference')).toHaveText('Matches the drawer')
  await expect(drawer.getByTestId('cash-upi-from-total')).toContainText('₹50')
  await expect(drawer.getByRole('button', { name: 'Split sales: cash and UPI' })).toHaveCount(0)
})

test('cash in hand: opening + cash sales - cash spent, and the counted difference', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  const dialog = await closeWithSales(page)
  const section = dialog.getByTestId('money-today')
  await expect(section.getByTestId('money-sales')).toContainText('₹3,000')
  await section.getByRole('button', { name: 'Add expense' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add an expense' })
  await sheet.getByLabel('Amount (₹)', { exact: true }).fill('₹500')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(section.getByTestId('money-left')).toContainText('₹2,500')
  const drawer = dialog.getByTestId('cash-drawer')
  await expect(drawer).toContainText('All sales counted as cash.')
  await drawer.getByLabel('Opening cash (₹)').fill('1,000')
  await drawer.getByLabel('Cash you counted (₹)').fill('3,450')
  await drawer.getByRole('button', { name: 'Save cash' }).click()
  // 1,000 + 3,000 - 500 = 3,500 expected; 3,450 counted.
  await expect(drawer.getByTestId('cash-expected')).toContainText('₹3,500')
  await expect(drawer.getByTestId('cash-difference')).toHaveText('₹50 short')
  // 1,200 of the sales came by UPI: 2,300 should be in the drawer, so 3,450 is 1,150 extra.
  await drawer.getByRole('button', { name: 'Split sales: cash and UPI' }).click()
  await drawer.getByLabel('Sales paid by UPI (₹)').fill('1,200')
  await drawer.getByRole('button', { name: 'Save cash' }).click()
  await expect(drawer.getByTestId('cash-difference')).toHaveText('₹1,150 extra')
  const saved = await moneyOn(page)
  expect(saved.cash).toMatchObject({ expected: 230000, counted: 345000, difference: 115000 })
  await drawer.getByLabel('Cash you counted (₹)').focus()
  await page.screenshot({ path: info.outputPath('cash-count-390-en-light.png') })
})

test('chat: "doodh 300 ka kharcha" and "paid rent 5000" are noted; a "don\'t" is not', async ({
  page,
}) => {
  await start(page)
  const id = await shopId(page)
  const say = async (text: string) => {
    await page.getByLabel('Message', { exact: true }).fill(text)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
  }
  await say('doodh 300 ka kharcha')
  await expect(page.getByRole('log')).toContainText(
    "Noted today's expense: ₹300, doodh (stock purchase), paid in cash.",
    { timeout: 20_000 },
  )
  await say('paid rent 5000')
  await expect(page.getByRole('log')).toContainText('₹5,000, rent (rent)', { timeout: 20_000 })
  await say('rent mat likho, 5000 nahi diya')
  await expect(page.getByRole('log').getByText('rent mat likho', { exact: false })).toBeVisible()
  await say('customer paid 500')
  await expect(page.getByRole('log').getByText('customer paid 500', { exact: true })).toBeVisible()
  // The chat writes through the close screen's endpoint: the same day, the same list.
  await expect
    .poll(async () => (await moneyOn(page)).expenses.map((e) => [e.amount, e.source]))
    .toEqual([
      [30000, 'chat'],
      [500000, 'chat'],
    ])
  const dialog = await openCloseDay(page)
  await expect(dialog.getByTestId('money-spent')).toContainText('₹5,300')
  expect(id).toBeTruthy()
})

test('Hindi: Money today, the sheet and the chat speak Hindi', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await start(page, 'hi')
  const dialog = await openCloseDay(page, 'दिन बंद करें')
  const section = dialog.getByTestId('money-today')
  await expect(section.getByRole('heading', { name: 'आज का हिसाब' })).toBeVisible()
  await section.getByRole('button', { name: 'खर्चा जोड़ें' }).click()
  const sheet = page.getByRole('dialog', { name: 'खर्चा जोड़ें' })
  await sheet.getByLabel('रकम (₹)', { exact: true }).fill('1,00,000')
  await expect(sheet.getByText('= ₹1,00,000', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'तनख्वाह', exact: true }).click()
  await sheet.getByLabel('रकम (₹)', { exact: true }).focus()
  await page.screenshot({ path: info.outputPath('add-expense-390-hi-dark.png') })
  await sheet.getByRole('button', { name: 'सेव करें', exact: true }).click()
  await expect(section.getByTestId('money-spent')).toContainText('₹1,00,000')
  await expect(section).toContainText('तनख्वाह')
  await expect(dialog.getByTestId('cash-drawer')).toContainText('गल्ले में होना चाहिए')
  await page.screenshot({ path: info.outputPath('money-today-390-hi-dark.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await page.locator('[data-tour="nav-coach"]').click()
  await page.getByLabel('संदेश', { exact: true }).fill('किराया 5000 दिया')
  await page.getByRole('button', { name: 'भेजें', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('आज का खर्चा लिख लिया: ₹5,000, किराया', {
    timeout: 20_000,
  })
  expect((await moneyOn(page)).spent).toBe(10500000)
})

test('home yesterday line and the week show spent and left', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await start(page)
  const id = await shopId(page)
  // Yesterday: ₹4,500 of sales saved through Close the day's own review, ₹800 spent.
  const prepared = await (
    await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
      data: { date: yesterday, sales: [{ item: 'Kopi', quantity: 150, amount: 4500 }] },
    })
  ).json()
  expect(
    (
      await page.request.post(
        `/api/v1/businesses/${id}/import/${prepared.sales.import_id}/approve`,
        { data: { digest: prepared.sales.digest } },
      )
    ).ok(),
  ).toBe(true)
  expect(
    (
      await page.request.post(`/api/v1/businesses/${id}/expenses`, {
        data: { amount: '800', category: 'stock', date: yesterday },
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByTestId('today-pulse')).toContainText(
    'Yesterday: ₹4,500 · spent ₹800 · left ₹3,700',
  )
  await page.screenshot({ path: test.info().outputPath('home-yesterday-360-en-light.png') })
  const week = await (await page.request.get(`/api/v1/businesses/${id}/money/week`)).json()
  expect([week.sales, week.spent, week.left]).toEqual([450000, 80000, 370000])
})

for (const [width, height] of [
  [360, 800],
  [390, 844],
] as const) {
  for (const language of ['en', 'hi'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`shots and axe: ${width} ${language} ${scheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: scheme })
        await start(page, language)
        const id = await shopId(page)
        for (const [amount, category, method] of [
          ['300', 'stock', 'cash'],
          ['5,000', 'rent', 'upi'],
        ])
          await page.request.post(`/api/v1/businesses/${id}/expenses`, {
            data: { amount, category, method, note: category === 'stock' ? 'doodh' : '' },
          })
        await page.request.put(`/api/v1/businesses/${id}/money/${day}/cash`, {
          data: { opening: '1,000', counted: '650' },
        })
        const dialog = await openCloseDay(page, language === 'hi' ? 'दिन बंद करें' : undefined)
        const section = dialog.getByTestId('money-today')
        await expect(section.getByTestId('money-spent')).toContainText('₹5,300')
        await expect(dialog.getByTestId('cash-waiting')).toBeVisible()
        await section.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: info.outputPath(`money-${width}-${language}-${scheme}.png`),
          fullPage: true,
        })
        expect(
          (
            await new AxeBuilder({ page })
              .include('[data-testid="money-today"]')
              .withTags(['wcag2a', 'wcag2aa'])
              .analyze()
          ).violations,
        ).toEqual([])
        const fits = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        )
        expect(fits).toBe(true)
      })
    }
  }
}
