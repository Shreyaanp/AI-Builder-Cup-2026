import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// My shop bugs B26–B28 and the coach attach menu (B16), phone-first at 390×844.
test.skip(({ isMobile }) => !isMobile, 'phone-only regressions')
test.use({ viewport: { width: 390, height: 844 } })

async function enter(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

/**
 * A kopitiam menu with free-text units from before the unit list ("pcs", "tray") and one item
 * sold out. The server suggests each item's category, as it now does for every new item.
 */
async function seedShop(page: Page) {
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: {
          name: 'Katong Kopi',
          category: 'Kopitiam',
          location: '112 East Coast Road, Katong',
          hours: '7am–3pm',
        },
        products: [
          { name: 'Kopi', unit: 'cup', price: 180 },
          { name: 'Teh tarik', unit: 'cup', price: 200 },
          { name: 'Kaya toast', unit: 'pcs', price: 250 },
          { name: 'Soft-boiled eggs', unit: 'set', price: 220, available: false },
          { name: 'Mee siam', unit: 'plate', price: 450 },
          { name: 'Ondeh ondeh', unit: 'piece', price: 120 },
          { name: 'Kueh lapis', unit: 'tray', price: 1800 },
        ],
      },
    })
  ).json()
  const { business_id: id } = await (
    await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
  ).json()
  return id as string
}

async function axe(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations.map((v) => [v.id, v.nodes.map((n) => n.target)])).toEqual([])
}

async function myShop(page: Page) {
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Katong Kopi' })).toBeVisible()
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
}

test('B26: My shop starts with the tiles, no repeated shop name or Draft chip', async ({
  page,
}) => {
  await enter(page)
  await seedShop(page)
  await myShop(page)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Katong Kopi' })).toHaveCount(0)
  await expect(main.getByText('Draft', { exact: true })).toHaveCount(0)
  await expect(main.getByText('Check pending', { exact: true })).toHaveCount(0)
  // The first visible thing under the top bar is a card (the pending card or the first tile).
  const top = await page.getByRole('region', { name: 'My shop' }).evaluate((section) => {
    const visible = Array.from(section.querySelectorAll('*')).find((node) => {
      const box = node.getBoundingClientRect()
      return box.height > 0 && getComputedStyle(node).position !== 'absolute'
    })
    return visible!.getBoundingClientRect().top
  })
  expect(top).toBeLessThan(64 + 24)
  await expect(page.getByRole('button', { name: /^Shop details/ })).toBeInViewport()
  await axe(page)
})

test('B26: a pending check shows as a small status inside the Readiness tile', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await page.route('**/api/v1/businesses', async (route) => {
    const response = await route.fetch()
    const shops = await response.json()
    await route.fulfill({
      response,
      json: shops.map((shop: object) => ({ ...shop, registration: 'verification_pending' })),
    })
  })
  await myShop(page)
  const readiness = page.getByRole('button', { name: /^Readiness/ })
  await expect(readiness.getByText('Check pending', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByText('Check pending', { exact: true })).toHaveCount(1)
})
