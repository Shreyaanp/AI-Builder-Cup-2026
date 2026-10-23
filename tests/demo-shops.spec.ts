import { expect, test, type Page } from '@playwright/test'

// Seeded demo shops must say so on every customer surface. The responses below have the exact
// shape the backend returns for a seeded shop (see backend/tests/test_demo_shops.py, which
// seeds the real stores); serving them here keeps the shared dev database free of demo shops
// that would change other specs' discovery results.
const shop = {
  id: 'demo-geylang-serai-nasi-lemak',
  name: 'Serai Sunrise Nasi Lemak',
  category: 'Hawker stall · Nasi lemak',
  location: 'Geylang Serai (demo)',
  lat: 1.3166,
  lng: 103.8985,
  place_id: null,
  timezone: 'Asia/Singapore',
  demo: true,
  hours: '07:00–14:00',
  phone: '+65 6000 0003',
  currency: 'SGD',
  facts: { halal: 'yes', payment_methods: ['cash', 'paynow'], delivery: 'foodpanda' },
  products: [
    { name: 'Nasi lemak (ikan bilis)', price: 350, unit: 'plate', available: true },
    { name: 'Nasi lemak with rendang', price: 650, unit: 'plate', available: false },
  ],
  last_confirmed: null,
}

async function offline(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
}

test('a demo shop is labelled on its customer page and its discovery card', async ({ page }) => {
  await offline(page)
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.route(`**/api/v1/public/shops/${shop.id}`, (route) => route.fulfill({ json: shop }))
  await page.goto(`/s/${shop.id}`)
  await expect(page.getByRole('heading', { name: shop.name })).toBeVisible()
  await expect(page.getByText('Sample shop', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Sample shop for this prototype — not a real business.'),
  ).toBeVisible()
  // Fictional numbers are never offered as call or WhatsApp links.
  await expect(page.locator('a[href^="tel:"], a[href*="wa.me"]')).toHaveCount(0)

  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        google_unavailable: false,
        places: [
          {
            id: shop.id,
            name: shop.name,
            source: 'chalkboard',
            category: shop.category,
            lat: 1.2847,
            lng: 103.832,
            distance_m: 120,
            open_now: true,
            currency: 'SGD',
            items: shop.products.slice(0, 1),
            sold_out: ['Nasi lemak with rendang'],
            demo: false,
            demo_shop: true,
            photo_authors: [],
          },
        ],
      },
    }),
  )
  await page.goto('/discover')
  const card = page.getByRole('list').getByRole('link').filter({ hasText: shop.name })
  await expect(card).toBeVisible()
  await expect(card.getByText('Sample shop', { exact: true })).toBeVisible()
})
