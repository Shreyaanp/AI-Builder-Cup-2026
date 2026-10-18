import { expect, test, type Page } from '@playwright/test'

// Answer layout on phones (owner, 17 Oct: "the shop card is too big for the screen"): the
// answer is a short map strip and then compact rows, ours first and Google's after in the same
// shape. Every width the owner tests (360/390/412) in light and dark: nothing sideways, nothing
// clipped, 48px targets, and the rows start in the first screen above the composer.
test.describe.configure({ timeout: 90_000 })

const AREA = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
const item = (name: string, price: number) => ({ name, price, unit: '', available: true })
const ours = ['Corner Cup (Demo)', 'Sunrise Bakehouse With A Long Name (Demo)', 'Lane 4'].map(
  (name, i) => ({
    id: `demo-rows-${i}`,
    name,
    source: 'chalkboard',
    category: i === 1 ? 'bakery' : 'cafe',
    lat: AREA.lat + i * 0.001,
    lng: AREA.lng,
    distance_m: 150 + i * 100,
    open_now: i !== 2,
    currency: 'SGD',
    demo: false,
    demo_shop: true,
    items: [item(i === 1 ? 'Kaya croissant with salted butter' : 'Flat white', 450 + i * 50)],
    matched: [item(i === 1 ? 'Kaya croissant with salted butter' : 'Flat white', 450 + i * 50)],
    sold_out: [],
    reasons: [],
    deal:
      i === 0
        ? { item: 'Flat white', price: 300, pickup_end: Math.floor(Date.now() / 1000) + 3600 }
        : null,
  }),
)
const google = ['Tiong Bahru Kopi', 'Chinatown Hawker Centre'].map((name, i) => ({
  id: `places/google-${i}`,
  name,
  source: 'google',
  category: 'cafe',
  lat: AREA.lat - i * 0.001,
  lng: AREA.lng + 0.001,
  distance_m: 80 + i * 400,
  open_now: true,
  items: [],
  sold_out: [],
  matched: [],
  rating: 4.4,
  user_rating_count: i === 1 ? 123456 : 120,
  google_maps_uri: 'https://maps.google.com/?cid=1',
  photo_url: null,
  photo_authors: [],
  demo: true,
  demo_shop: false,
}))
const answer = {
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
  groups: [
    { id: 'best', places: ours },
    { id: 'more', places: google },
  ],
  anchor: null,
}

async function ask(page: Page, scheme: 'light' | 'dark') {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: ours, google_unavailable: false } }),
  )
  await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: answer }))
  await page.addInitScript(
    ([area, scheme]) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: scheme }))
    },
    [AREA, scheme] as const,
  )
  await page.goto('/explore/', { timeout: 80_000 })
  const box = page.getByRole('search').getByRole('textbox')
  await expect(box).toBeVisible({ timeout: 30_000 })
  await box.fill('coffee')
  await box.press('Enter')
  const rows = page.getByRole('list', { name: /found near Tiong Bahru/ }).getByRole('link')
  await expect(rows).toHaveCount(3)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return rows
}

for (const width of [360, 390, 412])
  for (const scheme of ['light', 'dark'] as const)
    test(`answer rows at ${width}px (${scheme}): fit, 48px, ours first, Google labelled`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, 'phone widths')
      await page.setViewportSize({ width, height: 800 })
      const rows = await ask(page, scheme)
      await page.waitForTimeout(600)
      const layout = await page.evaluate(() => {
        const W = document.documentElement.clientWidth
        const main = document.querySelector('main')!
        const out: string[] = []
        if (document.documentElement.scrollWidth > W) out.push('sideways scroll')
        for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
          const r = el.getBoundingClientRect()
          if (!r.width || el.closest('[aria-hidden="true"]')) continue
          if (r.right > W + 1 || r.left < -1)
            out.push(`outside: ${el.tagName} ${r.left}..${r.right}`)
        }
        for (const el of Array.from(
          main.querySelectorAll<HTMLElement>('a[href], button, [role="button"]'),
        )) {
          const r = el.getBoundingClientRect()
          if (r.width && (r.width < 47.5 || r.height < 47.5))
            out.push(`small: ${el.textContent?.trim()} ${r.width}x${r.height}`)
        }
        return out
      })
      expect(layout).toEqual([])
      // Compact rows: none taller than 140px, all inside the screen width.
      for (const row of await rows.all()) {
        const box = (await row.boundingBox())!
        expect(box.height).toBeLessThanOrEqual(140)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
      // The first row starts in the first screen, above the composer.
      await page.evaluate(() => window.scrollTo(0, 0))
      const composer = (await page.getByRole('search').boundingBox())!
      const first = (await rows.first().boundingBox())!
      expect(first.y + first.height).toBeLessThanOrEqual(composer.y)
      // Ours first and numbered like the map pins; names never run under the price.
      await expect(rows.first()).toContainText('Corner Cup')
      await expect(rows.first()).not.toContainText('(Demo)')
      await expect(rows.first()).toContainText('Demo shop')
      const clipped = await rows.evaluateAll((links) =>
        links.flatMap((link) =>
          Array.from(link.querySelectorAll<HTMLElement>('h3, p, span'))
            .filter((el) => el.getBoundingClientRect().right > link.getBoundingClientRect().right)
            .map((el) => el.textContent),
        ),
      )
      expect(clipped).toEqual([])
      // Google's places come after ours, same shape, each carrying Google's attribution.
      const places = page.getByRole('region', { name: /Google/ }).getByRole('link')
      await expect(places).toHaveCount(2)
      for (const place of await places.all()) {
        await expect(place).toContainText('Google Maps')
        const box = (await place.boundingBox())!
        expect(box.height).toBeLessThanOrEqual(140)
      }
      await expect(places.nth(1)).toContainText('123,456 reviews on Google')
      const googleHeights = await places.evaluateAll((links) =>
        links.map((link) => Math.round(link.getBoundingClientRect().height)),
      )
      expect(new Set(googleHeights).size).toBe(1)
    })
