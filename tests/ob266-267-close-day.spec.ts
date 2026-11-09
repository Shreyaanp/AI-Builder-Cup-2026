import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { LOCALE_NAMES } from '../src/i18n/locales.js'

test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })

const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const noon = new Date(`${day}T12:00:00Z`)
const previousWeek = new Date(noon.getTime() - 7 * 86400_000).toISOString().slice(0, 10)
const weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(noon)
const shopWeekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
  .format(noon)
  .toLowerCase()

async function open(page: Page, hour = 10, close = '20:00', currency = 'INR') {
  await localOnly(page)
  await page.clock.setFixedTime(new Date(`${day}T${hour}:00:00+05:30`))
  await enter(page)
  if (currency === 'INR') {
    await seedShop(page)
  } else {
    // Saved-shop edits preserve their original currency; create this fixture in its currency.
    const pin =
      currency === 'IDR' ? { lat: -6.2088, lng: 106.8456 } : { lat: 21.0278, lng: 105.8342 }
    const draft = await (
      await page.request.post('/api/v1/proposals', {
        data: {
          kind: 'business',
          business: { name: 'Kopi', category: 'Cafe', currency, timezone: 'Asia/Kolkata' },
          owner_location: {
            ...pin,
            accuracy_m: 0,
            source: 'pin',
          },
          products: [{ name: 'Kopi', price: 1800, unit: 'cup', category: 'Drinks' }],
        },
      })
    ).json()
    expect(
      (
        await page.request.post(`/api/v1/proposals/${draft.id}/approve`, {
          data: { digest: draft.digest },
        })
      ).ok(),
    ).toBe(true)
  }
  // Give the shared Thursday-only fixture a closing time for the tested shop day.
  const [shop] = await (await page.request.get('/api/v1/businesses')).json()
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business_id: shop.id,
        revision: shop.revision,
        business: {
          ...shop.fields,
          currency,
          weekly_hours: [{ day: shopWeekday, open: '07:00', close, closed: false }],
        },
      },
    })
  ).json()
  expect(
    (
      await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
        data: { digest: proposal.digest },
      })
    ).ok(),
  ).toBe(true)
  const [savedShop] = await (await page.request.get('/api/v1/businesses')).json()
  expect(savedShop.fields.currency).toBe(currency)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  return page.getByRole('dialog', { name: 'Close the day' })
}

async function addLine(page: Page, amount = '200', quantity = '10') {
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  await dialog.getByLabel('Quantity sold', { exact: true }).fill(quantity)
  await dialog.getByLabel('Total for this item (₹)', { exact: true }).fill(amount)
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
}

for (const [hour, close, early] of [
  [13, '14:00', true],
  [14, '14:00', false],
  [15, '14:00', false],
  [15, '20:00', true],
  [16, '20:00', false],
] as const) {
  test(`OB-283: ${hour}:00 with usual close ${close} asks early=${early}`, async ({ page }) => {
    const dialog = await open(page, hour, close)
    await addLine(page)
    await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
    if (early) {
      const sheet = page.getByRole('dialog', { name: 'It’s still early. Close anyway?' })
      await expect(sheet).toBeVisible()
      await sheet.getByRole('button', { name: 'Not now', exact: true }).click()
      await expect(dialog.getByRole('button', { name: 'Close the day', exact: true })).toBeVisible()
    } else {
      await expect(dialog.getByText('Day closed: ₹200', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Close anyway', exact: true })).toHaveCount(0)
    }
  })
}

for (const [language, currency, input] of [
  ['id', 'INR', '1,000'],
  ['vi', 'INR', '15,000'],
  ['id', 'IDR', '1,000'],
  ['vi', 'VND', '1,000'],
  ['en', 'INR', '1.005'],
] as const) {
  test(`OB-279 OB-284 OB-288: ${language} + ${currency} shows inline errors for ${input}`, async ({
    page,
  }) => {
    const copy = {
      en: {
        error: 'Number not clear.',
        review: 'Review (1 line)',
        save: 'Close the day',
        done: 'Done',
      },
      id: {
        error: 'Angka tidak jelas.',
        review: 'Periksa (1 baris)',
        save: 'Tutup hari',
        done: 'Selesai',
      },
      vi: { error: 'Số chưa rõ.', review: 'Kiểm tra (1 dòng)', save: 'Chốt ngày', done: 'Xong' },
    }[language]
    await open(page, 22, '20:00', currency)
    if (language !== 'en') {
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'You', exact: true }).click()
      await page.getByRole('combobox', { name: 'Language', exact: true }).click()
      await page.getByRole('option', { name: LOCALE_NAMES[language], exact: true }).click()
      await page.locator('[data-tour="nav-grow"]').click()
      await page.locator('[data-tour="closeday"]').click()
    }
    const dialog = page.getByRole('dialog')
    await dialog
      .getByRole('button', { name: /Type the numbers instead|Ketik angkanya|Nhập số/ })
      .click()
    const form = dialog.getByTestId('close-day-typed')
    await form.locator('input[name=item]').fill('Kopi')
    const quantity = form.locator('input[name=quantity]')
    const amount = form.locator('input[name=amount]')
    await quantity.fill(input)
    await amount.fill(input)
    await form.locator('button[type=submit]').click()
    // OB-281: a quantity takes up to three decimals whatever the currency (1.005 kg is fine);
    // the amount keeps the currency's own minor digits.
    await expect(quantity).toHaveAttribute('aria-invalid', 'false')
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    const helper = page.locator(`[id="${await amount.getAttribute('aria-describedby')}"]`)
    await expect(helper).toContainText(copy.error)
    await expect(helper).toHaveAttribute('aria-live', 'polite')
    await expect(amount).toHaveValue(input)
    await expect(amount).toBeFocused()
    await quantity.fill('1')
    await amount.fill(language === 'en' ? '1.01' : '1000')
    await form.locator('button[type=submit]').click()
    await expect(form.getByRole('listitem')).toHaveCount(1)
    await dialog.getByRole('button', { name: copy.review, exact: true }).click()
    if (language === 'en') await expect(dialog.getByText('₹1.01', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: copy.save, exact: true }).click()
    await expect(dialog.getByRole('button', { name: copy.done, exact: true })).toBeVisible()
    if (language === 'en')
      await expect(dialog.getByText('Day closed: ₹1.01', { exact: true })).toBeVisible()
    const [shop] = await (await page.request.get('/api/v1/businesses')).json()
    const rows = await (await page.request.get(`/api/v1/businesses/${shop.id}/sales`)).json()
    expect(rows.filter((row: { date: string }) => row.date === day)).toEqual([
      {
        date: day,
        item: 'Kopi',
        quantity: 1,
        revenue: language === 'en' ? 101 : currency === 'INR' ? 100000 : 1000,
      },
    ])
    if (language === 'en') {
      await dialog.getByRole('button', { name: copy.done, exact: true }).click()
      await page.locator('[data-tour="closeday"]').click()
      await expect(dialog.getByText('Already closed today: ₹1.01', { exact: true })).toBeVisible()
    }
  })
}

test('OB-279: grouped amounts and quantities keep their value in review and saved totals', async ({
  page,
}) => {
  const dialog = await open(page, 22)
  await addLine(page, '1,000', '1,000')
  await expect(dialog.getByText('₹1,000', { exact: true })).toBeVisible()
  await expect(dialog.getByText('1,000 · ₹1,000', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await expect(dialog.getByText('Day closed: ₹1,000', { exact: true })).toBeVisible()
  const [shop] = await (await page.request.get('/api/v1/businesses')).json()
  const rows = await (await page.request.get(`/api/v1/businesses/${shop.id}/sales`)).json()
  expect(rows.filter((row: { date: string }) => row.date === day)).toEqual([
    { date: day, item: 'Kopi', quantity: 1000, revenue: 100000 },
  ])
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  await expect(dialog.getByText('Already closed today: ₹1,000', { exact: true })).toBeVisible()
})

test('OB-279 OB-281: ₹ 1,00,000 and 0.125 kg show and save exactly as typed', async ({
  page,
}, info) => {
  const dialog = await open(page, 22)
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  const quantity = dialog.getByLabel('Quantity sold', { exact: true })
  const amount = dialog.getByLabel('Total for this item (₹)', { exact: true })
  await quantity.fill('0.125')
  await amount.fill('₹ 1,00,000')
  // The amount as it will be saved, before Add.
  const helper = page.locator(`[id="${await amount.getAttribute('aria-describedby')}"]`)
  await expect(helper).toHaveText('= ₹1,00,000')
  await expect(amount).toHaveAttribute('aria-invalid', 'false')
  await page.screenshot({ path: info.outputPath('ob279-preview.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await expect(dialog.getByText('Kopi · 0.125 · ₹1,00,000', { exact: true })).toBeVisible()
  // A lone comma is a question; Review waits for the answer instead of dropping the line.
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  await quantity.fill('1')
  await amount.fill('1,5')
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await expect(amount).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator(`[id="${await amount.getAttribute('aria-describedby')}"]`)).toHaveText(
    'Did you mean ₹1.50 or ₹15? Please type it again.',
  )
  await page.screenshot({ path: info.outputPath('ob279-question.png'), animations: 'disabled' })
  await amount.fill('15')
  await dialog.getByRole('button', { name: 'Review (2 lines)', exact: true }).click()
  await expect(dialog.getByText('₹1,00,015', { exact: true })).toBeVisible()
  await expect(dialog.getByText('0.125 · ₹1,00,000', { exact: true })).toBeVisible()
  await expect(dialog.getByText('1 · ₹15', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await expect(dialog.getByText('Day closed: ₹1,00,015', { exact: true })).toBeVisible()
  const [shop] = await (await page.request.get('/api/v1/businesses')).json()
  const rows = await (await page.request.get(`/api/v1/businesses/${shop.id}/sales`)).json()
  expect(rows.filter((row: { date: string }) => row.date === day)).toEqual([
    { date: day, item: 'Kopi', quantity: 1.125, revenue: 10001500 },
  ])
})

test('PR 701: a typed line with no quantity holds Review instead of being dropped', async ({
  page,
}) => {
  const dialog = await open(page, 22)
  await addLine(page, '200', '10')
  await dialog.getByRole('button', { name: 'Add more', exact: true }).click()
  const form = dialog.getByTestId('close-day-typed')
  await form.locator('input[name=item]').fill('Kopi')
  await form.locator('input[name=amount]').fill('₹170/-')
  await expect(form.locator('input[name=amount]')).toHaveAttribute('aria-invalid', 'false')
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  // Still on the form, with the empty quantity marked: the half-filled line is not lost.
  const quantity = form.locator('input[name=quantity]')
  await expect(quantity).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByText('Today’s sales', { exact: true })).toHaveCount(0)
  await quantity.fill('2')
  await dialog.getByRole('button', { name: 'Review (2 lines)', exact: true }).click()
  await expect(dialog.getByText('2 · ₹170', { exact: true })).toBeVisible()
  await expect(dialog.getByText('₹370', { exact: true })).toBeVisible()
})

test('OB-279: unclear numbers show linked inline errors and preserve the entry', async ({
  page,
}, info) => {
  const dialog = await open(page)
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  const quantity = dialog.getByLabel('Quantity sold', { exact: true })
  const amount = dialog.getByLabel('Total for this item (₹)', { exact: true })
  await quantity.fill('1,00')
  await amount.fill('1.000,50')
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  // OB-279: "1,00" could be one or a hundred, so the owner is asked rather than guessed for.
  for (const [field, text] of [
    [quantity, 'Did you mean 1 or 100? Please type it again.'],
    [amount, 'Number not clear. Try 1,000.5.'],
  ] as const) {
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    const helper = page.locator(`[id="${await field.getAttribute('aria-describedby')}"]`)
    await expect(helper).toHaveText(text)
    await expect(helper).toHaveAttribute('aria-live', 'polite')
  }
  await expect(quantity).toBeFocused()
  await expect(amount).toHaveValue('1.000,50')
  await expect(dialog.getByRole('button', { name: 'Review (0 lines)', exact: true })).toBeDisabled()
  await page.screenshot({
    path: info.outputPath('ob279-inline-errors.png'),
    animations: 'disabled',
  })
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await quantity.fill('1000')
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await expect(amount).toBeFocused()
  await expect(quantity).toHaveAttribute('aria-invalid', 'false')
  await amount.fill('1000.50')
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await expect(dialog.getByText('₹1,000.50', { exact: true })).toBeVisible()
})

test('OB-266: EN dismiss is Not now and the primary job has one name', async ({ page }) => {
  const dialog = await open(page)
  await expect(dialog.getByRole('button', { name: 'Not now', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Review (0 lines)', exact: true })).toBeDisabled()
  await expect(dialog).not.toContainText('Z report')
  await dialog.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('OB-266 OB-267 OB-275 OB-279 F13: Hindi dismiss, job and line total are clear', async ({
  page,
}, info) => {
  await open(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: /हिन्दी/ }).click()
  await page.locator('[data-tour="nav-grow"]').click()
  await page.locator('[data-tour="closeday"]').click()
  const dialog = page.getByRole('dialog', { name: 'दिन बंद करें' })
  await expect(dialog.getByRole('button', { name: 'अभी नहीं', exact: true })).toBeVisible()
  await expect(dialog.getByText('बिक्री पर्ची या कॉपी', { exact: true })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'संख्याएँ खुद लिखें' }).click()
  await expect(dialog.getByLabel('इस सामान की कुल रकम (₹)', { exact: true })).toBeVisible()
  await expect(dialog).not.toContainText(/Z रिपोर्ट|Nothing to save|Review/)
  await dialog.locator('input[name=item]').fill('चाय')
  await dialog.locator('input[name=quantity]').fill('10')
  await dialog.locator('input[name=amount]').fill('1,00')
  await dialog.getByRole('button', { name: 'लाइन जोड़ें', exact: true }).click()
  // "1,00" is one rupee or a hundred: a plain question in Hindi, not a guess (OB-279).
  await expect(dialog.getByText('आपका मतलब ₹1 है या ₹100? साफ़ करके फिर से लिखें।')).toBeVisible()
  await page.screenshot({ path: info.outputPath('hindi-item-total.png'), animations: 'disabled' })
  await dialog.locator('input[name=amount]').fill('200')
  await dialog.getByRole('button', { name: 'लाइन जोड़ें', exact: true }).click()
  await dialog.getByRole('button', { name: 'जाँचें (1 पंक्ति)', exact: true }).click()
  await dialog.getByRole('button', { name: 'दिन बंद करें', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'अभी जल्दी है। फिर भी दिन बंद करें?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('आप आज के आँकड़े बाद में बदल सकते हैं।')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'फिर भी बंद करें', exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'अभी नहीं', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'दिन बंद करें', exact: true })).toBeVisible()
})

test('OB-267: early close asks, reopening edits the saved day without double saving', async ({
  page,
}) => {
  const dialog = await open(page)
  await page.route('**/day/*/reward', (route) =>
    route.fulfill({
      json: {
        date: day,
        currency: 'INR',
        total: 20000,
        items: 10,
        same_weekday: { date: previousWeek, weeks_ago: 1, total: 50000, difference: -30000 },
        forecast: { item: 'Kopi', forecast: 30, sold: 10, unit: 'cup' },
      },
    }),
  )
  await addLine(page)
  let prepares = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/day/prepare')) prepares++
  })
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'It’s still early. Close anyway?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('You can edit today’s numbers later.')).toBeVisible()
  expect(prepares).toBe(0)
  await sheet.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(dialog.getByText('Today’s sales', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'It’s still early. Close anyway?' })
    .getByRole('button', { name: 'Close anyway', exact: true })
    .click()
  await expect(dialog.getByText('Day closed: ₹200', { exact: true })).toBeVisible()
  await expect(dialog.getByText('You sold 10 Kopi.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Thank you for today. Rest well.')).toBeVisible()
  await expect(dialog).not.toContainText(/quieter|more than|Forecast said/)
  expect(prepares).toBe(1)
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  await expect(dialog.getByText('Already closed today: ₹200', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Review/ })).toHaveCount(0)
  expect(prepares).toBe(1)
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'It’s still early. Close anyway?' })
    .getByRole('button', { name: 'Close anyway', exact: true })
    .click()
  await expect(dialog.getByText('Day closed: ₹200', { exact: true })).toBeVisible()
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  const rows = await (await page.request.get(`/api/v1/businesses/${shops[0].id}/sales`)).json()
  expect(rows.filter((row: { date: string }) => row.date === day)).toEqual([
    { date: day, item: 'Kopi', quantity: 10, revenue: 20000 },
  ])
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /Help me close the day|^Close the day\.?$/ }),
  ).toHaveCount(0)
})

for (const scenario of ['usual closing time', 'whole day confirmed'] as const) {
  test(`OB-267: compare only after ${scenario}, with the kind summary first`, async ({ page }) => {
    const dialog = await open(page, scenario === 'usual closing time' ? 22 : 10)
    let prepares = 0
    page.on('request', (request) => {
      if (request.url().endsWith('/day/prepare')) prepares++
    })
    await page.route('**/day/*/reward', (route) =>
      route.fulfill({
        json: {
          date: day,
          currency: 'INR',
          total: 20000,
          items: 10,
          same_weekday: { date: previousWeek, weeks_ago: 1, total: 50000, difference: -30000 },
        },
      }),
    )
    await addLine(page)
    if (scenario === 'whole day confirmed') {
      await dialog.getByLabel('This is the whole day', { exact: true }).check()
      await expect(dialog.getByLabel('This is the whole day', { exact: true })).toBeChecked()
    }
    await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
    if (scenario === 'whole day confirmed')
      await page
        .getByRole('dialog', { name: 'It’s still early. Close anyway?' })
        .getByRole('button', { name: 'Close anyway', exact: true })
        .dblclick()
    await expect(
      dialog.getByText(`A quieter day than last ${weekday}. Tomorrow is a fresh start.`, {
        exact: true,
      }),
    ).toBeVisible()
    const text = await dialog.innerText()
    expect(text.indexOf('You sold 10 Kopi.')).toBeLessThan(text.indexOf('Day closed: ₹200'))
    expect(text.indexOf('Day closed: ₹200')).toBeLessThan(text.indexOf('A quieter day than'))
    expect(prepares).toBe(1)
  })
}

test('OB-267: a failed saved-day check offers retry instead of a blank form', async ({ page }) => {
  await page.route('**/businesses/*/sales', (route) => route.fulfill({ status: 503, json: {} }))
  const dialog = await open(page)
  await expect(dialog.getByRole('alert')).toContainText('Couldn’t check today’s sales')
  await expect(dialog.getByRole('button', { name: /^Review/ })).toHaveCount(0)
  await page.unroute('**/businesses/*/sales')
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Review (0 lines)', exact: true })).toBeDisabled()
})

test('OB-267 OB-278: editing a closed day does not append an incoming chat photo', async ({
  page,
}) => {
  const dialog = await open(page)
  await addLine(page)
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'It’s still early. Close anyway?' })
    .getByRole('button', { name: 'Close anyway', exact: true })
    .click()
  await expect(dialog.getByText('Day closed: ₹200', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 24
    canvas.height = 40
    canvas.getContext('2d')!.fillRect(0, 0, 24, 40)
    return canvas.toDataURL('image/png')
  })
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'till.png',
      mimeType: 'image/png',
      buffer: Buffer.from(photo.split(',')[1], 'base64'),
    })
  await page
    .getByRole('group', { name: 'What is this photo?' })
    .getByRole('button', { name: 'Till report', exact: true })
    .click()
  await expect(dialog.getByText('Already closed today: ₹200', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(dialog.locator('img')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Review (1 line)', exact: true })).toBeVisible()
})

for (const size of ['phone', 'desktop'] as const) {
  for (const appearance of ['light', 'dark'] as const) {
    test(`OB-266 OB-267 OB-275 OB-279: ${size} ${appearance} labels and accessibility`, async ({
      page,
    }, info) => {
      await page.setViewportSize(
        size === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      )
      await page.addInitScript((appearance) => {
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ language: 'en', appearance }),
        )
      }, appearance)
      const dialog = await open(page)
      await expect(dialog.getByRole('button', { name: 'Not now', exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
      await expect(dialog.getByLabel('Total for this item (₹)', { exact: true })).toBeVisible()
      await dialog.locator('input[name=item]').fill('Kopi')
      await dialog.locator('input[name=quantity]').fill('10')
      await dialog.locator('input[name=amount]').fill('1,00')
      await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
      // "1,00" could be one rupee or a hundred: asked, not guessed (OB-279).
      await expect(dialog.getByText('Did you mean ₹1 or ₹100? Please type it again.')).toBeVisible()
      await page.screenshot({ path: info.outputPath('item-total.png'), animations: 'disabled' })
      expect(
        (
          await new AxeBuilder({ page })
            .include('[role="dialog"]')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([])
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(page.locator('[data-tour="closeday"]')).toBeFocused()
    })
  }
}

test('OB-266 OB-267 OB-279: Chinese close-day states remain localized', async ({ page }, info) => {
  await open(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: '简体中文', exact: true }).click()
  await page.locator('[data-tour="nav-grow"]').click()
  await page.locator('[data-tour="closeday"]').click()
  const dialog = page.getByRole('dialog', { name: '日结' })
  await expect(dialog.getByRole('button', { name: '暂时不用', exact: true })).toBeVisible()
  await expect(dialog.getByText('销售小票或记录本', { exact: true })).toHaveCount(1)
  await expect(dialog).not.toContainText(/Review|Not now|Z 报表/)
  await dialog.getByRole('button', { name: '改为手动输入数字' }).click()
  await dialog.locator('input[name=item]').fill('茶')
  await dialog.locator('input[name=quantity]').fill('10')
  await dialog.locator('input[name=amount]').fill('1,00')
  await dialog.getByRole('button', { name: '添加一行', exact: true }).click()
  await expect(dialog.getByText('您是指 ₹1 还是 ₹100？请重新输入。')).toBeVisible()
  await page.screenshot({ path: info.outputPath('chinese.png'), animations: 'disabled' })
})

test('OB-290: a typed line counts for Review, the 360 footer stays on one line, and Grow shows the closed day', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const dialog = await open(page, 21)
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  await dialog.getByLabel('Quantity sold', { exact: true }).fill('10')
  await dialog.getByLabel('Total for this item (₹)', { exact: true }).fill('1,00,000')
  // Filled but not added: Review counts it and adds it.
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await expect(dialog.getByText('Kopi')).toBeVisible()
  for (const name of ['Not now', 'Add more', 'Close the day']) {
    const box = await dialog.getByRole('button', { name, exact: true }).boundingBox()
    expect(box!.height, `${name} stays on one line`).toBeLessThan(60)
  }
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await expect(dialog.getByText('Day closed: ₹1,00,000', { exact: true })).toBeVisible()
  await expect(dialog.getByText('You sold 10 Kopi.', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  const card = page.locator('[data-tour="closeday"]')
  await expect(card).toContainText('Day closed: ₹1,00,000')
  await expect(card).toContainText('Edit')
  await expect(card).not.toContainText('Ready to close today?')
})

test('OB-290: home shows the exact day total, paise included', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const dialog = await open(page, 21)
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  await dialog.getByLabel('Quantity sold', { exact: true }).fill('10')
  await dialog.getByLabel('Total for this item (₹)', { exact: true }).fill('1.01')
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await expect(dialog.getByText('Day closed: ₹1.01', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  const pulse = page.getByTestId('today-pulse')
  await expect(pulse).toContainText('Today so far')
  await expect(pulse).toContainText('₹1.01')
})
