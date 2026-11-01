import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// OB-239 (#621, review of PR #623): a low item the app cannot tell about asks the owner once,
// "Do you make it or buy it?", with two 48 px answers. Buy brings the Order button; Make brings
// "Make more" and never a supplier order. Phone widths 360/390/412, light and dark. Local only.
test.skip(({ isMobile }) => !isMobile, 'phone story')

async function cafe(page: Page, name: string) {
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Café',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Filter coffee', price: 3000, unit: 'cup', category: 'Drinks', stock: 40 },
          { name: 'Samosa', price: 2000, unit: 'piece', category: 'Snacks', stock: 4 },
        ],
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  expect(approved.ok()).toBe(true)
}

async function prefer(page: Page, language: 'en' | 'hi', appearance: 'light' | 'dark') {
  await page.evaluate(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance },
  )
}

async function open(page: Page, continueLabel = 'Continue local preview') {
  // A playbook that leads with stock, so the low row is on Today whatever else is pending.
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
  await page.reload()
  await page.getByRole('button', { name: continueLabel }).click()
  await expect(page.locator('[data-need]').first()).toBeVisible()
  return page.locator('[data-need="low"]').filter({ hasText: 'Samosa' })
}

async function fitsThePhone(page: Page, row: ReturnType<Page['locator']>) {
  for (const button of await row.getByRole('button').all()) {
    const box = (await button.boundingBox())!
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(48)
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(48)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}

for (const width of [360, 390, 412])
  for (const scheme of ['light', 'dark'] as const)
    test(`OB-239: the make-or-buy question fits a ${width} px phone (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: 844 })
      await localOnly(page)
      await enter(page)
      await prefer(page, 'en', scheme)
      const name = `Corner Café ${width} ${scheme}`
      await cafe(page, name)
      const row = await open(page)
      await expect(row).toContainText('Samosa: only 4 left. Do you make it or buy it?')
      await expect(row.getByRole('button', { name: 'I make Samosa' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'I buy Samosa' })).toBeVisible()
      // Never an Order button before the owner says they buy it.
      await expect(row.getByRole('button', { name: 'Order', exact: true })).toHaveCount(0)
      await fitsThePhone(page, row)
      // Contrast: the question reads in both themes (text is not the background colour).
      const colours = await row.getByText('Do you make it or buy it?').evaluate((node) => {
        const style = getComputedStyle(node)
        return { color: style.color, background: getComputedStyle(document.body).backgroundColor }
      })
      expect(colours.color).not.toBe(colours.background)
      await page.screenshot({ path: test.info().outputPath(`make-or-buy-${width}-${scheme}.png`) })

      if (width === 390) {
        // Buy: saved on the item; the row now orders, and the question is never asked again.
        await row.getByRole('button', { name: 'I buy Samosa' }).click()
        await expect(row.getByRole('button', { name: 'Order', exact: true })).toBeVisible()
        await expect(row).not.toContainText('Do you make it or buy it?')
        await page.reload()
        await page.getByRole('button', { name: 'Continue local preview' }).click()
        await expect(
          page.locator('[data-need="low"]').filter({ hasText: 'Samosa' }).getByRole('button', {
            name: 'Order',
            exact: true,
          }),
        ).toBeVisible()
      }
      if (width === 412) {
        // Make: the prep plan's "Make more", never a supplier order.
        await row.getByRole('button', { name: 'I make Samosa' }).click()
        await expect(row.getByRole('button', { name: 'Make more' })).toBeVisible()
        await expect(row.getByRole('button', { name: 'Order', exact: true })).toHaveCount(0)
        await fitsThePhone(page, row)
      }
    })

test('OB-239: the make-or-buy question in Hindi, 360 px dark', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 360, height: 844 })
  await localOnly(page)
  await enter(page)
  await prefer(page, 'hi', 'dark')
  await cafe(page, 'Corner Café hi')
  const row = await open(page, 'स्थानीय प्रीव्यू जारी रखें')
  await expect(row).toContainText('सिर्फ़ 4 बचे। आप इसे बनाते हैं या खरीदते हैं?')
  await expect(row.getByRole('button', { name: 'Samosa: बनाते हैं' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Samosa: खरीदते हैं' })).toBeVisible()
  await fitsThePhone(page, row)
  await page.screenshot({ path: test.info().outputPath('make-or-buy-360-dark-hi.png') })
})
