import { expect, test } from '@playwright/test'

for (const customer of ['guest', 'signed-in'] as const) {
  test(`390px ${customer}: a demo story QR stamp reaches Passport`, async ({
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
      if (customer === 'guest') {
        test.skip(!bootstrap.features.guest_customer, 'Run with GUEST_CUSTOMER=true')
        const session = await page.request.post('/api/v1/customer/guest')
        expect(session.ok(), await session.text()).toBe(true)
      } else {
        const session = await page.request.post('/api/v1/customer/session', {
          data: { name: 'Asha Rao' },
        })
        expect(session.ok(), await session.text()).toBe(true)
      }

      const shopResponse = await request.get('/api/v1/public/shops/demo-story-bengaluru-chai')
      expect(shopResponse.ok(), await shopResponse.text()).toBe(true)
      const shop = (await shopResponse.json()) as { name: string; lat: number; lng: number }
      await page.context().grantPermissions(['geolocation'])
      await page.context().setGeolocation({ latitude: shop.lat, longitude: shop.lng, accuracy: 20 })

      await page.goto('/explore/s/demo-story-bengaluru-chai?source=qr')
      const moment = page.getByRole('dialog')
      await expect(moment.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 15_000 })
      await expect(moment.getByText('+50 demo points')).toBeVisible()
      await moment.getByRole('button', { name: 'Done' }).click()
      await expect(moment).toBeHidden()

      await page.goto('/explore/passport')
      await expect(page.getByRole('heading', { level: 1, name: 'Your passport' })).toBeVisible()
      await expect(page.getByText('Includes 50 demo points')).toBeVisible({ timeout: 15_000 })
      const book = page.getByRole('region', { name: 'Stamp book' })
      await expect(book.getByRole('link', { name: /Lantern Chai Corner/ })).toBeVisible()
      await expect(book).toContainText('3 of 10 stamps')
      await expect(page.getByText('Chai trail').first()).toBeVisible()
      await expect(page.getByRole('region', { name: /Weekly streak/ })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    } finally {
      await context.close()
    }
  })
}
