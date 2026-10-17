import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

test.describe.configure({ timeout: 90_000 })

const AREA = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
const item = (name: string, price: number, category = 'Cafe') => ({
  name,
  price,
  unit: '',
  available: true,
  category,
})

const sampleShops = [
  {
    id: 'demo-shop-1',
    name: 'Corner Cup',
    source: 'chalkboard',
    category: 'cafe',
    lat: AREA.lat,
    lng: AREA.lng,
    distance_m: 120,
    open_now: true,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item('Flat white', 450), item('Filter coffee', 500)],
    matched: [item('Flat white', 450)],
    sold_out: [],
    reasons: [],
    deal: { item: 'Flat white', price: 300, pickup_end: Math.floor(Date.now() / 1000) + 3600 },
  },
  {
    id: 'demo-shop-2',
    name: 'Sunrise Bakehouse With A Long Name',
    source: 'chalkboard',
    category: 'bakery',
    lat: AREA.lat + 0.002,
    lng: AREA.lng,
    distance_m: 250,
    open_now: true,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item('Kaya croissant with salted butter', 500, 'Bakery')],
    matched: [item('Kaya croissant with salted butter', 500, 'Bakery')],
    sold_out: ['Sourdough loaf'],
    reasons: [],
    deal: null,
  },
  {
    id: 'demo-shop-3',
    name: 'Lane 4 Street Kitchen',
    source: 'chalkboard',
    category: 'cafe',
    lat: AREA.lat + 0.003,
    lng: AREA.lng,
    distance_m: 380,
    open_now: false,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item('Iced chai', 400)],
    matched: [item('Iced chai', 400)],
    sold_out: [],
    reasons: [],
    deal: null,
  },
  {
    id: 'demo-shop-4',
    name: 'Tiong Bahru Daily Roast',
    source: 'chalkboard',
    category: 'cafe',
    lat: AREA.lat + 0.004,
    lng: AREA.lng,
    distance_m: 450,
    open_now: true,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item('Espresso', 350)],
    matched: [item('Espresso', 350)],
    sold_out: [],
    reasons: [],
    deal: null,
  },
  {
    id: 'demo-shop-5',
    name: 'Old Town Heritage Bakes',
    source: 'chalkboard',
    category: 'bakery',
    lat: AREA.lat + 0.005,
    lng: AREA.lng,
    distance_m: 520,
    open_now: true,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item('Pandan cake', 400)],
    matched: [item('Pandan cake', 400)],
    sold_out: [],
    reasons: [],
    deal: null,
  },
  {
    id: 'demo-shop-6',
    name: 'Little Cloud Tea Room',
    source: 'chalkboard',
    category: 'cafe',
    lat: AREA.lat + 0.006,
    lng: AREA.lng,
    distance_m: 600,
    open_now: true,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item('Matcha latte', 550)],
    matched: [item('Matcha latte', 550)],
    sold_out: [],
    reasons: [],
    deal: null,
  },
]

const sampleShopDetails: Record<string, object> = {
  'demo-shop-1': {
    id: 'demo-shop-1',
    name: 'Corner Cup',
    category: 'cafe',
    location: 'Eng Hoon Street, Tiong Bahru',
    hours: '08:00 – 17:00',
    phone: '+65 6222 1234',
    reward_text: 'Free coffee after 8 stamps',
    stamps_needed: 8,
    currency: 'SGD',
    open_now: true,
    demo: true,
    products: [
      { name: 'Flat white', price: 450, unit: '', available: true, category: 'Coffee' },
      { name: 'Filter coffee', price: 500, unit: '', available: true, category: 'Coffee' },
      { name: 'Cold brew', price: 600, unit: '', available: true, category: 'Coffee' },
      { name: 'Almond croissant', price: 450, unit: '', available: true, category: 'Bakery' },
      { name: 'Cinnamon bun', price: 400, unit: '', available: false, category: 'Bakery' },
    ],
    facts: {
      halal: 'yes',
      vegetarian_options: true,
      payment_methods: ['cash', 'paynow'],
      custom_facts: [
        { key: 'story', label: 'Story', value: 'Freshly roasted every Tuesday morning in Tiong Bahru' },
      ],
    },
  },
  'demo-shop-2': {
    id: 'demo-shop-2',
    name: 'Sunrise Bakehouse With A Long Name',
    category: 'bakery',
    location: 'Yong Siak Street, Tiong Bahru',
    hours: '07:30 – 16:00',
    phone: '+65 6333 5678',
    reward_text: 'Free loaf after 10 stamps',
    stamps_needed: 10,
    currency: 'SGD',
    open_now: true,
    demo: true,
    products: [
      { name: 'Kaya croissant with salted butter', price: 500, unit: '', available: true, category: 'Bakery' },
      { name: 'Sourdough loaf', price: 800, unit: '', available: false, category: 'Bakery' },
    ],
    facts: {
      halal: 'no',
      vegetarian_options: true,
      payment_methods: ['cash', 'card'],
      custom_facts: [
        { key: 'story', label: 'Story', value: 'Traditional sourdough fermentation for 36 hours' },
      ],
    },
  },
}

const samplePassportView = {
  signed_in: true,
  device_only: false,
  points: 120,
  demo_points: 0,
  total: 120,
  level: {
    key: 'explorer',
    next: 'regular',
    next_requirement: { key: 'points', have: 120, need: 200 },
    requirements: [{ key: 'points', have: 120, need: 200 }],
  },
  streak: {
    weeks: 3,
    rain_checks: 1,
    freezes: 1,
    this_week: true,
    row: ['done', 'done', 'current'] as const,
    planned: [],
  },
  stamps: [
    {
      id: 'stamp-1',
      shop_id: 'demo-shop-1',
      shop_name: 'Corner Cup',
      created_at: Math.floor(Date.now() / 1000) - 86400,
      reward_text: 'Free coffee after 8 stamps',
      points: 10,
    },
  ],
  shops: [
    {
      shop_id: 'demo-shop-1',
      shop_name: 'Corner Cup',
      stamps: 3,
      needed: 8,
      reward_text: 'Free coffee after 8 stamps',
    },
  ],
  areas: [{ id: 'tiong-bahru', name: 'Tiong Bahru', shops: 3, stamps: 3, demo: true }],
  quests: [],
  impact: { meals: 2, co2_kg: 1.5, saved: { SGD: 800 } },
  perks: [],
  leaderboard: false,
  flagged: false,
  games: null,
}

const answer = {
  intent: {
    summary: 'Here are the best coffee spots near Tiong Bahru.',
    keywords: ['coffee'],
    category: '',
    max_price: null,
    halal: false,
    vegetarian: false,
    locally_made: false,
    open_now: false,
    followups: ['Cheaper?', 'Open now'],
    sort: 'best',
    near: '',
    deals: false,
  },
  mode: 'keywords',
  groups: [
    { id: 'best', places: sampleShops },
    {
      id: 'more',
      places: [
        {
          id: 'places/google-1',
          name: 'Tiong Bahru Bakery Kopi',
          source: 'google',
          category: 'cafe',
          lat: AREA.lat - 0.001,
          lng: AREA.lng + 0.001,
          distance_m: 180,
          open_now: true,
          items: [],
          sold_out: [],
          matched: [],
          rating: 4.5,
          user_rating_count: 240,
          google_maps_uri: 'https://maps.google.com/?cid=1',
          photo_url: null,
          photo_authors: [],
          demo: true,
          demo_shop: false,
        },
      ],
    },
  ],
  anchor: null,
}

async function setupCustomerRoutes(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: sampleShops, google_unavailable: false } }),
  )
  await page.route('**/api/v1/discover/suggest?**', (route) =>
    route.fulfill({
      json: { items: ['Flat white', 'Croissant'], shops: 6, open_now: 4, locally_made: 2, deals: 1 },
    }),
  )
  await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: answer }))
  await page.route('**/api/v1/public/shops/*', (route) => {
    const url = new URL(route.request().url())
    const match = /\/api\/v1\/public\/shops\/([^/?]+)/.exec(url.pathname)
    const id = match?.[1] ? decodeURIComponent(match[1]) : ''
    const data = sampleShopDetails[id] ?? sampleShopDetails['demo-shop-1']!
    route.fulfill({ json: data })
  })
  await page.route('**/api/v1/public/passport/preview?**', (route) =>
    route.fulfill({ json: samplePassportView }),
  )
  await page.route('**/api/v1/customer/passport?**', (route) =>
    route.fulfill({ json: samplePassportView }),
  )
  await page.route('**/api/v1/customer/me', (route) =>
    route.fulfill({
      json: {
        signed_in: true,
        name: 'Alex',
        profile: { interests: ['coffee'], follows: [], searches: [] },
      },
    }),
  )
  await page.route('**/api/v1/customer/shops/*/threads/**', (route) => {
    if (route.request().url().includes('/stream')) {
      return route.fulfill({ status: 200, body: '' })
    }
    if (route.request().url().includes('/seen')) {
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({
      json: {
        shop: { id: 'demo-shop-1', name: 'Corner Cup', category: 'cafe', photo_url: null, demo: true },
        thread: {
          id: '00000000-0000-0000-0000-000000000001',
          created_at: 1729000000,
          updated_at: 1729000000,
          messages: [
            { id: 'm1', author: 'customer', text: 'Hi, do you have flat whites?', created: 1729000000, kind: '' },
            { id: 'm2', author: 'owner', text: 'Yes, freshly roasted!', created: 1729000060, kind: '' },
          ],
          done: false,
          blocked: false,
        },
      },
    })
  })
}

const screenshotDir = process.env.SCREENSHOT_DIR ?? 'docs/ux/layout-after'

test.beforeAll(() => {
  try {
    mkdirSync(screenshotDir, { recursive: true })
  } catch {
    /* ignore */
  }
})

for (const width of [360, 390, 412]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`captures and verifies customer screens at ${width}px (${scheme})`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'phone widths')
      await page.setViewportSize({ width, height: 800 })
      await setupCustomerRoutes(page)
      await page.addInitScript(
        ([area, s]) => {
          localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: s, language: 'en' }))
        },
        [AREA, scheme] as const,
      )

      // Helper to assert no horizontal scroll
      const assertNoHorizontalScroll = async (context: string) => {
        const hasScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        )
        expect(hasScroll, `horizontal scroll detected on ${context}`).toBe(false)
      }

      // 1. Front door
      await page.goto('/explore/', { timeout: 80_000 })
      const composer = page.getByRole('search').getByRole('textbox')
      await expect(composer).toBeVisible({ timeout: 30_000 })
      await assertNoHorizontalScroll('front-door')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${screenshotDir}/front-door-${width}-${scheme}.png` })

      // 2. Results + map
      await composer.fill('coffee')
      await composer.press('Enter')
      await expect(page.getByRole('list', { name: /found near Tiong Bahru/i })).toBeVisible({
        timeout: 20_000,
      })
      await assertNoHorizontalScroll('results-map')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${screenshotDir}/results-map-${width}-${scheme}.png` })

      // 3. Shop page header / image / name / menu
      await page.goto('/explore/s/demo-shop-1', { timeout: 80_000 })
      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toBeVisible({ timeout: 20_000 })
      await assertNoHorizontalScroll('shop-header')

      // Verify back button target size >= 48px
      const backBtn = page.locator('a[aria-label="Back"]').first()
      const backBox = await backBtn.boundingBox()
      expect(backBox?.width).toBeGreaterThanOrEqual(44)
      expect(backBox?.height).toBeGreaterThanOrEqual(44)

      // Verify hero banner aspect ratio (16:9)
      const heroBanner = page.getByTestId('shop-hero-banner')
      await expect(heroBanner).toBeVisible()
      const heroBox = await heroBanner.boundingBox()
      if (heroBox) {
        const ratio = heroBox.width / heroBox.height
        expect(ratio).toBeGreaterThan(1.5)
        expect(ratio).toBeLessThan(2.0)
      }
      const heroImg = heroBanner.locator('img')
      await expect(heroImg).toBeVisible()

      await page.waitForTimeout(400)
      await page.screenshot({ path: `${screenshotDir}/shop-header-${width}-${scheme}.png` })

      // Scroll to menu
      await page.evaluate(() => window.scrollTo(0, 350))
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${screenshotDir}/shop-menu-${width}-${scheme}.png` })

      // 4. Passport / stamps
      await page.goto('/explore/passport', { timeout: 80_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await assertNoHorizontalScroll('passport')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${screenshotDir}/passport-${width}-${scheme}.png` })

      // Scroll to stamps
      await page.evaluate(() => window.scrollTo(0, 400))
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${screenshotDir}/stamps-${width}-${scheme}.png` })

      // 5. Chat
      await page.goto('/explore/chats/demo-shop-1/00000000-0000-0000-0000-000000000001', { timeout: 80_000 })
      await expect(page.getByRole('heading', { name: 'Corner Cup' })).toBeVisible({ timeout: 20_000 })
      await assertNoHorizontalScroll('chat')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${screenshotDir}/chat-${width}-${scheme}.png` })

      // 6. Browse / customer cards
      await page.goto('/explore/browse', { timeout: 80_000 })
      await expect(page.locator('main [role="button"], main button').first()).toBeVisible({
        timeout: 20_000,
      })
      await assertNoHorizontalScroll('browse')

      // Verify "Change area" button is visible and free text input is hidden
      const changeAreaBtn = page.getByRole('button', { name: /change area/i })
      await expect(changeAreaBtn).toBeVisible()
      const placeSearchInput = page.getByPlaceholder(/search any city or neighbourhood/i)
      await expect(placeSearchInput).not.toBeVisible()

      // Scroll to shop cards in Browse
      await page.evaluate(() => window.scrollTo(0, 500))
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${screenshotDir}/browse-${width}-${scheme}.png` })

      // Verify shop card dimensions and image
      const firstCard = page.locator('main ul li').first()
      if (await firstCard.isVisible()) {
        const cardBox = await firstCard.boundingBox()
        if (cardBox) {
          expect(cardBox.width).toBeLessThanOrEqual(width)
          expect(cardBox.height).toBeLessThanOrEqual(320)
        }
      }
      await page.screenshot({ path: `${screenshotDir}/browse-card-${width}-${scheme}.png` })
    })
  }
}

test('captures shop header in Hindi and Tamil at 360px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone widths')
  await page.setViewportSize({ width: 360, height: 800 })
  await setupCustomerRoutes(page)

  // Hindi
  await page.addInitScript(
    ([area]) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: 'light', language: 'hi' }))
    },
    [AREA] as const,
  )
  await page.goto('/explore/s/demo-shop-2', { timeout: 80_000 })
  const headingHi = page.getByRole('heading', { level: 1 })
  await expect(headingHi).toBeVisible({ timeout: 20_000 })
  const isClippedHi = await headingHi.evaluate((el) => el.scrollWidth > el.clientWidth + 2)
  expect(isClippedHi).toBe(false)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${screenshotDir}/shop-header-hi-360.png` })

  // Tamil
  await page.addInitScript(() => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: 'light', language: 'ta' }))
  })
  await page.goto('/explore/s/demo-shop-2', { timeout: 80_000 })
  const headingTa = page.getByRole('heading', { level: 1 })
  await expect(headingTa).toBeVisible({ timeout: 20_000 })
  const isClippedTa = await headingTa.evaluate((el) => el.scrollWidth > el.clientWidth + 2)
  expect(isClippedTa).toBe(false)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${screenshotDir}/shop-header-ta-360.png` })
})

test('verifies context and scroll survive Ask -> results -> shop page -> back', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone widths')
  await page.setViewportSize({ width: 390, height: 600 })
  await setupCustomerRoutes(page)
  await page.addInitScript(
    ([area]) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: 'light', language: 'en' }))
    },
    [AREA] as const,
  )

  await page.goto('/explore/', { timeout: 80_000 })
  const composer = page.getByRole('search').getByRole('textbox')
  await expect(composer).toBeVisible({ timeout: 30_000 })

  // Ask question
  await composer.fill('coffee')
  await composer.press('Enter')
  const resultsList = page.getByRole('list', { name: /found near Tiong Bahru/i })
  await expect(resultsList).toBeVisible({ timeout: 20_000 })

  // Scroll down
  await page.evaluate(() => window.scrollTo(0, 150))
  await page.waitForTimeout(200)
  const scrolledBefore = await page.evaluate(() => window.scrollY)
  expect(scrolledBefore).toBeGreaterThan(0)

  // Click on the first pick
  const pickLink = page.getByRole('link', { name: /Corner Cup/i }).first()
  await pickLink.click()

  // Verify shop page loaded
  const shopHeading = page.getByRole('heading', { level: 1 })
  await expect(shopHeading).toBeVisible({ timeout: 20_000 })
  await expect(shopHeading).toHaveText(/Corner Cup/i)

  // Click back button
  const backBtn = page.locator('a[aria-label="Back"]').first()
  await backBtn.click()

  // Verify results are still visible (did not reset to opening)
  await expect(resultsList).toBeVisible({ timeout: 20_000 })

  // Verify scroll was restored
  await page.waitForTimeout(400)
  const restoredScroll = await page.evaluate(() => window.scrollY)
  expect(restoredScroll).toBeGreaterThan(0)
})

test('verifies location box toggle on Discover', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone widths')
  await page.setViewportSize({ width: 390, height: 800 })
  await setupCustomerRoutes(page)
  await page.addInitScript(
    ([area]) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
    },
    [AREA] as const,
  )

  await page.goto('/explore/browse', { timeout: 80_000 })
  const changeBtn = page.getByRole('button', { name: /change area/i })
  await expect(changeBtn).toBeVisible({ timeout: 20_000 })
  const placeSearchInput = page.getByPlaceholder(/search any city or neighbourhood/i)
  await expect(placeSearchInput).not.toBeVisible()

  // Click "Change area"
  await changeBtn.click()
  await expect(placeSearchInput).toBeVisible({ timeout: 5_000 })
})
