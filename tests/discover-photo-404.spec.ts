import { expect, test } from '@playwright/test'

// OB-46: a Google place photo that answers 404 (or has no photo at all) shows the category art,
// never a broken image, on the browse list.
const place = (id: string, name: string, photo_url: string | null) => ({
  id,
  name,
  source: 'google',
  category: 'cafe',
  lat: 12.9719,
  lng: 77.6412,
  distance_m: 300,
  open_now: true,
  currency: 'INR',
  items: [],
  sold_out: [],
  locally_made: false,
  demo: true,
  demo_shop: false,
  photo_url,
  photo_authors: photo_url ? ['A photographer'] : [],
  halal: null,
  google_maps_uri: 'https://maps.google.com/?cid=1',
})

test('OB-46: discover cards never show a broken image when the place photo 404s', async ({
  page,
}) => {
  const requested: number[] = []
  await page.route('**/api/v1/place-photo?**', (route) => {
    requested.push(404)
    return route.fulfill({ status: 404, json: { detail: 'PHOTO_NOT_AVAILABLE' } })
  })
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({
      json: {
        mode: 'live',
        google_unavailable: false,
        places: [
          place(
            'g1',
            'Third Wave Coffee',
            '/api/v1/place-photo?name=places%2Fg1%2Fphotos%2Fp&sig=x',
          ),
          place('g2', 'Toit Brewpub', '/api/v1/place-photo?name=places%2Fg2%2Fphotos%2Fp&sig=x'),
          place('g3', 'No Photo Cafe', null),
        ],
      },
    }),
  )
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 12.9719, lng: 77.6412, label: 'Bengaluru' } }),
    )
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/explore/browse')
  const rows = page.getByRole('list', { name: /around me/i }).getByRole('listitem')
  await expect(rows).toHaveCount(3, { timeout: 20_000 })
  await expect.poll(() => requested.length).toBeGreaterThan(0)
  await expect
    .poll(async () =>
      page.evaluate(
        () => [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).length,
      ),
    )
    .toBe(0)
  expect(await page.evaluate(() => document.images.length)).toBeGreaterThanOrEqual(3)
})
