import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

test.describe.configure({ timeout: 120_000 })

async function expectDesktopLayout(page: Page, content: LocatorTarget) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0)
  const width = await content.evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeLessThanOrEqual(720)
}

type LocatorTarget = ReturnType<Page['locator']>

test('owner Today, Shop, Supply, Grow and You fit a 1280px desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await localOnly(page)
  await enter(page)
  await seedShop(page)

  const main = page.locator('main#main')
  await expect(main).toBeVisible()
  // Today / coach reading column.
  await expectDesktopLayout(page, main.locator('section[aria-label="Today"], section').first())

  for (const tab of ['Shop', 'Grow', 'You']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    const section = main.locator(`section[aria-label="${tab}"]`).first()
    await expect(section).toBeVisible()
    await expectDesktopLayout(page, section)
  }

  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.locator('[data-tour="supply"]').click()
  const supply = page.getByRole('dialog')
  await expect(supply).toBeVisible()
  await expectDesktopLayout(page, supply)

  await page.keyboard.press('Escape')
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  for (const tab of ['Coach', 'Shop', 'Grow', 'You']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    const section = page.locator(`main#main section[aria-label="${tab}"]`).first()
    await expect(section).toBeVisible()
    await expectDesktopLayout(page, section)
  }

  // The changed caps are above phone width. Compare each changed owner screen at 390px
  // against the prior 760px cap while keeping the same rendered state.
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 800 })
  for (const [tab, section] of [
    ['Today', 'Coach'],
    ['Shop', 'Shop'],
    ['Grow', 'Grow'],
  ]) {
    await page.getByRole('button', { name: tab === 'Today' ? 'Coach' : tab, exact: true }).click()
    if (tab === 'Grow') await expect(page.getByTestId('grow-tiles')).toBeVisible()
    await page.waitForTimeout(1500)
    const beforeWidth = await page
      .locator(`main#main section[aria-label="${section}"]`)
      .evaluate((element) => element.getBoundingClientRect().width)
    const current = await page.screenshot({
      path: info.outputPath(`${tab}-390-current.png`),
      animations: 'disabled',
      caret: 'hide',
    })
    await info.attach(`${tab}-390-current`, { body: current, contentType: 'image/png' })
    const phoneBaseline = await page.addStyleTag({
      content: `main#main section[aria-label="${section}"] { max-width: 760px !important; }`,
    })
    const previous = await page.screenshot({
      path: info.outputPath(`${tab}-390-prior-cap.png`),
      animations: 'disabled',
      caret: 'hide',
    })
    await info.attach(`${tab}-390-prior-cap`, { body: previous, contentType: 'image/png' })
    const afterWidth = await page
      .locator(`main#main section[aria-label="${section}"]`)
      .evaluate((element) => element.getBoundingClientRect().width)
    expect(afterWidth).toBe(beforeWidth)
    await phoneBaseline.evaluate((style) => (style as Element).remove())
  }
  await page.getByRole('button', { name: 'You', exact: true }).click()
  const you = await page.screenshot({
    path: info.outputPath('You-390-current.png'),
    animations: 'disabled',
    caret: 'hide',
  })
  await info.attach('You-390-current', { body: you, contentType: 'image/png' })
  const youPrior = await page.screenshot({
    path: info.outputPath('You-390-prior-cap.png'),
    animations: 'disabled',
    caret: 'hide',
  })
  await info.attach('You-390-prior-cap', { body: youPrior, contentType: 'image/png' })

  await page.setViewportSize({ width: 1440, height: 900 })
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    for (const tab of ['Coach', 'Shop', 'Grow', 'You']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      const section = page.locator(`main#main section[aria-label="${tab}"]`).first()
      await expect(section).toBeVisible()
      await expectDesktopLayout(page, section)
    }
  }
})

test('customer Ask, results, Browse, shop and Passport stay inside a 720px column', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await localOnly(page)
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } }),
    )
  })
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: [], google_unavailable: true } }),
  )
  await page.route('**/api/v1/discover/ask', (route) =>
    route.fulfill({
      json: {
        intent: {
          summary: '',
          keywords: ['coffee'],
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
        groups: [],
        anchor: null,
      },
    }),
  )
  await page.route('**/api/v1/public/shops/*', (route) =>
    route.fulfill({
      json: {
        id: 'demo-shop-1',
        name: 'Corner Cup',
        category: 'cafe',
        location: 'Tiong Bahru',
        hours: '08:00–17:00',
        phone: '',
        currency: 'SGD',
        products: [{ name: 'Flat white', price: 450, unit: 'cup', available: true }],
        demo: true,
      },
    }),
  )
  await page.goto('/explore/')
  const ask = page.getByRole('main').first()
  await expect(ask).toBeVisible()
  await expectDesktopLayout(page, ask.locator(':scope > div').first())
  const input = page.getByRole('search').getByRole('textbox')
  await input.fill('coffee')
  const result = page.waitForResponse('**/api/v1/discover/ask')
  await input.press('Enter')
  await result
  await expectDesktopLayout(page, page.getByRole('main').first().locator(':scope > div').first())

  await page.goto('/explore/browse')
  await expect(page.getByRole('heading').first()).toBeVisible()
  await expectDesktopLayout(page, page.getByRole('main').first())
  await page.goto('/explore/s/demo-shop-1')
  await expect(page.getByRole('heading', { name: 'Corner Cup' })).toBeVisible()
  await expectDesktopLayout(page, page.getByRole('main').first())
  await page.goto('/explore/passport')
  await expect(page.getByRole('main').first()).toBeVisible()
  await expectDesktopLayout(page, page.getByRole('main').first())
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0)

  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/explore/')
  await expectDesktopLayout(page, page.getByRole('main').first().locator(':scope > div').first())
  const lightSearch = page.getByRole('search').getByRole('textbox')
  await lightSearch.fill('coffee')
  const lightResult = page.waitForResponse('**/api/v1/discover/ask')
  await lightSearch.press('Enter')
  await lightResult
  await expectDesktopLayout(page, page.getByRole('main').first().locator(':scope > div').first())
  await page.goto('/explore/browse')
  await expectDesktopLayout(page, page.getByRole('main').first())
  await page.goto('/explore/s/demo-shop-1')
  await expectDesktopLayout(page, page.getByRole('main').first())
  await page.goto('/explore/passport')
  await expectDesktopLayout(page, page.getByRole('main').first())

  await page.setViewportSize({ width: 1440, height: 900 })
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/explore/')
    await expectDesktopLayout(page, page.getByRole('main').first().locator(':scope > div').first())
    const search = page.getByRole('search').getByRole('textbox')
    await search.fill('coffee')
    const nextResult = page.waitForResponse('**/api/v1/discover/ask')
    await search.press('Enter')
    await nextResult
    await expectDesktopLayout(page, page.getByRole('main').first().locator(':scope > div').first())
    await page.goto('/explore/browse')
    await expectDesktopLayout(page, page.getByRole('main').first())
    await page.goto('/explore/s/demo-shop-1')
    await expect(page.getByRole('heading', { name: 'Corner Cup' })).toBeVisible()
    await expectDesktopLayout(page, page.getByRole('main').first())
    await page.goto('/explore/passport')
    await expectDesktopLayout(page, page.getByRole('main').first())
  }
})
