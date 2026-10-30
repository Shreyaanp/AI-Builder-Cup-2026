import { expect, test, type Locator, type Page } from '@playwright/test'

// Mobile UX pass (20 Oct): small phone fixes found by walking the customer flow.
/** Left edge of the words themselves, not of the padded box around them. */
const textLeft = (locator: Locator) =>
  locator.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().left
  })

const WIDTHS = [360, 390, 412]

async function open(page: Page, width: number, path: string, language = 'en') {
  await page.setViewportSize({ width, height: 844 })
  await page.context().setExtraHTTPHeaders({ 'x-test-rate-limit-bypass': '1' })
  await page.addInitScript((lang) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: lang }))
    localStorage.setItem('chalkboard.customer.journey', 'done')
  }, language)
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

for (const width of WIDTHS) {
  test(`OB-139 (#447): ${width}px Saved and Chats text sits 16px from the edge`, async ({
    page,
  }) => {
    await open(page, width, '/explore/saved')
    for (const path of ['/explore/saved', '/explore/chats']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const title = page.getByRole('heading', { level: 1 })
      await expect(title).toBeVisible({ timeout: 30_000 })
      const empty = page.getByRole('heading', { level: 2 }).first()
      await expect(empty).toBeVisible({ timeout: 30_000 })
      expect(await textLeft(title), `${path} title`).toBeGreaterThanOrEqual(16)
      expect(await textLeft(empty), `${path} empty heading`).toBeGreaterThanOrEqual(16)
    }
  })

  test(`OB-140 (#448): ${width}px profile Replay the intro is as wide as Sign out`, async ({
    page,
  }) => {
    await open(page, width, '/explore/')
    await page.getByRole('button', { name: 'Profile and preferences' }).first().click()
    const sheet = page.getByRole('dialog')
    const signOut = await sheet.getByRole('button', { name: 'Sign out' }).boundingBox()
    const again = await sheet.getByRole('button', { name: 'Replay the intro' }).boundingBox()
    expect(Math.abs(again!.width - signOut!.width)).toBeLessThan(2)
  })
}

test('OB-141 (#449): 360px Hindi neighbourhood goal title stays on one line', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('**/api/v1/customer/passport?*', async (route) => {
    const response = await route.fetch()
    const view = await response.json()
    view.games = {
      ...view.games,
      coop: {
        area: 'demo',
        area_name: 'Tiong Bahru',
        week: '2026-W43',
        ends: '2026-10-25',
        goal: 500,
        total: 284,
        demo_visits: 200,
        you: 1,
        helped: true,
        helpers: 12,
        reached: false,
        claimed: false,
        bonus: 50,
        demo: true,
      },
    }
    await route.fulfill({ response, json: view })
  })
  await open(page, 360, '/explore/passport', 'hi')
  const title = page.getByRole('heading', { level: 2, name: 'मोहल्ले का लक्ष्य' })
  await expect(title).toBeVisible({ timeout: 30_000 })
  const box = await title.boundingBox()
  const line = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  expect(box!.height).toBeLessThan(line * 1.5)
})
