import { expect, test } from '@playwright/test'

for (const appearance of ['light', 'dark']) {
  for (const size of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 1280, height: 800 },
  ]) {
    test(`OB-151 Ask keyboard keeps the dock stable ${size.width} ${appearance}`, async ({
      browser,
    }, testInfo) => {
      const phone = size.width < 600
      const context = await browser.newContext({
        ...testInfo.project.use,
        viewport: size,
        isMobile: phone,
        hasTouch: phone,
        reducedMotion: 'reduce',
      })
      try {
        const page = await context.newPage()
        await page.route('**/*', (route) =>
          ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
            ? route.fallback()
            : route.abort(),
        )
        await page.addInitScript((appearance) => {
          localStorage.setItem('chalkboard.customer.journey', 'done')
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
          localStorage.setItem(
            'chalkboard.discover.filters',
            JSON.stringify({ place: { lat: 12.9716, lng: 77.5946, label: 'Indiranagar' } }),
          )
        }, appearance)
        await page.goto('/explore/')
        const field = page.getByRole('search').getByRole('textbox')
        const dock = page.getByTestId('customer-chat-dock')
        const nav = page.locator('.c-nav')
        await expect(field).toBeVisible()
        const bottom = () => dock.evaluate((el) => el.getBoundingClientRect().bottom)
        const restingBottom = await bottom()
        await field.focus()
        // Focus happens before the keyboard animates. Do not jump into the navigation bar.
        await expect.poll(bottom).toBe(restingBottom)
        await expect(nav).toBeVisible()
        await field.fill('coffee nearby')
        if (phone) {
          // Android resizes the layout viewport; iOS only resizes/pans the visual viewport.
          const keyboardTop = Math.round(size.height * 0.55)
          // Real keyboards animate through several smaller viewport contractions.
          for (const shrink of [60, 120, 180, 240]) {
            const height = size.height - shrink
            await page.setViewportSize({ width: size.width, height })
            if (shrink <= 150) await expect(nav).toBeVisible()
            else await expect(nav).toBeHidden()
            await expect.poll(bottom).toBe(height - (shrink <= 150 ? 80 : 0))
          }
          await page.setViewportSize({ width: size.width, height: keyboardTop })
          await expect(nav).toBeHidden()
          await expect.poll(bottom).toBe(keyboardTop)
          await expect(field).toBeInViewport({ ratio: 1 })
          await field.blur()
          await expect(nav).toBeHidden()
          await expect.poll(bottom).toBe(keyboardTop)
          for (const shrink of [120, 60]) {
            const height = size.height - shrink
            await page.setViewportSize({ width: size.width, height })
            await expect(nav).toBeHidden()
            await expect.poll(bottom).toBe(height)
          }
          await page.setViewportSize(size)
          await expect(nav).toBeVisible()
          await expect.poll(bottom).toBe(restingBottom)

          await field.focus()
          await page.evaluate(() => {
            const view = window.visualViewport!
            Object.defineProperties(view, {
              height: { configurable: true, value: innerHeight * 0.55 },
              offsetTop: { configurable: true, value: 40 },
            })
            view.dispatchEvent(new Event('resize'))
          })
          await expect(nav).toBeHidden()
          await expect.poll(bottom).toBeCloseTo(size.height * 0.55 + 40, 0)
          await field.fill('coffee nearby with a long question that wraps onto more than one line')
          const visibleField = await field.boundingBox()
          expect(visibleField!.y).toBeGreaterThanOrEqual(40)
          expect(visibleField!.y + visibleField!.height).toBeLessThanOrEqual(await bottom())
          await page.screenshot({ path: testInfo.outputPath('keyboard-open.png') })
          // A tap on Send blurs the field before the keyboard finishes closing.
          await field.blur()
          await expect(nav).toBeHidden()
          await expect.poll(bottom).toBeCloseTo(size.height * 0.55 + 40, 0)
          await page.evaluate(() => {
            const view = window.visualViewport!
            Object.defineProperties(view, {
              height: { configurable: true, value: innerHeight },
              offsetTop: { configurable: true, value: 0 },
            })
            view.dispatchEvent(new Event('resize'))
          })
          await expect(nav).toBeVisible()
          await expect.poll(bottom).toBe(restingBottom)
        }
        await expect(field).toHaveValue(/coffee nearby/)
        await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
        await page.screenshot({ path: testInfo.outputPath('keyboard-closed.png') })
      } finally {
        await context.close()
      }
    })
  }
}
