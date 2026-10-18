import { expect, test, type Page } from '@playwright/test'

// Last customer overlaps (#308-#313, #310): pinned bars never sit on content, no sideways scroll,
// the Tamil pre-order tag and placeholder read fully in Tamil, and the Passport offers a retry.
const SHOP = 'demo-shop-1'

// A bakery with pre-orders, stamps and a long menu, like the shop in the QA run.
async function mockShop(page: Page) {
  await page.route(`**/api/v1/public/shops/${SHOP}*`, (route) =>
    route.fulfill({
      json: {
        id: SHOP,
        name: 'Crumb & Courtyard Bakery (Demo)',
        category: 'bakery',
        location: 'Tiong Bahru',
        hours: '08:00 – 18:00',
        reward_text: 'Free pastry',
        stamps_needed: 10,
        currency: 'SGD',
        open_now: true,
        demo: true,
        products: Array.from({ length: 12 }, (_, i) => ({
          name: `Bake number ${i + 1}`,
          price: 400 + i * 50,
          unit: 'piece',
          available: true,
          category: 'Bakes',
        })),
        facts: { preorders: true, preorder_lead_time: '1 day ahead for whole cakes' },
      },
    }),
  )
}

async function prepare(page: Page, width: number, language = 'en') {
  await page.setViewportSize({ width, height: 800 })
  await page.addInitScript((lang) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: lang }))
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem('chalkboard.explainer.customer.v1', '1')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 1.2853, lng: 103.8318, label: 'Tiong Bahru' } }),
    )
  }, language)
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const width of [360, 390]) {
  test(`shop page: no sideways scroll, last content clear of the chat bar at ${width}px`, async ({
    page,
  }) => {
    await prepare(page, width)
    await mockShop(page)
    await page.goto(`/explore/s/${SHOP}`)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 })
    expect(await noSideScroll(page)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const bar = page.getByRole('button', { name: 'Chat with the shop' })
    const barTop = (await bar.boundingBox())!.y
    const footer = page.getByText(/Prepared by the shop owner/)
    const footerBottom = await footer.evaluate((el) => el.getBoundingClientRect().bottom)
    expect(footerBottom).toBeLessThanOrEqual(barTop)
  })
}

test('Tamil shop page: the pre-order tag is fully Tamil', async ({ page }) => {
  await prepare(page, 360, 'ta')
  await mockShop(page)
  await page.goto(`/explore/s/${SHOP}`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 })
  const tag = page.getByText(/^முன்பதிவு/)
  await expect(tag).toBeVisible()
  expect(await tag.innerText()).not.toMatch(/[A-Za-z]/)
  expect(await noSideScroll(page)).toBe(true)
})

test('Ask in Tamil: the placeholder keeps the price apart from Tamil words', async ({ page }) => {
  await prepare(page, 390, 'ta')
  await page.goto('/explore/')
  const box = page.getByRole('textbox').first()
  await expect(box).toBeVisible({ timeout: 30_000 })
  expect(await box.getAttribute('placeholder')).toMatch(/\d \S+ காபி/)
})

test('Browse: the Map view bar is solid and the last card ends above it', async ({ page }) => {
  await prepare(page, 390)
  await page.goto('/explore/browse')
  const cards = page.locator('main li')
  await expect(cards.first()).toBeVisible({ timeout: 30_000 })
  // The cards rise in one after another; measure once they have settled.
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const pill = page.getByRole('button', { name: 'Map view' })
  const bar = pill.locator('xpath=..')
  expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(
    /rgba\(.*, 0\)|transparent/,
  )
  const barTop = await bar.evaluate((el) => el.getBoundingClientRect().top)
  const last = await cards.last().evaluate((el) => el.getBoundingClientRect().bottom)
  expect(last).toBeLessThanOrEqual(barTop)
})

test('Ask results: the last suggestion chip ends above the composer', async ({ page }) => {
  await prepare(page, 390)
  await page.goto('/explore/')
  await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('chai near me')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Near the MRT?' })).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const chip = (await page.getByRole('button', { name: 'Near the MRT?' }).boundingBox())!
  const dock = (await page.getByTestId('customer-chat-dock').boundingBox())!
  expect(chip.y + chip.height).toBeLessThanOrEqual(dock.y)
})

test('Passport: a 429 shows a retry that works', async ({ page }) => {
  await prepare(page, 390)
  let calls = 0
  await page.route('**/api/v1/public/passport/preview*', (route) => {
    calls += 1
    return calls === 1
      ? route.fulfill({ status: 429, json: { detail: 'Too many requests' } })
      : route.fallback()
  })
  await page.goto('/explore/passport')
  await expect(page.getByText('Your passport couldn’t load.')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Your passport couldn’t load.')).toHaveCount(0)
  expect(calls).toBeGreaterThan(1)
})
