import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'

test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })

const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const noon = new Date(`${day}T12:00:00Z`)
const previousWeek = new Date(noon.getTime() - 7 * 86400_000).toISOString().slice(0, 10)
const weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(noon)
const shopWeekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
  .format(noon)
  .toLowerCase()

async function open(page: Page, hour = 10) {
  await localOnly(page)
  await page.clock.setFixedTime(new Date(`${day}T${hour}:00:00+05:30`))
  await enter(page)
  await seedShop(page)
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
          weekly_hours: [{ day: shopWeekday, open: '07:00', close: '20:00', closed: false }],
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
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  return page.getByRole('dialog', { name: 'Close the day' })
}

async function addLine(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: 'Type the numbers instead' }).click()
  await dialog.getByLabel('Item', { exact: true }).fill('Kopi')
  await dialog.getByLabel('Quantity sold', { exact: true }).fill('10')
  await dialog.getByLabel('Total for this item (₹)', { exact: true }).fill('200')
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
}

test('OB-266: EN dismiss is Not now and the primary job has one name', async ({ page }) => {
  const dialog = await open(page)
  await expect(dialog.getByRole('button', { name: 'Not now', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Review (0 lines)', exact: true })).toBeDisabled()
  await expect(dialog).not.toContainText('Z report')
  await dialog.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('OB-266 OB-267 OB-275 F13: Hindi dismiss, job and line total are clear', async ({
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
  await page.screenshot({ path: info.outputPath('hindi-item-total.png'), animations: 'disabled' })
  await dialog.locator('input[name=item]').fill('चाय')
  await dialog.locator('input[name=quantity]').fill('10')
  await dialog.locator('input[name=amount]').fill('200')
  await dialog.getByRole('button', { name: 'लाइन जोड़ें', exact: true }).click()
  await dialog.getByRole('button', { name: 'जाँचें (1 पंक्ति)', exact: true }).click()
  await dialog.getByRole('button', { name: 'दिन बंद करें', exact: true }).click()
  await expect(dialog.getByText('अभी समय है। फिर भी दिन बंद करें?', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'फिर भी बंद करें', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'अभी नहीं', exact: true }).click()
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
  await expect(dialog.getByText("It's still early. Close anyway?", { exact: true })).toBeVisible()
  expect(prepares).toBe(0)
  await dialog.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(dialog.getByText('Today’s sales', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close anyway', exact: true }).click()
  await expect(dialog.getByText('Day closed: ₹200', { exact: true })).toBeVisible()
  await expect(dialog.getByText('You sold 10 items.', { exact: true })).toBeVisible()
  await expect(dialog).not.toContainText(/less than|more than|Forecast said/)
  expect(prepares).toBe(1)
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  await expect(dialog.getByText('Already closed today: ₹200', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Review/ })).toHaveCount(0)
  expect(prepares).toBe(1)
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review (1 line)', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close anyway', exact: true }).click()
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
      await dialog.getByRole('button', { name: 'Close anyway', exact: true }).dblclick()
    await expect(dialog.getByText(`₹300 less than last ${weekday}`, { exact: true })).toBeVisible()
    const text = await dialog.innerText()
    expect(text.indexOf('You sold 10 items.')).toBeLessThan(text.indexOf('Day closed: ₹200'))
    expect(text.indexOf('Day closed: ₹200')).toBeLessThan(text.indexOf('₹300 less than'))
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
  await dialog.getByRole('button', { name: 'Close anyway', exact: true }).click()
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
    test(`OB-266 OB-267 OB-275: ${size} ${appearance} labels and accessibility`, async ({
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

test('OB-266 OB-267: Chinese close-day states remain localized', async ({ page }, info) => {
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
  await page.screenshot({ path: info.outputPath('chinese.png'), animations: 'disabled' })
})
