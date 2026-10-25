import { expect, test, type Page } from '@playwright/test'
import { localOnly } from './stories/support.js'

// Release batch B5, the customer shop page (customer audit 22 Oct): sample shops are labelled
// plainly and never "Verified owner" (A-12), the menu heading unpins when its section ends
// (A-14), the customer demo keeps its banner and Exit demo on every step (A-16), rupee prices
// have no ".00" (A-26), actions sit in an equal-width grid with one filled button (A-27), perks
// are capped at five (A-28), the hours panel does not repeat its heading and the address is on the
// page (A-39), and the demo notice and steps read cleanly (A-41).
test.describe.configure({ timeout: 90_000 })
test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })

const SAMPLE = 'demo-story-bengaluru-chai'

test.beforeEach(async ({ page }, info) => {
  await localOnly(page)
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `shop-polish-${info.testId}` })
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 })
})

const banner = (page: Page) => page.getByTestId('demo-banner')
const exitDemo = (page: Page) => page.getByRole('button', { name: 'Exit demo', exact: true })

async function openSample(page: Page) {
  await page.goto(`/explore/s/${SAMPLE}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('shop-menu')).toBeVisible()
}

test('A-12: a sample shop says "Sample shop", never "Verified owner", and has no Directions', async ({
  page,
}) => {
  await openSample(page)
  // One plain name; the chip says it is a sample (no "(Demo)" suffix, no "Demo shop").
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lantern Chai Corner')
  await expect(page.getByTestId('sample-shop-chip')).toHaveText('Sample shop')
  await expect(page.getByText('Verified owner')).toHaveCount(0)
  await expect(page.getByText('Demo shop', { exact: true })).toHaveCount(0)
  await expect(page).toHaveTitle(/^Lantern Chai Corner · /)
  // Its address is made up: no route to it is offered, and the page says the address is a sample.
  await expect(page.getByRole('link', { name: 'Directions' })).toHaveCount(0)
  await expect(page.locator('a[href*="google.com/maps"]')).toHaveCount(0)
  await expect(page.getByTestId('shop-address')).toContainText('Sample address')
})

test('A-12: a real shop keeps Directions and shows its address', async ({ page }) => {
  await page.route('**/api/v1/public/shops/2f6c1c0e-5b7a-4c1d-9a55-3b1d2c4e8f10', (route) =>
    route.fulfill({
      json: {
        id: '2f6c1c0e-5b7a-4c1d-9a55-3b1d2c4e8f10',
        name: 'Corner Cup',
        category: 'Cafe',
        location: '12 Orchard Road, Singapore',
        hours: '08:00–18:00',
        weekly_hours: [],
        phone: '+65 6000 0000',
        currency: 'SGD',
        demo: false,
        products: [{ name: 'Kopi', price: 150, unit: 'cup', available: true }],
        facts: {},
      },
    }),
  )
  await page.goto('/explore/s/2f6c1c0e-5b7a-4c1d-9a55-3b1d2c4e8f10')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Corner Cup')
  await expect(page.getByRole('link', { name: 'Directions' })).toBeVisible()
  await expect(page.getByTestId('sample-shop-chip')).toHaveCount(0)
  await expect(page.getByTestId('shop-address')).toContainText('12 Orchard Road')
  await expect(page.getByTestId('shop-address')).not.toContainText('Sample')
})

// The same sample shops, the way the real Ask and its map list them.
const AREA = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
const item = (name: string, price: number) => ({ name, price, unit: '', available: true })
const sampleShops = ['Corner Cup (Demo)', 'Sunrise Bakehouse (Demo)'].map((name, i) => ({
  id: `demo-polish-${i}`,
  name,
  source: 'chalkboard',
  category: 'cafe',
  lat: AREA.lat + i * 0.001,
  lng: AREA.lng,
  distance_m: 150 + i * 100,
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

test('A-12: Ask rows and the map list label sample shops the same way', async ({ page }) => {
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: sampleShops, google_unavailable: false } }),
  )
  await page.route('**/api/v1/discover/ask', (route) =>
    route.fulfill({
      json: {
        intent: {
          summary: '',
          keywords: ['coffee'],
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
        groups: [{ id: 'best', places: sampleShops }],
        anchor: null,
      },
    }),
  )
  await page.addInitScript((area) => {
    localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
  }, AREA)
  await page.goto('/explore/')
  const box = page.getByRole('search').getByRole('textbox')
  await expect(box).toBeVisible({ timeout: 30_000 })
  await box.fill('coffee')
  await box.press('Enter')
  const rows = page.getByRole('list', { name: /found near Tiong Bahru/ }).getByRole('link')
  await expect(rows).toHaveCount(2)
  for (const row of await rows.all()) {
    await expect(row).toContainText('Sample shop')
    await expect(row).not.toContainText('Demo shop')
    await expect(row).not.toContainText('(Demo)')
  }
  // The map's list: the same plain name and the same label.
  await page.getByRole('button', { name: 'Open map' }).click()
  const mapRows = page.locator('li[data-place]')
  await expect(mapRows).toHaveCount(2)
  for (const row of await mapRows.all()) {
    await expect(row).toContainText('Sample shop')
    await expect(row).not.toContainText('(Demo)')
  }
})

test('A-14: the "Menu & prices" heading unpins when the menu section ends', async ({ page }) => {
  await openSample(page)
  const heading = page.locator('#shop-menu-title')
  const menu = page.getByTestId('shop-menu')
  const top = () => heading.evaluate((n) => n.getBoundingClientRect().top)
  // Inside the menu it stays on screen (pinned under the app bar) while the list scrolls.
  const menuBox = (await menu.boundingBox())!
  await page.evaluate((y) => window.scrollTo(0, y), menuBox.y + 120)
  expect(await top()).toBeGreaterThan(0)
  expect(await top()).toBeLessThan(120)
  // Past the end of the section it scrolls away with it: it no longer labels what follows.
  await page.locator('#stamp-card').evaluate((n) => n.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, 200))
  await expect
    .poll(() => heading.evaluate((n) => n.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(0)
})

test('A-26: rupee prices drop ".00" when whole; the hero is the same on every width', async ({
  page,
}) => {
  await page.route(`**/api/v1/public/shops/${SAMPLE}`, async (route) => {
    const response = await route.fetch()
    const shop = (await response.json()) as { products: { price: number }[] }
    shop.products[0]!.price = 2000
    shop.products[1]!.price = 180000
    shop.products[2]!.price = 1850
    await route.fulfill({ response, json: shop })
  })
  await openSample(page)
  const menu = page.getByTestId('shop-menu')
  const rows = menu.getByRole('listitem')
  await expect(rows.nth(0)).toContainText('₹20')
  await expect(rows.nth(1)).toContainText('₹1,800')
  await expect(rows.nth(2)).toContainText('₹18.50')
  // No whole amount anywhere on the menu carries ".00".
  expect(await menu.innerText()).not.toMatch(/₹[\d,]+\.00/)
  // The hero is the shop's category art (a sample shop's menu screenshot said "INR 20"), shown at
  // a steady 16:10 to 16:9 shape without stray edges.
  const hero = page.getByTestId('shop-hero-banner')
  await expect(hero.locator('img')).toHaveAttribute('src', /\/art\/category-/)
  const box = (await hero.boundingBox())!
  expect(box.width / box.height).toBeGreaterThan(1.5)
  expect(box.width / box.height).toBeLessThan(2)
  const img = (await hero.locator('img').boundingBox())!
  expect(img.width).toBeGreaterThanOrEqual(box.width - 1)
  expect(img.height).toBeGreaterThanOrEqual(box.height - 1)
})

test('A-27: Follow, Stamp card and Directions share one equal-width row; one filled button', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'The equal-width grid is the phone layout')
  await page.route(`**/api/v1/public/shops/${SAMPLE}`, async (route) => {
    const response = await route.fetch()
    const shop = (await response.json()) as Record<string, unknown>
    // A real shop: Directions is offered (a sample shop's address is made up).
    await route.fulfill({
      response,
      json: { ...shop, demo: false, location: '12 Church Street, Bengaluru', phone: '' },
    })
  })
  await openSample(page)
  // The handwritten story above the row rewraps when Caveat arrives (font-display: swap); the
  // boxes are read one at a time, so measure the settled page.
  await page.evaluate(() => document.fonts.ready)
  const tiles = page.getByTestId('shop-actions').locator('> *')
  await expect(tiles).toHaveCount(3)
  const boxes = (await Promise.all((await tiles.all()).map((tile) => tile.boundingBox()))).map(
    (b) => b!,
  )
  const first = boxes[0]!
  for (const b of boxes.slice(1)) {
    expect(Math.abs(b.width - first.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(b.y - first.y)).toBeLessThanOrEqual(1)
    expect(b.height).toBeGreaterThanOrEqual(48)
  }
  expect(Math.max(...boxes.map((b) => b.x + b.width))).toBeLessThanOrEqual(390)
  // At most one filled primary button on screen, wherever the page is scrolled.
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    const filled = await page.locator('.MuiButton-contained').evaluateAll(
      (els) =>
        els.filter((el) => {
          const r = el.getBoundingClientRect()
          return r.bottom > 0 && r.top < innerHeight && r.width > 0
        }).length,
    )
    expect(filled, `filled buttons at scroll ${y}`).toBeLessThanOrEqual(1)
  }
})

test('A-28: at most five thank-yous, no repeated subtitle, "for a free chai" in lower case', async ({
  page,
}) => {
  await openSample(page)
  const perks = page.getByRole('region', { name: 'Thank-yous from this shop' })
  const list = perks.getByRole('listitem')
  await expect(list).toHaveCount(5)
  const more = perks.getByRole('button', { name: 'Show more' })
  await expect(more).toBeVisible()
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect(list).toHaveCount(7)
  await expect(perks.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  // "Your third visit: a free refill" already says when; the subtitle does not say it again.
  const third = list.filter({ hasText: 'Your third visit: a free refill' })
  await expect(third).toHaveCount(1)
  await expect(third).not.toContainText('On your third visit')
  // A condition the text does not carry is still shown.
  await expect(list.filter({ hasText: 'Free upgrade on your next order' })).toContainText(
    'When you become a Regular',
  )
  await perks.getByRole('button', { name: 'Show fewer' }).click()
  await expect(list).toHaveCount(5)
  // The stamp card reads mid-sentence in lower case.
  await expect(page.getByText(/\d+ more for a free chai/)).toBeVisible()
  await expect(page.getByText(/more for A free/)).toHaveCount(0)
})

test('A-39: the hours panel does not repeat its heading; the address is on the page', async ({
  page,
}) => {
  await openSample(page)
  await expect(page.getByTestId('shop-address')).toBeVisible()
  const toggle = page.getByRole('button', { name: /^Weekly hours/ })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  const panel = page.getByRole('region', { name: 'Weekly hours' })
  await expect(panel).toBeVisible()
  // The toggle already says "Weekly hours"; the panel is the list itself.
  await expect(panel.getByRole('heading')).toHaveCount(0)
  await expect(panel).not.toContainText('Weekly hours')
  await expect(panel).toContainText('06:30–21:00')
})

test('A-16: the customer demo keeps its banner and Exit demo on every step', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'The demo steps are the phone journey')
  await page.goto('/explore/demo')
  await expect(page.getByRole('heading', { name: 'Browse shops' })).toBeVisible({ timeout: 30_000 })
  await expect(banner(page)).toContainText('Demo shop – nothing here is real')
  await expect(exitDemo(page)).toBeVisible()

  // Step 2: the counter stamp opens the shop page; the banner and Exit demo come with it.
  await page.getByRole('link', { name: /Collect a stamp$/ }).click()
  await expect(page).toHaveURL(new RegExp(`/explore/s/${SAMPLE}\\?source=qr`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lantern Chai Corner')
  await expect(banner(page)).toContainText('Demo shop – nothing here is real')
  await expect(exitDemo(page)).toBeVisible()

  // Step 3: the Passport too.
  await page.goto('/explore/demo')
  await expect(page.getByRole('heading', { name: 'Browse shops' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('link', { name: /See your Passport$/ }).click()
  await expect(page).toHaveURL(/\/explore\/passport/)
  await expect(page.getByRole('heading', { name: 'Your passport' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(banner(page)).toContainText('Demo shop – nothing here is real')
  await expect(exitDemo(page)).toBeVisible()

  // Exit demo leaves for the real customer app, with no banner left behind.
  await exitDemo(page).click()
  await expect(page).toHaveURL(/\/explore\/$/)
  await expect(banner(page)).toHaveCount(0)
  await page.goto('/explore/passport')
  await expect(page.getByRole('heading', { name: 'Your passport' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(banner(page)).toHaveCount(0)
})

test('A-16: a sample shop opened outside the demo has no demo banner', async ({ page }) => {
  await openSample(page)
  await expect(banner(page)).toHaveCount(0)
  await expect(exitDemo(page)).toHaveCount(0)
})

test('A-41: demo step links keep their words together', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The steps are the phone layout')
  await page.goto('/explore/demo')
  const steps = page.getByTestId('demo-steps').getByRole('listitem')
  await expect(steps).toHaveCount(3)
  for (const label of ['Collect a stamp', 'See your Passport']) {
    const link = page.getByRole('link', { name: new RegExp(`${label}$`) })
    await expect(link).toBeVisible()
    // One line of text: the words are not broken across lines.
    const lines = await link.evaluate((el) => {
      const text = el.querySelector('span:last-child')!
      return Math.round(
        text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight),
      )
    })
    expect(lines, label).toBe(1)
  }
})

test('A-41: the loading screen and the header show the same brand mark', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/src/features/demo/DemoApp.tsx*', async (route) => {
    const response = await route.fetch()
    await gate
    await route.fulfill({ response })
  })
  const look = (root: Page) =>
    root.evaluate(() => {
      const mark = document.querySelector('[data-brand-mark]')!
      const style = getComputedStyle(mark)
      return {
        width: style.width,
        height: style.height,
        background: style.backgroundColor,
        radius: style.borderRadius,
      }
    })
  await page.goto('/explore/demo', { waitUntil: 'domcontentloaded' })
  const splash = page.getByTestId('brand-splash')
  await expect(splash.locator('[data-brand-mark]')).toBeVisible()
  const onSplash = await look(page)
  release()
  await expect(splash).toHaveCount(0)
  await page.goto('/explore/saved')
  await expect(page.locator('[data-brand-mark]').first()).toBeVisible({ timeout: 30_000 })
  const inHeader = await look(page)
  expect(onSplash).toEqual(inHeader)
})

test('A-12: a sample shop opened from Browse is a usual labelled "Sample shop"', async ({
  page,
}) => {
  const sample = {
    id: SAMPLE,
    name: 'Lantern Chai Corner (Demo)',
    source: 'chalkboard',
    category: 'cafe',
    lat: 19.076,
    lng: 72.8777,
    distance_m: 180,
    open_now: true,
    currency: 'INR',
    items: [{ name: 'Masala chai', price: 2000, available: true }],
    sold_out: [],
    locally_made: false,
    demo: false,
    demo_shop: true,
    photo_url: null,
    photo_authors: [],
    halal: null,
  }
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'live', google_unavailable: false, places: [sample] } }),
  )
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 19.076, lng: 72.8777, label: 'Mumbai' } }),
    )
  })
  await page.goto('/explore/browse')
  const rows = page.getByRole('list', { name: /around me/i })
  await expect(rows).toBeVisible({ timeout: 20_000 })
  await rows.getByRole('link', { name: /Lantern Chai Corner/ }).click()
  await expect(page).toHaveURL(new RegExp('/explore/s/' + SAMPLE))
  await page.goBack()
  await expect(rows).toBeVisible({ timeout: 20_000 })
  // The usual keeps the plain name and says it is a sample.
  await expect(
    page.getByRole('link', { name: 'Lantern Chai Corner · Sample shop', exact: true }),
  ).toBeVisible()
})
