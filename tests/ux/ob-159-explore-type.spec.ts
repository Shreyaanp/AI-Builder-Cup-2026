import { expect, test } from '@playwright/test'
import { measure } from './measure.ts'
import { THEMES, VIEWPORTS } from './rules.ts'

for (const appearance of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`OB-159 Explore uses a restrained type scale at ${viewport.width} ${appearance}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.addInitScript((appearance) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
        localStorage.setItem('chalkboard.customer.journey', 'done')
      }, appearance)
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      await page.goto('/explore/')
      const title = page.getByText('Today’s 7 near you', { exact: true })
      await expect(title).toBeVisible()
      await page.evaluate(() => document.fonts.ready)

      // The card title shares the theme's titleMedium role instead of adding a vw-based size.
      await expect(title).toHaveCSS('font-size', '16px')
      const metrics = await page.evaluate(measure, viewport.width < 600)
      expect(metrics.fontSizes.length, metrics.fontSizes.join(', ')).toBeLessThanOrEqual(6)
      expect(metrics.overflow).toEqual([])
      await page.screenshot({ path: test.info().outputPath('explore.png') })
    })
  }
}
