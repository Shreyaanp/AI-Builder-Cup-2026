import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const SHOP = 'demo-story-bengaluru-chai'
const shots = process.env.QR_SHOTS === '1'

for (const width of [360, 390]) {
  for (const customer of ['signed-out', 'signed-in'] as const) {
    test(`${width}px ${customer}: QR arrival, stamp, moment and Passport`, async ({
      browser,
      request,
    }) => {
      test.skip(test.info().project.name !== 'phone', 'Phone layout regression')
      const base = `http://127.0.0.1:${process.env.WEB_PORT ?? 3200}`
      const context = await browser.newContext({
        baseURL: base,
        viewport: { width, height: 800 },
        isMobile: true,
        hasTouch: true,
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
        permissions: ['geolocation'],
        storageState: {
          cookies: [],
          origins: [
            {
              origin: base,
              localStorage: [
                { name: 'niva.language.chosen', value: '1' },
                { name: 'chalkboard.explainer.customer.v1', value: '1' },
              ],
            },
          ],
        },
      })
      const page = await context.newPage()
      const shot = async (name: string) => {
        if (shots)
          await page.screenshot({ path: `screenshots/qr-after/${width}-${customer}-${name}.png` })
      }
      try {
        if (customer === 'signed-in') {
          const session = await page.request.post('/api/v1/customer/session', {
            data: { name: 'Asha Rao' },
          })
          expect(session.ok(), await session.text()).toBe(true)
        }
        const shopResponse = await request.get(`/api/v1/public/shops/${SHOP}`)
        const shop = (await shopResponse.json()) as { lat: number; lng: number }
        await context.setGeolocation({ latitude: shop.lat, longitude: shop.lng, accuracy: 20 })

        // Arrive: the shop is visible, nothing opened by itself, one primary action in reach.
        await page.goto(`/explore/s/${SHOP}?source=qr`)
        const collect = page.getByRole('button', { name: 'Collect your stamp' })
        await expect(collect).toBeVisible({ timeout: 15_000 })
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByRole('heading', { name: /Lantern Chai Corner/ })).toBeVisible()
        const box = (await collect.boundingBox())!
        const viewport = page.viewportSize()!
        expect(box.height).toBeGreaterThanOrEqual(48)
        expect(box.y).toBeGreaterThan((viewport.height * 2) / 3)
        expect(box.x).toBeGreaterThanOrEqual(16)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 16)
        // The chat entry is a text button below it, not a second filled button.
        await expect(page.getByRole('button', { name: 'Chat with the shop' })).toHaveCount(1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await shot('1-arrive')

        // Stamp: the moment opens on the tap, and ends with a clear way on.
        await collect.click()
        const moment = page.getByRole('dialog')
        const passportLink = moment.getByRole('button', { name: 'See your Passport' })
        await expect(passportLink).toBeVisible({ timeout: 15_000 })
        await expect(moment.getByText('+50 demo points')).toBeVisible()
        await expect(moment.getByRole('button', { name: 'Keep browsing' })).toBeVisible()
        // Settled (the celebration is at most 1.2 s): full-contrast text, nothing out of reach.
        await page.waitForTimeout(1500)
        const pbox = (await passportLink.boundingBox())!
        expect(pbox.height).toBeGreaterThanOrEqual(48)
        expect(pbox.y + pbox.height).toBeLessThanOrEqual(viewport.height)
        expect(
          await moment.evaluate((el) => {
            const faded = Array.from(el.querySelectorAll('*')).filter((n) => {
              const style = getComputedStyle(n)
              return n.textContent?.trim() && Number(style.opacity) < 1 && !n.closest('button')
            })
            return faded.length
          }),
        ).toBe(0)
        await shot('2-moment')
        const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
        expect(axe.violations).toEqual([])

        // Passport: the stamp is there.
        await passportLink.click()
        await expect(page.getByRole('heading', { level: 1, name: 'Your passport' })).toBeVisible()
        await expect(page.getByText('Includes 50 demo points')).toBeVisible({ timeout: 15_000 })
        await shot('3-passport')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      } finally {
        await context.close()
      }
    })
  }
}

test('Keep browsing returns to the shop with the usual chat bar', async ({ browser, request }) => {
  test.skip(test.info().project.name !== 'phone', 'Phone layout regression')
  const base = `http://127.0.0.1:${process.env.WEB_PORT ?? 3200}`
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  try {
    const shop = (await (await request.get(`/api/v1/public/shops/${SHOP}`)).json()) as {
      lat: number
      lng: number
    }
    await context.setGeolocation({ latitude: shop.lat, longitude: shop.lng, accuracy: 20 })
    await page.goto(`/explore/s/${SHOP}?source=qr`)
    await page.getByRole('button', { name: 'Collect your stamp' }).click()
    const moment = page.getByRole('dialog')
    await moment.getByRole('button', { name: 'Keep browsing' }).click()
    await expect(moment).toBeHidden()
    await expect(page.getByRole('button', { name: 'Collect your stamp' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Chat with the shop' })).toBeVisible()
  } finally {
    await context.close()
  }
})
