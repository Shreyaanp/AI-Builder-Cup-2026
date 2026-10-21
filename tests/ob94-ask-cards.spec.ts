import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
// OB-161 / OB-179: NodeNext needs .js to resolve the helper and infer its measured result.
import { measure } from './ux/measure.js'

const sizes = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
]

for (const appearance of ['light', 'dark'])
  for (const viewport of sizes)
    test(`OB-94: headline item stays visible with a rescue · ${viewport.width} · ${appearance}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.addInitScript((mode) => {
        localStorage.setItem('chalkboard.customer.journey', 'done')
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: mode }))
        localStorage.setItem(
          'chalkboard.discover.filters',
          JSON.stringify({ place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } }),
        )
      }, appearance)
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      const item = { name: 'Iced coffee', price: 300, unit: 'cup', available: true }
      const bakery = {
        id: 'ob94-bakery',
        name: 'Sunrise Bakehouse',
        source: 'chalkboard',
        category: 'Bakery',
        lat: 1.285,
        lng: 103.832,
        distance_m: 450,
        open_now: true,
        currency: 'SGD',
        items: [item],
        matched: [item],
        sold_out: [],
        demo_shop: true,
        deal: { item: 'Croissant', price: 133, was_price: 190, pickup_end: 2000000000, demo: true },
      }
      await page.route('**/api/v1/discover?**', (route) =>
        route.fulfill({ json: { mode: 'demo', places: [bakery], google_unavailable: false } }),
      )
      await page.route('**/api/v1/discover/ask', (route) =>
        route.fulfill({
          json: {
            intent: {
              summary: '',
              keywords: ['coffee'],
              category: 'coffee',
              max_price: null,
              halal: false,
              vegetarian: false,
              locally_made: false,
              open_now: false,
              followups: [],
              sort: 'price',
              near: '',
              deals: false,
            },
            mode: 'keywords',
            anchor: null,
            groups: [
              {
                id: 'best',
                places: [
                  {
                    ...bakery,
                    id: 'ob94-cafe',
                    name: 'Corner Cup',
                    deal: null,
                    matched: [{ ...item, name: 'Coffee', price: 200 }],
                  },
                  bakery,
                ],
              },
            ],
          },
        }),
      )
      await page.goto('/explore/')
      await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('cheapest coffee')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      const answer = page.getByRole('article', { name: 'cheapest coffee' })
      const card = answer.locator('a[href="/explore/s/ob94-bakery"]')
      await expect(card).toContainText('S$3.00')
      await expect(card.getByText('Iced coffee', { exact: true })).toBeVisible()
      await expect(card).toContainText('Croissant S$1.33')
      const links = answer.locator('a[href^="/explore/s/"]')
      await expect(links).toHaveCount(2)
      await expect(links.first()).toContainText('Corner Cup')
      await expect(links.first()).toContainText('S$2.00')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([])
      await card.scrollIntoViewIfNeeded()
      const heatmap = await page.evaluate(measure, viewport.width < 600)
      await testInfo.attach('heatmap', {
        body: JSON.stringify(heatmap, null, 2),
        contentType: 'application/json',
      })
      expect(heatmap.overflow).toEqual([])
      expect(heatmap.targets).toEqual([])
      expect(heatmap.overlap).toEqual([])
      expect(heatmap.primary).toEqual([])
      await page.screenshot({ path: testInfo.outputPath('ask-result.png') })
    })
