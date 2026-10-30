import { expect, test, type Locator, type Page } from '@playwright/test'

// Customer phone polish (29 Oct): OB-71 (#381), OB-148 (#456), OB-104 (#404), OB-145 (#453), OB-215 (#576), OB-216 (#577).
// Each check runs at the three phone widths.
const WIDTHS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]

test.beforeEach(({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone widths are set per test')
  return page.context().setExtraHTTPHeaders({ 'x-test-rate-limit-bypass': '1' })
})

async function customer(
  page: Page,
  size: { width: number; height: number },
  options: { appearance?: 'light' | 'dark'; place?: { lat: number; lng: number; label: string } },
) {
  await page.setViewportSize(size)
  await page.addInitScript(
    ({ appearance, place }) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
      localStorage.setItem('chalkboard.customer.journey', 'done')
      // Seeds the first visit only: a test that moves the area keeps it across a reload.
      if (place && !localStorage.getItem('chalkboard.discover.filters'))
        localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place }))
    },
    { appearance: options.appearance ?? 'light', place: options.place ?? null },
  )
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
}

async function profileSheet(page: Page) {
  await page.getByRole('button', { name: 'Profile and preferences' }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: 'Your profile' })).toBeVisible()
  return sheet
}

/** Left edges of a row's icon and of its words. */
const edges = (row: Locator) =>
  row.evaluate((el) => {
    const icon = el.querySelector('svg')!.getBoundingClientRect().left
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    range.selectNodeContents(walker.nextNode()!)
    return { icon, text: range.getBoundingClientRect().left }
  })

/** How far a colour is from grey (0-255): the dark streak card must not be a loud fill. */
const chroma = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number)
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!)
}

for (const size of WIDTHS) {
  test(`OB-71 (#381): ${size.width}px owner Help rows share one edge and say what they replay`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await page.addInitScript(() => sessionStorage.setItem('chalkboard.demo.welcome.v1', '1'))
    await page.goto('/demo?tab=you', { waitUntil: 'domcontentloaded' })
    const help = page.getByRole('region', { name: 'Help', exact: true })
    await expect(help).toBeVisible({ timeout: 30_000 })
    const intro = help.getByRole('button', { name: 'Replay the intro', exact: true })
    const rows = [intro, help.getByRole('button', { name: 'Take the tour', exact: true })]
    const first = await edges(rows[0]!)
    for (const row of rows) {
      await expect(row).toBeVisible()
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48)
      const edge = await edges(row)
      expect(edge.icon).toBeCloseTo(first.icon, 0)
      expect(edge.text).toBeCloseTo(first.text, 0)
    }
    await intro.click()
    await expect(page.getByRole('heading', { name: 'Talk. Your shop goes live.' })).toBeVisible()
  })

  test(`OB-71 (#381): ${size.width}px customer profile names the intro replay`, async ({
    page,
  }) => {
    await customer(page, size, {})
    await page.goto('/explore/saved', { waitUntil: 'domcontentloaded' })
    const sheet = await profileSheet(page)
    const help = sheet.getByRole('region', { name: 'Help', exact: true })
    await expect(help.getByRole('button', { name: 'Replay the intro', exact: true })).toBeVisible()
    await expect(sheet.getByText('See again', { exact: true })).toHaveCount(0)
  })

  test(`OB-148 (#456): ${size.width}px profile budget example uses the area's money`, async ({
    page,
  }) => {
    await customer(page, size, { place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } })
    await page.goto('/explore/saved', { waitUntil: 'domcontentloaded' })
    let sheet = await profileSheet(page)
    const example = sheet.getByText(/my budget is under/)
    await expect(example).toContainText('S$')
    await expect(example).not.toContainText('₹')
    // The same phone in Indiranagar: rupees.
    await page.evaluate(() =>
      localStorage.setItem(
        'chalkboard.discover.filters',
        JSON.stringify({ place: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' } }),
      ),
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    sheet = await profileSheet(page)
    await expect(sheet.getByText(/my budget is under/)).toContainText('₹')
    await expect(sheet.getByText(/my budget is under/)).not.toContainText('S$')
  })

  test(`OB-104 (#404): ${size.width}px board points read as this week's, not a level total`, async ({
    page,
  }) => {
    await customer(page, size, { place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } })
    await page.route('**/api/v1/customer/passport/board?*', (route) =>
      route.fulfill({
        json: {
          area: 'w21z6',
          week: '2026-W44',
          joined: false,
          you: null,
          rows: [
            {
              rank: 1,
              name: 'Mei L.',
              level: 'local_hero',
              points: 260,
              stamps: 9,
              demo: true,
              you: false,
            },
            {
              rank: 2,
              name: 'Arjun K.',
              level: 'regular',
              points: 230,
              stamps: 8,
              demo: true,
              you: false,
            },
          ],
        },
      }),
    )
    await page.goto('/explore/passport', { waitUntil: 'domcontentloaded' })
    const board = page.getByRole('region', { name: 'Regulars this week' })
    const row = board.getByRole('listitem').filter({ hasText: 'Arjun K.' })
    await row.scrollIntoViewIfNeeded()
    await expect(row.locator('[data-board-points]')).toHaveText('+230 points')
    await expect(row).toContainText('Regular')
    // The level is not printed right before the number ("Regular 230").
    await expect(row).not.toContainText(/Regular\s*\+?230/)
    for (const item of await board.getByRole('listitem').all()) {
      const box = (await item.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(size.width)
    }
  })

  test(`OB-145 (#453): ${size.width}px running streak card stays calm in dark`, async ({
    page,
  }) => {
    await page.route('**/api/v1/customer/passport?*', async (route) => {
      const response = await route.fetch()
      const view = await response.json()
      view.streak = { ...view.streak, weeks: 3 }
      await route.fulfill({ response, json: view })
    })
    for (const appearance of ['dark', 'light'] as const) {
      await customer(page, size, {
        appearance,
        place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' },
      })
      await page.goto('/explore/passport', { waitUntil: 'domcontentloaded' })
      const card = page.getByRole('region', { name: 'Weekly streak: 3' })
      await expect(card).toBeVisible({ timeout: 30_000 })
      const fill = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
      if (appearance === 'dark') expect(chroma(fill), fill).toBeLessThan(24)
      // Light keeps the soft coral card while a streak runs.
      else expect(fill).toBe('rgb(255, 218, 211)')
    }
  })

  test(`OB-216 (#577): ${size.width}px remembered budget chip shows the area's currency`, async ({
    page,
  }) => {
    await page.route('**/api/v1/customer/me', async (route) => {
      const response = await route.fetch()
      const me = await response.json()
      me.signed_in = true
      me.profile = {
        follows: [],
        searches: [],
        ...me.profile,
        preferences: { vegetarian: false, halal: false, budget: 100, language: '' },
      }
      await route.fulfill({ response, json: me })
    })
    await customer(page, size, { place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } })
    await page.goto('/explore/saved', { waitUntil: 'domcontentloaded' })
    const sheet = await profileSheet(page)
    await expect(sheet.getByText('Budget under S$100')).toBeVisible()
    await page.evaluate(() =>
      localStorage.setItem(
        'chalkboard.discover.filters',
        JSON.stringify({ place: { lat: 12.9784, lng: 77.6408, label: 'Indiranagar' } }),
      ),
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect((await profileSheet(page)).getByText('Budget under ₹100')).toBeVisible()
  })

  test(`OB-215 (#576): ${size.width}px Rescued card stays calm in dark`, async ({ page }) => {
    for (const appearance of ['dark', 'light'] as const) {
      await customer(page, size, {
        appearance,
        place: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' },
      })
      await page.goto('/explore/passport', { waitUntil: 'domcontentloaded' })
      const text = page.getByText('No rescues yet', { exact: false })
      await expect(text).toBeVisible({ timeout: 30_000 })
      const fill = await text.evaluate((el) => {
        let node: HTMLElement | null = el
        while (node && getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)')
          node = node.parentElement
        return getComputedStyle(node!).backgroundColor
      })
      if (appearance === 'dark') expect(chroma(fill), fill).toBeLessThan(24)
      else expect(fill).toBe('rgb(255, 218, 211)')
    }
  })
}
