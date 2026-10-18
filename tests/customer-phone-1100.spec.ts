import { expect, test, type Page } from '@playwright/test'

// Customer phone fixes (#258-#262): a solid sticky shop bar, a clean shop hero, full Tamil titles
// and badges, no stuck tooltips. 360 and 390 px, light and dark, English and Tamil.
const AREA = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
const item = (name: string, price: number) => ({
  name,
  price,
  unit: '',
  available: true,
  category: 'Coffee',
})
const places = ['Corner Cup', 'Sunrise Bakehouse', 'Lane 4 Kitchen'].map((name, n) => ({
  id: `demo-shop-${n + 1}`,
  name,
  source: 'chalkboard',
  category: 'cafe',
  lat: AREA.lat + n * 0.002,
  lng: AREA.lng,
  distance_m: 120 + n * 100,
  open_now: true,
  currency: 'SGD',
  demo: false,
  demo_shop: true,
  items: [item('Flat white', 450)],
  matched: [item('Flat white', 450)],
  sold_out: [],
  reasons: [],
  deal: null,
}))
const shop = {
  id: 'demo-shop-1',
  name: 'Tiffin Window',
  category: 'cafe',
  location: 'Eng Hoon Street, Tiong Bahru',
  hours: '08:00 – 17:00',
  phone: '+65 6222 1234',
  reward_text: 'Free coffee after 10 stamps',
  stamps_needed: 10,
  currency: 'SGD',
  open_now: true,
  demo: true,
  products: Array.from({ length: 14 }, (_, n) => item(`Item ${n + 1}`, 400 + n * 10)),
  facts: {},
}

async function setup(page: Page, language: 'en' | 'ta', appearance: 'light' | 'dark') {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places, google_unavailable: false } }),
  )
  await page.route('**/api/v1/discover/suggest?**', (route) =>
    route.fulfill({
      json: { items: ['Flat white'], shops: 3, open_now: 3, locally_made: 0, deals: 0 },
    }),
  )
  await page.route('**/api/v1/public/shops/*', (route) => route.fulfill({ json: shop }))
  await page.addInitScript(
    ([area, prefs]) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
      localStorage.setItem('niva.starter.preferences', prefs)
    },
    [AREA, JSON.stringify({ appearance, language })] as const,
  )
}

async function noSideScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(wide).toBeLessThanOrEqual(0)
}

const OPEN_TA = 'இப்போது திறந்துள்ளது'

for (const width of [360, 390]) {
  for (const appearance of ['light', 'dark'] as const) {
    for (const language of ['en', 'ta'] as const) {
      test.describe(`customer ${width}px ${appearance} ${language}`, () => {
        test.beforeEach(async ({ page, isMobile }) => {
          test.skip(!isMobile, 'phone widths')
          await page.setViewportSize({ width, height: 800 })
          await setup(page, language, appearance)
        })

        const tag = `${width}-${appearance}-${language}`

        test('#258 #259 shop: solid bar, back clear of the hero, actions inside the screen', async ({
          page,
        }) => {
          await page.goto('/explore/s/demo-shop-1')
          const hero = page.getByTestId('shop-hero-banner')
          await expect(hero).toBeVisible({ timeout: 20_000 })
          await page.waitForTimeout(600)
          const back = page.locator('a[href="/explore/"]').first()
          const backBox = (await back.boundingBox())!
          const heroBox = (await hero.boundingBox())!
          expect(backBox.y + backBox.height).toBeLessThanOrEqual(heroBox.y + 1)
          // Every action button sits fully inside the screen.
          const edges = await page
            .locator('a[href^="tel:"], button[aria-pressed]')
            .evaluateAll((els) =>
              els.map((el) => {
                const r = el.getBoundingClientRect()
                return { left: r.left, right: r.right }
              }),
            )
          expect(edges.length).toBeGreaterThan(0)
          for (const edge of edges) {
            expect(edge.left).toBeGreaterThanOrEqual(0)
            expect(edge.right).toBeLessThanOrEqual(width)
          }
          await noSideScroll(page)
          await page.screenshot({ path: `test-results/shop-top-${tag}.png` })

          // Scrolled to the menu: the bar is opaque and the menu heading sits below it.
          await page.evaluate(() => window.scrollTo(0, 700))
          const bar = back.locator('xpath=..')
          const alpha = await bar.evaluate((el) => {
            const c = getComputedStyle(el).backgroundColor
            return c.startsWith('rgba') ? Number(c.split(',')[3]!.replace(')', '')) : 1
          })
          expect(alpha).toBe(1)
          const barBox = (await bar.boundingBox())!
          const menuBox = (await page.getByRole('heading', { level: 2 }).first().boundingBox())!
          expect(menuBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 1)
          await page.screenshot({ path: `test-results/shop-scrolled-${tag}.png` })
        })

        test('#260 ask title shows, #262 no stuck tooltip', async ({ page }) => {
          await page.goto('/explore/')
          const title = page.getByRole('heading', { level: 1 })
          await expect(title).toBeVisible({ timeout: 20_000 })
          await expect(title).toHaveText(
            language === 'ta' ? 'அருகில் என்ன தேடுகிறீர்கள்?' : 'What are you looking for nearby?',
          )
          const box = (await title.boundingBox())!
          expect(box.height).toBeGreaterThan(20)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          await page.waitForTimeout(600)
          await page.screenshot({ path: `test-results/ask-${tag}.png` })
          // Tapping the appearance switch leaves no tooltip behind.
          await page
            .locator('button[aria-label*="ode"], button[aria-label*="யன்முறை"]')
            .first()
            .tap()
          await page.waitForTimeout(400)
          await expect(page.getByRole('tooltip')).toHaveCount(0)
          await noSideScroll(page)
        })

        test('#261 browse: the open badge is never cut with an ellipsis', async ({ page }) => {
          await page.goto('/explore/browse')
          const word = language === 'ta' ? OPEN_TA : 'Open now'
          const badge = page.getByText(word).first()
          await expect(badge).toBeVisible({ timeout: 20_000 })
          const cut = await page
            .locator('li span')
            .evaluateAll(
              (els) =>
                els.filter(
                  (el) =>
                    el.scrollWidth > el.clientWidth + 1 &&
                    getComputedStyle(el).textOverflow === 'ellipsis',
                ).length,
            )
          expect(cut).toBe(0)
          await noSideScroll(page)
          await page.screenshot({ path: `test-results/browse-${tag}.png` })
        })
      })
    }
  }
}
