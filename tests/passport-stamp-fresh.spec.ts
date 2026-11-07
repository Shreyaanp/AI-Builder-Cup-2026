import { expect, test } from '@playwright/test'

// OB-257: a phone that already opened the Passport, then scans a stamp, must not be shown the
// old Passport as if it were current when it taps "See your Passport".
test('390px signed out: "See your Passport" after a scan never shows the Passport from before it', async ({
  browser,
  request,
}) => {
  test.skip(test.info().project.name !== 'phone', 'This regression is for the 390px phone layout')
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${process.env.WEB_PORT ?? 3200}`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    permissions: ['geolocation'],
    geolocation: { latitude: 12.9716, longitude: 77.5946, accuracy: 20 },
  })
  const page = await context.newPage()
  try {
    const bootstrap = (await (await page.request.get('/api/v1/bootstrap')).json()) as {
      features: { guest_customer?: boolean }
    }
    test.skip(!!bootstrap.features.guest_customer, 'Signed-out phones only')
    const shopResponse = await request.get('/api/v1/public/shops/demo-story-bengaluru-chai')
    expect(shopResponse.ok(), await shopResponse.text()).toBe(true)
    const shop = (await shopResponse.json()) as { lat: number; lng: number }
    await context.setGeolocation({ latitude: shop.lat, longitude: shop.lng, accuracy: 20 })

    // The Passport is opened first, so this phone holds a Passport without the stamp.
    await page.goto('/explore/passport')
    await expect(page.getByRole('region', { name: 'Stamp book' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Lantern Chai Corner/)).toHaveCount(0)

    // Then, without a reload, the shop and its scan.
    await page.evaluate(() => {
      history.pushState({}, '', '/explore/s/demo-story-bengaluru-chai?source=qr')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    // From the scan on, the Passport answers slowly: until it does, it must say it is loading.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/public/passport/preview*', async (route) => {
      await held
      await route.continue()
    })
    await page.getByRole('button', { name: 'Collect your stamp' }).click()
    const moment = page.getByRole('dialog')
    await expect(moment.getByRole('button', { name: 'Keep browsing' })).toBeVisible({
      timeout: 15_000,
    })

    await moment.getByRole('button', { name: 'See your Passport' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Your passport' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Your passport' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Stamp book' })).toHaveCount(0)
    release()
    const book = page.getByRole('region', { name: 'Stamp book' })
    await expect(book.getByText(/Lantern Chai Corner/)).toBeVisible({ timeout: 15_000 })
  } finally {
    await context.close()
  }
})
