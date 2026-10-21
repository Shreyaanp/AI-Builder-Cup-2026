import { expect, test } from '@playwright/test'
import { THEMES, VIEWPORTS } from './rules.js'

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`OB-88 OB-175 Ask header keeps its logo and controls at ${viewport.width} in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      await page.addInitScript((appearance) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
        localStorage.setItem('chalkboard.customer.journey', 'done')
        localStorage.setItem(
          'chalkboard.discover.filters',
          JSON.stringify({
            place: {
              lat: 1.2847,
              lng: 103.832,
              label: 'Tiong Bahru with a very long neighbourhood name',
            },
          }),
        )
      }, theme)
      await page.goto('/explore/')
      await expect(page.locator('main').getByRole('textbox').first()).toBeVisible()
      // OB-175: keep main's shared semantic header and safe-area baseline after merging OB-88.
      const header = page.locator('main header[data-app-header]')
      await expect(header).toHaveCSS('height', '64px')
      await header.evaluate((element) =>
        (element as HTMLElement).style.setProperty('--app-header-safe-top', '24px'),
      )
      await expect(header).toHaveCSS('height', '88px')
      await header.evaluate((element) =>
        (element as HTMLElement).style.removeProperty('--app-header-safe-top'),
      )
      const logo = header.locator('[data-brand-logo]')
      await expect(logo).toBeVisible()
      await expect(logo).toHaveAttribute('href', '/explore/')
      const area = page.getByRole('button', { name: /Tiong Bahru with a very long/ })
      const profile = page.getByRole('button', { name: 'Profile and preferences', exact: true })
      const language = page.getByRole('button', { name: /^Language:/ })
      const appearance = page.getByRole('button', { name: /Switch to .* mode/ })
      const boxes = []
      for (const control of [logo, area, profile, language, appearance]) {
        await expect(control).toBeVisible()
        const box = (await control.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(48)
        expect(box.height).toBeGreaterThanOrEqual(48)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
        boxes.push(box)
      }
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width)
        expect(boxes[i].y).toBe(boxes[0].y)
      }
      await expect(page.getByRole('link', { name: 'Try demo', exact: true })).toHaveCount(0)
      await page.screenshot({ path: test.info().outputPath('ask-header.png') })
      await area.click()
      await expect(area).toHaveAttribute('aria-expanded', 'true')
      await area.click()
      await profile.click()
      const sheet = page.getByRole('dialog')
      const demo = sheet.getByRole('link', { name: 'Try demo', exact: true })
      await expect(demo).toBeVisible()
      await expect(demo).toHaveAttribute('href', '/explore/demo')
      await page.screenshot({ path: test.info().outputPath('profile-demo.png') })
      await sheet.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(sheet).toHaveCount(0)
      await expect(profile).toBeFocused()
      await language.click()
      await expect(page.getByRole('menu')).toBeVisible()
      await page.keyboard.press('Escape')
      await appearance.click()
      await expect(
        page.getByRole('button', {
          name: theme === 'light' ? 'Switch to light mode' : 'Switch to dark mode',
        }),
      ).toBeVisible()
      // The same crowded row must survive Indic and CJK labels without shrinking targets.
      for (const locale of ['hi', 'zh-Hans']) {
        await page.locator('#customer-language-button').click()
        await page.locator(`[role="menuitem"][lang="${locale}"]`).click()
        await expect(page.getByRole('menu')).toHaveCount(0)
        const controls = logo.locator('..').locator('a, button')
        await expect(controls).toHaveCount(5)
        let right = 0
        for (const control of await controls.all()) {
          const box = (await control.boundingBox())!
          expect(box.width).toBeGreaterThanOrEqual(48)
          expect(box.height).toBeGreaterThanOrEqual(48)
          expect(box.x).toBeGreaterThanOrEqual(right)
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
          right = box.x + box.width
        }
        await page.screenshot({ path: test.info().outputPath(`ask-header-${locale}.png`) })
      }
    })
  }
}
