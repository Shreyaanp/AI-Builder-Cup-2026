import { expect, test } from '@playwright/test'

test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', viewport: { width: 390, height: 844 } })

const INDIRANAGAR = { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' }

function nearbyShop(price: number) {
  return {
    id: 'demo-fixture-kopi',
    name: 'Fixture Kopi',
    source: 'chalkboard',
    category: 'Cafe',
    lat: 12.972,
    lng: 77.642,
    distance_m: 120,
    open_now: true,
    currency: 'INR',
    items: [{ name: 'Kopi', price, unit: 'cup', available: true }],
    matched: [{ name: 'Kopi', price, unit: 'cup', available: true }],
    sold_out: [],
    demo_shop: true,
    deal: null,
  }
}

// OB-207: the Ask home "Near you now" cards write whole rupees like the shop page.
test('OB-207: Near you now cards show whole rupees, fractional amounts keep decimals', async ({
  page,
}) => {
  await page.addInitScript((area) => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
  }, INDIRANAGAR)
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        places: [
          nearbyShop(12000),
          { ...nearbyShop(1550), id: 'demo-fixture-chai', name: 'Fixture Chai' },
        ],
        google_unavailable: false,
      },
    }),
  )
  await page.goto('/explore/')
  const nearby = page.getByRole('list', { name: 'Near you now' })
  await expect(nearby.locator('a[href="/explore/s/demo-fixture-kopi"]')).toBeVisible({
    timeout: 30_000,
  })
  await expect(nearby).toContainText('₹120')
  await expect(nearby).not.toContainText('₹120.00')
  await expect(nearby).toContainText('₹15.50')
})

// OB-208: a QR arrival plus a collected stamp is engagement; the intro never shows afterwards.
test('OB-208: after a QR stamp the Passport tab does not open the first-run intro', async ({
  browser,
  request,
}) => {
  test.setTimeout(60_000)
  const shopResponse = await request.get('/api/v1/public/shops/demo-story-bengaluru-chai')
  expect(shopResponse.ok(), await shopResponse.text()).toBe(true)
  const shop = (await shopResponse.json()) as { lat: number; lng: number }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(test.info().project.use.baseURL!).origin,
          localStorage: [{ name: 'niva.language.chosen', value: '1' }],
        },
      ],
    },
    permissions: ['geolocation'],
    geolocation: { latitude: shop.lat, longitude: shop.lng, accuracy: 20 },
  })
  const page = await context.newPage()
  try {
    const session = await page.request.post('/api/v1/customer/session', {
      data: { name: 'Asha Rao' },
    })
    expect(session.ok(), await session.text()).toBe(true)
    await page.goto('/explore/s/demo-story-bengaluru-chai?source=qr')
    await page.getByRole('button', { name: 'Collect your stamp' }).click()
    const moment = page.getByRole('dialog')
    await moment.getByRole('button', { name: 'Keep browsing' }).click()
    await expect(moment).toBeHidden()
    await page.getByRole('link', { name: 'Back' }).click()
    const passport = page.getByRole('link', { name: /Passport$/ })
    // The shop page and a fresh load (a reload, a later visit) must both skip the intro.
    await page.goto((await passport.getAttribute('href'))!)
    await expect(page.getByRole('heading', { name: 'Your passport' })).toBeVisible()
    await expect(page.getByText('Find local shops near you')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
