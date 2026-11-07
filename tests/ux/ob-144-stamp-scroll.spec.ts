import { expect, test } from '@playwright/test'
import { THEMES, VIEWPORTS } from './rules.js'

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`OB-144 ${viewport.width} ${theme}`, () => {
      test.use({
        viewport,
        colorScheme: theme,
        reducedMotion: 'reduce',
        isMobile: viewport.width < 600,
        hasTouch: viewport.width < 600,
        permissions: ['geolocation'],
        geolocation: { latitude: 12.97, longitude: 77.59 },
      })

      test('scratch card and its controls scroll above the pinned Passport action', async ({
        page,
      }) => {
        await page.route('**/*', (route) =>
          ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
            ? route.fallback()
            : route.abort(),
        )
        await page.addInitScript((appearance) => {
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
          localStorage.setItem('chalkboard.customer.journey', 'done')
        }, theme)
        // A fresh local session reproduces the owner's full celebration (goal + next level).
        const session = await page.request.post('/api/v1/customer/session', {
          data: { name: 'Neighbour' },
        })
        expect(session.ok()).toBe(true)
        await page.goto('/explore/s/demo-story-bengaluru-chai?source=qr')
        await page.getByRole('button', { name: 'Collect your stamp' }).click()
        const dialog = page.getByRole('dialog')
        const passport = dialog.getByRole('button', { name: 'See your Passport' })
        await expect(passport).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const foil = dialog.getByTestId('scratch-card-foil-container')
        await expect(foil).toBeVisible()
        const scroll = dialog
          .locator('div')
          .filter({ has: page.getByTestId('scratch-card-foil-container') })
          .filter({ hasNot: page.getByRole('button', { name: 'See your Passport' }) })
        const scroller = await scroll.evaluateAll((elements) =>
          elements.findIndex((el) => getComputedStyle(el).overflowY === 'auto'),
        )
        expect(scroller).toBeGreaterThanOrEqual(0)
        const content = scroll.nth(scroller)
        // OB-144: the whole foil must be available on arrival, before any swipe or auto-scroll.
        await expect(content).toHaveJSProperty('scrollTop', 0)
        await page.screenshot({
          path: `test-results/ob-144-initial-${viewport.width}-${theme}.png`,
        })
        await expect
          .poll(async () => {
            const card = (await foil.boundingBox())!
            const area = (await content.boundingBox())!
            const action = (await passport.boundingBox())!
            return (
              card.y >= area.y && card.y + card.height <= Math.min(area.y + area.height, action.y)
            )
          })
          .toBe(true)
        if (viewport.width < 600) {
          // Also cover a shorter window (e.g. browser chrome): even the taller phones must
          // still let a touch swipe reach the controls when the compact celebration overflows.
          await page.setViewportSize({ width: viewport.width, height: 800 })
          // Swipe beside the foil: dragging the foil itself intentionally scratches it.
          const area = (await content.boundingBox())!
          const cdp = await page.context().newCDPSession(page)
          const x = area.x + 12
          const y = area.y + area.height - 16
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y }],
          })
          for (let step = 1; step <= 8; step++)
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [{ x, y: y - step * 32 }],
            })
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          await cdp.detach()
          await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
        }
        await content.evaluate((el) => el.scrollTo(0, el.scrollHeight))
        await expect
          .poll(async () => {
            const card = (await foil.boundingBox())!
            const area = (await content.boundingBox())!
            const action = (await passport.boundingBox())!
            return (
              card.y >= area.y && card.y + card.height <= Math.min(area.y + area.height, action.y)
            )
          })
          .toBe(true)
        const odds = dialog.getByRole('button', { name: 'See the odds', exact: true })
        await odds.click({ trial: true })
        await page.screenshot({ path: `test-results/ob-144-${viewport.width}-${theme}.png` })
        await passport.click()
        await expect(
          page.getByRole('heading', { name: 'Your passport', exact: true }),
        ).toBeVisible()
      })
    })
  }
}
