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
    // Finite animations only: a focused button's focus ripple pulses forever.
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
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

const omit = (item: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(item).filter(([name]) => name !== key))

async function openMenu(page: Page) {
  await page.getByRole('button', { name: /^Menu/ }).tap()
  const sheet = page.getByRole('dialog', { name: 'Menu' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('B28: every item lands in a category; sections are grids of 2 per row with sold-out marked', async ({
  page,
}) => {
  await enter(page)
  await seedShop(page)
  await myShop(page)
  const sheet = await openMenu(page)
  await expect(sheet.getByText('Uncategorised')).toHaveCount(0)
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveText(['Drinks', 'Food', 'Desserts'])
  const food = sheet.getByRole('region', { name: 'Food' })
  const cards = food.getByRole('listitem')
  await expect(cards).toHaveCount(3)
  const [a, b, c] = await Promise.all(
    [0, 1, 2].map(async (i) => (await cards.nth(i).boundingBox())!),
  )
  // Two per row on a phone, the third on the next row; names and prices fit.
  expect(Math.abs(a.y - b.y)).toBeLessThan(1)
  expect(c.y).toBeGreaterThan(a.y + a.height - 1)
  expect(b.x).toBeGreaterThan(a.x + a.width - 1)
  const eggs = cards.filter({ hasText: 'Soft-boiled eggs' })
  await expect(eggs.getByText('Sold out', { exact: true })).toBeVisible()
  await expect(cards.filter({ hasText: 'Kaya toast' })).toContainText('$2.50')
  await axe(page)
})

test('B28: Sort my menu turns uncategorised items into a reviewed proposal', async ({ page }) => {
  await enter(page)
  const id = await seedShop(page)
  // Simulate a menu saved before categories existed: the inventory comes back without them
  // until the owner confirms the sort.
  let legacy = true
  await page.route(`**/api/v1/businesses/${id}/inventory`, async (route) => {
    const response = await route.fetch()
    const items = await response.json()
    await route.fulfill({
      response,
      json: legacy ? items.map((item: Record<string, unknown>) => omit(item, 'category')) : items,
    })
  })
  let sorted = 0
  await page.route(`**/api/v1/businesses/${id}/sort-menu`, async (route) => {
    sorted += 1
    // The real endpoint's answer for this menu: one sealed inventory proposal.
    const items = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
    const shops = await (await page.request.get('/api/v1/businesses')).json()
    const proposal = await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'inventory',
        business_id: id,
        revision: shops[0].revision,
        products: items.map((item: Record<string, unknown>) => omit(item, 'id')),
      },
    })
    await route.fulfill({ json: await proposal.json() })
  })
  await myShop(page)
  const sheet = await openMenu(page)
  await expect(sheet.getByText('7 items have no category yet.')).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Uncategorised' })).toBeVisible()
  await axe(page)
  await sheet.getByRole('button', { name: 'Sort my menu' }).tap()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible()
  expect(sorted).toBe(1)
  // Nothing is saved until the owner confirms.
  legacy = false
  await review.getByRole('button', { name: 'Confirm and save' }).tap()
  await expect(review).toBeHidden()
  const again = await openMenu(page)
  await expect(again.getByText(/have no category yet/)).toHaveCount(0)
  await expect(again.getByRole('heading', { name: 'Drinks' })).toBeVisible()
})

test('B28: tap a price to change it in place; Enter prepares it, one tap saves, Esc cancels', async ({
  page,
}) => {
  await enter(page)
  const id = await seedShop(page)
  await myShop(page)
  const sheet = await openMenu(page)
  await sheet.getByRole('button', { name: 'Edit price: Kopi, $1.80' }).tap()
  const field = sheet.getByRole('textbox', { name: 'Edit price: Kopi' })
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute('inputmode', 'decimal')
  await field.fill('2.2')
  await field.press('Enter')
  // Prepared, not saved: the owner confirms the exact change with one tap.
  const save = sheet.getByRole('button', { name: 'Save $2.20' })
  await expect(save).toBeVisible()
  const kopi = async () =>
    (await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()).find(
      (item: { name: string }) => item.name === 'Kopi',
    )
  expect((await kopi()).price).toBe(180)
  await axe(page)
  await save.tap()
  await expect(sheet.getByRole('button', { name: 'Edit price: Kopi, $2.20' })).toBeVisible()
  expect((await kopi()).price).toBe(220)
  expect((await kopi()).category).toBe('drinks')
  // Esc cancels the edit and keeps the sheet open; nothing is prepared.
  await sheet.getByRole('button', { name: 'Edit price: Teh tarik, $2.00' }).tap()
  const teh = sheet.getByRole('textbox', { name: 'Edit price: Teh tarik' })
  await teh.fill('9')
  await teh.press('Escape')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Edit price: Teh tarik, $2.00' })).toBeVisible()
  // A price that isn't a number stays in the field with a hint.
  await sheet.getByRole('button', { name: 'Edit price: Mee siam, $4.50' }).tap()
  const mee = sheet.getByRole('textbox', { name: 'Edit price: Mee siam' })
  await mee.fill('abc')
  await mee.press('Enter')
  await expect(sheet.getByText('Enter a price, e.g. 2.50')).toBeVisible()
  await expect(mee).toHaveAttribute('aria-invalid', 'true')
})

test('B28: units are a fixed dropdown; legacy units show until replaced, without duplicates', async ({
  page,
}) => {
  await enter(page)
  const id = await seedShop(page)
  await myShop(page)
  let sheet = await openMenu(page)
  // "pcs" is shown as the fixed unit it means.
  await expect(
    sheet
      .getByRole('listitem')
      .filter({ hasText: 'Kaya toast' })
      .getByText('piece', { exact: true }),
  ).toBeVisible()
  // Free text no unit matches stays exactly as saved.
  const kueh = sheet.getByRole('listitem').filter({ hasText: 'Kueh lapis' })
  await expect(kueh.getByText('tray', { exact: true })).toBeVisible()
  await kueh.getByRole('button', { name: 'Edit Kueh lapis' }).tap()
  const form = page.getByRole('dialog', { name: 'Edit' })
  const unit = form.getByRole('combobox', { name: 'Unit' })
  await expect(unit).toHaveText('tray (current)')
  await unit.tap()
  await expect(page.getByRole('option')).toHaveCount(20)
  await page.getByRole('option', { name: 'box', exact: true }).tap()
  await form.getByRole('button', { name: 'Review', exact: true }).tap()
  await page.getByRole('button', { name: 'Confirm and save' }).tap()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const items = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  expect(
    items
      .filter((item: { name: string }) => item.name === 'Kueh lapis')
      .map((item: { unit: string }) => item.unit),
  ).toEqual(['box'])
  sheet = await openMenu(page)
  await expect(
    sheet.getByRole('listitem').filter({ hasText: 'Kueh lapis' }).getByText('box', { exact: true }),
  ).toBeVisible()
  // A new item offers only the fixed list.
  await sheet.getByRole('button', { name: 'Add product' }).tap()
  await page.getByRole('combobox', { name: 'Unit' }).tap()
  await expect(page.getByRole('option')).toHaveCount(19)
})

test('B28: the menu sheet actions are one compact, aligned row on a phone', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await myShop(page)
  const sheet = await openMenu(page)
  const importButton = sheet.getByRole('button', {
    name: 'Import sales or menu (Excel, photo, notes)',
  })
  const add = sheet.getByRole('button', { name: 'Add product' })
  await expect(importButton).toHaveText('Import')
  const [a, b] = [(await importButton.boundingBox())!, (await add.boundingBox())!]
  expect(Math.abs(a.y - b.y)).toBeLessThan(1)
  expect(a.height).toBe(b.height)
  expect(a.height).toBeLessThanOrEqual(48)
  expect(b.x + b.width).toBeLessThanOrEqual(390)
  // Its choices open in the sheet, not in the action row.
  await importButton.tap()
  await expect(importButton).toHaveAttribute('aria-expanded', 'true')
  await expect(sheet.getByRole('button', { name: 'Upload file' })).toBeVisible()
  expect((await importButton.boundingBox())!.y).toBeCloseTo(a.y, 0)
  await axe(page)
})
