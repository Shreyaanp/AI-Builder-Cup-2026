import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const fixtureAnswer = {
  intent: {
    summary: '',
    keywords: ['kopi'],
    category: '',
    max_price: null,
    halal: false,
    vegetarian: false,
    locally_made: false,
    open_now: false,
    followups: [],
    sort: 'best',
    near: '',
    deals: false,
  },
  mode: 'keywords',
  groups: [
    {
      id: 'best',
      places: [
        {
          id: 'demo-fixture-kopi',
          name: 'Fixture Kopi',
          source: 'chalkboard',
          category: 'Cafe',
          lat: 12.972,
          lng: 77.642,
          distance_m: 120,
          open_now: true,
          currency: 'INR',
          items: [{ name: 'Kopi', price: 1800, unit: 'cup', available: true }],
          matched: [{ name: 'Kopi', price: 1800, unit: 'cup', available: true }],
          sold_out: [],
          demo_shop: true,
          deal: null,
        },
      ],
    },
  ],
  anchor: null,
}

const shopFixture = {
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

async function finishAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

for (const width of [360, 390, 412, 1280]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`OB-25/OB-48: shop fits ${width}px without clipping or dock overlap (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript(() => {
        localStorage.setItem('chalkboard.customer.journey', 'done')
        localStorage.setItem('chalkboard.explainer.customer.v1', '1')
      })
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      await page.route('**/api/v1/public/shops/*', (route) => route.fulfill({ json: shopFixture }))

      await page.goto('/explore/s/demo-shop-1')
      const title = page.getByRole('heading', { level: 1 }).first()
      await expect(title).toBeVisible({ timeout: 30_000 })
      const titleBounds = (await title.boundingBox())!
      expect(titleBounds.x).toBeGreaterThanOrEqual(16)
      expect(titleBounds.x + titleBounds.width).toBeLessThanOrEqual(width - 16)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const footer = page.getByText(/Prepared by the shop owner/)
      const footerBottom = await footer.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      )
      const dock = (await page.getByRole('button', { name: 'Chat with the shop' }).boundingBox())!
      expect(dock.height).toBeGreaterThanOrEqual(48)
      const dockTop = dock.y
      expect(footerBottom).toBeLessThanOrEqual(dockTop)
      await finishAnimations(page)
      expect(
        (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations,
      ).toEqual([])
    })
  }
}

for (const width of [360, 390, 412]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`OB-60: Ask is visible and returns offline fixture results at ${width}px (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: fixtureAnswer }))

      await page.goto('/explore/')
      const ask = page.getByRole('textbox', { name: /Ask/i })
      await expect(ask).toBeVisible({ timeout: 30_000 })
      const field = (await ask.boundingBox())!
      expect(field.y).toBeGreaterThan(844 / 2)
      expect(field.x).toBeGreaterThanOrEqual(16)
      expect(field.x + field.width).toBeLessThanOrEqual(width - 16)
      expect(field.height).toBeGreaterThanOrEqual(48)

      await ask.fill('kopi')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.locator('a[href="/explore/s/demo-fixture-kopi"]')).toBeVisible({
        timeout: 20_000,
      })
      await finishAnimations(page)
      expect(
        (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations,
      ).toEqual([])
    })
  }
}
