import { expect, test, type Page } from '@playwright/test'

// /explore/browse on a phone: the same compact shop rows as the Ask home, nothing wider than the screen.
const place = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  source: 'chalkboard',
  category: 'cafe',
  lat: 19.076,
  lng: 72.8777,
  distance_m: 180,
  open_now: true,
  currency: 'INR',
  items: [{ name: 'Masala chai with a very long descriptive name', price: 2000, available: true }],
  sold_out: [],
  locally_made: false,
  demo: false,
  demo_shop: true,
  photo_url: null,
  photo_authors: [],
  halal: null,
  ...extra,
})
const places = [
  place('demo-b1', 'Irani Cafe And Bakery With An Exceptionally Long Shop Name', {
    halal: true,
  }),
  place('demo-b2', 'Shivaji Vada Pav', {
    category: 'street_food',
    open_now: false,
    distance_m: 950,
  }),
  place('demo-b3', 'Colaba Provision Store', { category: 'grocery', distance_m: 1400 }),
  place('google-1', 'Sea Face Restaurant', {
    source: 'google',
    items: [],
    rating: 4.4,
    user_rating_count: 60,
    demo: true,
    demo_shop: false,
    google_maps_uri: 'https://maps.google.com/?cid=1',
  }),
]

async function open(page: Page) {
  await page.route('**/api/v1/discover?**', (route) => {
    const query = new URL(route.request().url()).searchParams
    const open = query.get('open_now') === 'true'
    const category = query.get('category')
    return route.fulfill({
      json: {
        mode: 'demo',
        google_unavailable: false,
        places: places.filter(
          (p) => (!open || p.open_now) && (!category || p.category === category),
        ),
      },
    })
  })
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 19.076, lng: 72.8777, label: 'Mumbai' } }),
    )
  })
  await page.goto('/explore/browse')
  await expect(page.getByRole('list', { name: /around me/i })).toBeVisible({ timeout: 20_000 })
}

for (const colorScheme of ['light', 'dark'] as const)
  for (const width of [360, 390, 412]) {
    test(`browse page fits ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await open(page)
      const rows = page.getByRole('list', { name: /around me/i }).getByRole('listitem')
      await expect(rows).toHaveCount(places.length)
      for (let i = 0; i < places.length; i++) {
        const row = rows.nth(i)
        await expect(row.getByRole('heading')).not.toBeEmpty()
        await expect(row.locator('img').first()).toBeVisible()
        const box = (await row.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect(box.height).toBeGreaterThanOrEqual(48)
        expect(box.height).toBeLessThan(140)
      }
      // Nothing scrolls sideways, and the filter chips are thumb-sized.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBe(0)
      for (const chip of await page.getByRole('switch').all())
        expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(48)
      // The rupee price of the Ask home's rows is not needed here; the item line is.
      await expect(rows.first()).toContainText('Open now')
      await expect(rows.first()).toContainText('180 m')
    })
  }

test('filters narrow the list and the Google row opens its sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await open(page)
  const rows = page.getByRole('list', { name: /around me/i }).getByRole('listitem')
  await page.getByRole('switch', { name: 'Open now', exact: true }).click()
  await expect(rows).toHaveCount(3)
  await page.getByRole('switch', { name: 'Open now', exact: true }).click()
  await expect(rows).toHaveCount(4)
  await page.getByRole('switch', { name: 'Halal if known', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole('switch', { name: 'Halal if known', exact: true }).click()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Colaba Provision Store')
  await page.getByRole('button', { name: 'All places', exact: true }).click()
  await page.getByRole('button', { name: /Sea Face Restaurant/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Sea Face Restaurant')
})
