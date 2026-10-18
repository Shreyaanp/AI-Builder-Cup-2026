import { expect, test, type Page } from '@playwright/test'

// Customer phone screens: bars never cover content, loading never shows blank outlines, and a
// rejected QR key never leaves a stamp behind. 360 and 390 px.
const shop = {
  id: 'demo-shop-1',
  name: 'Corner Cup',
  category: 'cafe',
  location: 'Eng Hoon Street, Tiong Bahru',
  hours: '08:00 – 17:00',
  reward_text: 'Free coffee',
  stamps_needed: 8,
  currency: 'SGD',
  open_now: true,
  demo: false,
  products: Array.from({ length: 12 }, (_, n) => ({
    name: `Item ${n + 1}`,
    price: 400 + n * 10,
    unit: '',
    available: true,
    category: 'Coffee',
  })),
  facts: {},
}

async function routes(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/public/shops/*', (route) => route.fulfill({ json: shop }))
}

for (const width of [360, 390]) {
  test.describe(`customer phone at ${width}px`, () => {
    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(!isMobile, 'phone widths')
      await page.setViewportSize({ width, height: 800 })
      await routes(page)
    })

    test('chat bar docks below the shop page content', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto('/explore/s/demo-shop-1', { waitUntil: 'domcontentloaded' })
      const chat = page.getByRole('button', { name: 'Chat with the shop' })
      await expect(chat).toBeVisible({ timeout: 45_000 })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const last = page.getByText('independent prototype').last()
      await expect(last).toBeVisible()
      const content = (await last.boundingBox())!
      const bar = (await chat.boundingBox())!
      expect(content.y + content.height).toBeLessThanOrEqual(bar.y)
    })

    test('bottom nav clears the end of the Ask page', async ({ page }) => {
      await page.route('**/api/v1/discover?**', (route) =>
        route.fulfill({ json: { mode: 'demo', places: [], google_unavailable: false } }),
      )
      await page.goto('/explore/')
      const nav = page.getByRole('navigation').last()
      await expect(nav).toBeVisible({ timeout: 20_000 })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const today = page.getByText(/Today’s 7/).first()
      await expect(today).toBeVisible()
      const content = (await today.boundingBox())!
      const bar = (await nav.boundingBox())!
      expect(content.y + content.height).toBeLessThanOrEqual(bar.y)
    })

    test('a slow browse load shows card-shaped placeholders and a way forward', async ({
      page,
    }) => {
      await page.route('**/api/v1/discover?**', () => {})
      await page.goto('/explore/browse')
      const rows = page.locator('li[aria-hidden="true"]')
      await expect(rows).toHaveCount(5, { timeout: 20_000 })
      // Each placeholder draws a photo block and text bars, not an empty outline.
      await expect(rows.first().locator('div')).toHaveCount(4)
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 15_000 })
    })

    test('a slow passport load shows cards and a retry, not a blank body', async ({ page }) => {
      await page.route('**/api/v1/public/passport/**', () => {})
      await page.route('**/api/v1/customer/passport?**', () => {})
      await page.goto('/explore/passport')
      const loading = page.getByRole('status', { name: /passport/i })
      await expect(loading).toBeVisible({ timeout: 20_000 })
      expect((await loading.boundingBox())!.height).toBeGreaterThan(300)
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 })
    })

    test('a rejected QR key shows the sheet and adds no stamp', async ({ page }) => {
      await page.route('**/api/v1/public/passport/check', (route) =>
        route.fulfill({ status: 403, json: { detail: 'bad key' } }),
      )
      await page.goto('/explore/s/demo-shop-1?source=qr&k=made-up-key', {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.getByText('This QR is out of date')).toBeVisible({ timeout: 20_000 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0)
      await page.getByRole('button', { name: 'Done' }).click()
      // The shop page's own card keeps the count it had before the scan.
      await expect(page.getByRole('link', { name: 'Stamp card · 2 of 10 stamps' })).toBeVisible()
    })
  })
}
