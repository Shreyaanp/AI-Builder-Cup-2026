import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { measure } from './measure.js'

const area = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
const item = { name: 'Kaya croissant with salted butter', price: 500, unit: '', available: true }
const pick = {
  id: 'demo-ob157',
  name: 'Corner Cup',
  source: 'chalkboard',
  category: 'cafe',
  ...area,
  distance_m: 120,
  open_now: true,
  currency: 'SGD',
  items: [item],
  matched: [item],
  sold_out: [],
  reasons: [],
  demo_shop: true,
  deal: { item: item.name, price: 300, pickup_end: Date.UTC(2026, 9, 20, 9, 30) / 1000 },
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
]) {
  for (const appearance of ['light', 'dark'] as const) {
    test(`OB-157: Ask rescue deadline stays readable at ${viewport.width}px (${appearance})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: appearance, reducedMotion: 'reduce' })
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      await page.route('**/api/v1/discover?**', (route) =>
        route.fulfill({ json: { mode: 'demo', places: [pick], google_unavailable: false } }),
      )
      await page.route('**/api/v1/discover/ask', (route) =>
        route.fulfill({
          json: {
            intent: {
              summary: '',
              keywords: ['croissant'],
              category: '',
              max_price: null,
              halal: false,
              vegetarian: false,
              locally_made: false,
              open_now: false,
              followups: [],
              sort: 'best',
              near: '',
              deals: false,
            },
            mode: 'keywords',
            groups: [{ id: 'best', places: [pick] }],
            anchor: null,
          },
        }),
      )
      await page.addInitScript(
        ({ area, appearance }) => {
          localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
          localStorage.setItem('chalkboard.customer.journey', 'done')
        },
        { area, appearance },
      )
      await page.goto('/explore/')
      const ask = page.getByRole('search').getByRole('textbox')
      await expect(ask).toBeVisible({ timeout: 30_000 })
      await ask.fill('croissant')
      await ask.press('Enter')
      const row = page.locator('a[href="/explore/s/demo-ob157"]')
      const rescue = row.getByText(/until/i)
      await expect(rescue).toContainText('5:30')
      await page.evaluate(() => document.fonts.ready)
      // Text presence alone misses an ellipsis: check the actual rendered text fragments.
      const layout = await rescue.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const bounds = element.getBoundingClientRect()
        return {
          clipped: element.scrollWidth > element.clientWidth + 1,
          outside: Array.from(range.getClientRects()).some(
            (rect) =>
              rect.left < bounds.left - 1 ||
              rect.right > bounds.right + 1 ||
              rect.bottom > bounds.bottom + 1,
          ),
        }
      })
      expect(layout).toEqual({ clipped: false, outside: false })
      const metrics = await page.evaluate(measure, viewport.width < 600)
      expect(metrics.overflow).toEqual([])
      expect(metrics.targets).toEqual([])
      expect(metrics.overlap).toEqual([])
      // Check the actual primary action: the generic heuristic mistakes result links for it.
      const composer = await page.getByRole('search').boundingBox()
      expect(composer).not.toBeNull()
      expect(composer!.y).toBeGreaterThanOrEqual(viewport.height / 2)
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([])
      await test
        .info()
        .attach('heatmap', { body: JSON.stringify(metrics), contentType: 'application/json' })
      await page.screenshot({ path: test.info().outputPath('ask-rescue.png'), fullPage: true })
    })
  }
}
