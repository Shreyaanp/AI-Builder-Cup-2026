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
          location: 'Katong',
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

test('B27: the tile grid sizes to its content at 390, 600 and desktop widths', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await myShop(page)
  for (const [width, height] of [
    [390, 844],
    [600, 900],
    [1280, 1000],
  ]) {
    await page.setViewportSize({ width, height })
    const menu = page.getByRole('button', { name: /^Menu/ })
    await expect(menu).toBeVisible()
    const tiles = menu.locator('..')
    const report = await tiles.evaluate((grid) => {
      const textRight = (tile: Element) => {
        const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT)
        let right = 0
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rect of Array.from(range.getClientRects())) right = Math.max(right, rect.right)
        }
        // Bars count as content too (the Readiness progress).
        for (const bar of Array.from(tile.querySelectorAll('.MuiLinearProgress-root')))
          right = Math.max(right, bar.getBoundingClientRect().right)
        return right
      }
      const box = grid.getBoundingClientRect()
      const column = parseFloat(getComputedStyle(grid).gridTemplateColumns)
      return {
        overflow: grid.scrollWidth > grid.clientWidth + 1,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        tiles: Array.from(grid.children).map((tile) => {
          const rect = tile.getBoundingClientRect()
          const truncated = Array.from(tile.querySelectorAll('*')).filter(
            (node) =>
              node.scrollWidth > node.clientWidth + 1 &&
              getComputedStyle(node).overflow !== 'visible',
          ).length
          return {
            name: tile.textContent?.slice(0, 24),
            // How much of the tile's width its text actually uses.
            used: (textRight(tile) - rect.left) / rect.width,
            wide: rect.width > column * 1.5,
            truncated,
            // Every tile sits inside the grid.
            inside: rect.left >= box.left - 1 && rect.right <= box.right + 1,
          }
        }),
      }
    })
    expect(report.overflow, `${width}px overflows`).toBe(false)
    expect(report.columns).toBe(width === 390 ? 2 : width === 600 ? 2 : 4)
    for (const tile of report.tiles) {
      expect(tile.inside, `${tile.name} at ${width}px`).toBe(true)
      expect(tile.truncated, `${tile.name} truncated at ${width}px`).toBe(0)
      // A tile wider than one column must use that width; a one-column tile is the smallest
      // box there is, so only an almost-empty one fails.
      expect(tile.used, `${tile.name} is mostly empty at ${width}px`).toBeGreaterThan(
        tile.wide ? 0.65 : 0.45,
      )
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await axe(page)
})
