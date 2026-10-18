import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

// #118 #119 #120: on a phone the Shop tab scrolls clear of the fixed bottom bar, and a purchase
// order that omits total/backorders lists cleanly ("PO 2026-0042", never "PO PO-" or ₹NaN) and opens.
test.describe.configure({ timeout: 90_000 })

const order = {
  id: 'po-1',
  number: 'PO-2026-0042',
  version: 1,
  status: 'confirmed',
  sent: true,
  auto_sent: false,
  created: 1760000000,
  currency: 'INR',
  buyer: { id: 'b', name: 'Shop', system: 'json' },
  supplier: { id: 's', name: 'Fresh Farms', demo: false, system: 'json' },
  terms_days: 7,
  lines: [{ line: 1, item: 'Milk', quantity: 2, unit: 'l', price: 5000, total: 10000 }],
  need_by: '2026-10-20',
  delivery: '2026-10-20',
  reason: null,
  alternatives: [],
  checks: [],
  approval_required: false,
  blocked: false,
  documents: [],
  received: false,
  simulated: false,
}

for (const width of [360, 390]) {
  test(`bottom tiles clear the nav and orders never show NaN at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await localOnly(page)
    await page.route('**/supply', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { suppliers: [], orders: [order] } })
        : route.fallback(),
    )
    await enter(page)
    await seedShop(page)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    // The Shop screen loads on demand: wait for its sections before measuring.
    await page.locator('main section, main [role="region"]').last().waitFor()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox()
    const last = await page.locator('main section, main [role="region"]').last().boundingBox()
    expect(nav).not.toBeNull()
    expect(last).not.toBeNull()
    expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y)

    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    const row = page.getByRole('button', { name: /Fresh Farms/ })
    await expect(row).toContainText('PO 2026-0042')
    await expect(row).not.toContainText('PO PO-')
    await expect(row).not.toContainText('NaN')
    await row.click()
    await expect(page.getByText('Fresh Farms').first()).toBeVisible()
    await expect(page.getByText('Milk').first()).toBeVisible()
  })
}
