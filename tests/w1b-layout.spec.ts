import { expect, test, type Page } from '@playwright/test'

// Wave 1b layout fixes, one regression test per owner bug (OB id in each name).
test.setTimeout(120_000)

const PHONES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]
const SHOP = 'demo-story-bengaluru-chai'

async function quiet(page: Page, size: { width: number; height: number }, theme = 'light') {
  await page.setViewportSize(size)
  // The demo start is rate limited per address; every test gets its own.
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `w1b-${Math.random()}` })
  await page.addInitScript((appearance) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
    localStorage.setItem('chalkboard.customer.journey', 'done')
  }, theme)
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}

for (const size of PHONES) {
  test.describe(`${size.width}px`, () => {
    test.beforeEach(() => test.skip(test.info().project.name !== 'phone', 'phone project only'))

    test('OB-80 the tour card keeps Skip, Back and Next on one row at every step', async ({
      page,
    }) => {
      await quiet(page, size)
      await page.goto('/demo')
      await expect(page.getByText('Demo shop – nothing here is real', { exact: true })).toBeVisible(
        { timeout: 30_000 },
      )
      await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()
      const card = page.getByTestId('tour-card')
      const shots = process.env.TOUR_SHOTS
      for (let step = 1; step <= 7; step++) {
        await expect(card.getByText(`${step} of 7`)).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(800)
        const rows = await card.evaluate((root) => {
          const find = (name: RegExp) => {
            const b = Array.from(root.querySelectorAll('button')).find((x) =>
              name.test(x.getAttribute('aria-label') ?? x.textContent ?? ''),
            )
            const r = b?.getBoundingClientRect()
            return r ? { top: Math.round(r.top), height: Math.round(r.height) } : null
          }
          const c = root.getBoundingClientRect()
          return {
            skip: find(/^Skip/),
            next: find(/^Next|^Done|^Finish/),
            close: find(/^Close/),
            card: { left: c.left, right: c.right, bottom: c.bottom },
          }
        })
        expect(rows.skip, `step ${step}: Skip`).not.toBeNull()
        expect(rows.next, `step ${step}: Next`).not.toBeNull()
        expect(
          Math.abs(rows.skip!.top - rows.next!.top),
          `step ${step}: one row`,
        ).toBeLessThanOrEqual(4)
        expect(rows.close!.height).toBeGreaterThanOrEqual(48)
        expect(rows.card.left).toBeGreaterThanOrEqual(0)
        expect(rows.card.right).toBeLessThanOrEqual(size.width)
        expect(rows.card.bottom).toBeLessThanOrEqual(size.height)
        await noSideScroll(page)
        if (shots) await page.screenshot({ path: `${shots}/${size.width}-step${step}.png` })
        if (step < 7) await card.getByRole('button', { name: 'Next' }).click()
      }
    })

    test('OB-117 a long shop name stays on one line in the owner header', async ({ page }) => {
      await quiet(page, size)
      await page.addInitScript(() => sessionStorage.setItem('chalkboard.demo.welcome.v1', '1'))
      await page.goto('/demo')
      await page.getByRole('navigation', { name: 'Main' }).first().waitFor({ timeout: 30_000 })
      const name = page.locator('header button[aria-haspopup="menu"]').first()
      await name.evaluate((el) => {
        el.querySelector('span')!.textContent = 'Courtyard Chai - Bengaluru (a very long shop name)'
      })
      const { height, wrap } = await name.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        wrap: getComputedStyle(el.querySelector('span')!).whiteSpace,
      }))
      expect(wrap).toBe('nowrap')
      expect(height).toBeLessThanOrEqual(56)
    })

    test('OB-124 customer demo Browse: one title row and compact shop cards', async ({ page }) => {
      await quiet(page, size)
      await page.goto('/explore/demo')
      const title = page.getByRole('heading', { level: 1 })
      await expect(title).toBeVisible({ timeout: 30_000 })
      const cards = page.locator('main button[aria-label], main a[aria-label]').filter({
        has: page.locator('img, svg, .MuiSkeleton-root'),
      })
      await expect(cards.first()).toBeVisible({ timeout: 30_000 })
      const language = page.getByRole('button', { name: /language/i }).first()
      const tb = (await title.boundingBox())!
      const lb = (await language.boundingBox())!
      expect(Math.abs(lb.y + lb.height / 2 - (tb.y + tb.height / 2))).toBeLessThanOrEqual(28)
      expect((await cards.first().boundingBox())!.height, 'a card is a row').toBeLessThanOrEqual(
        150,
      )
      await noSideScroll(page)
    })

    test('OB-125 no decorative shapes behind the landing headline', async ({ page }) => {
      await quiet(page, size)
      await page.goto('/?app=landing')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      const shown = await page
        .locator('.l2-blob')
        .evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length)
      expect(shown).toBe(0)
    })

    test('OB-99 Passport: Reveal clears the bottom nav, streak title is one line', async ({
      page,
    }) => {
      await quiet(page, size)
      await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
      // A stamp needs a pin at the shop; hand the page a waiting scratch card instead.
      await page.route(/\/api\/v1\/customer\/passport\?/, async (route) => {
        const response = await route.fetch()
        const view = await response.json()
        view.games = {
          ...view.games,
          scratch: [
            {
              id: 'ob99',
              shop_id: SHOP,
              shop_name: 'Corner Cup',
              demo: true,
              first: true,
              revealed: false,
              points: 0,
              perk_text: '',
              odds: [{ prize: 'points_10', percent: 100 }],
            },
          ],
        }
        await route.fulfill({ response, json: view })
      })
      await page.goto('/explore/passport')
      const reveal = page.getByText('Reveal', { exact: true })
      await expect(reveal).toBeVisible({ timeout: 20_000 })
      const nav = (await page.getByRole('navigation', { name: 'Main' }).first().boundingBox())!
      const rb = (await reveal.boundingBox())!
      expect(rb.y + rb.height, 'Reveal above the nav').toBeLessThanOrEqual(nav.y)
      const odds = (await page.getByRole('button', { name: /odds/i }).first().boundingBox())!
      expect(odds.y + odds.height, 'odds above the nav').toBeLessThanOrEqual(nav.y)
      const streak = page.getByRole('heading', { name: /streak/i, level: 2 }).first()
      const lines = await streak.evaluate(
        (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
      )
      expect(lines, 'streak title lines').toBeLessThan(1.5)
    })

    test('OB-102 empty Saved: icon tile and title centred on the page', async ({ page }) => {
      await quiet(page, size)
      await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
      await page.goto('/explore/saved')
      const title = page.getByRole('heading', { level: 2 }).first()
      await expect(title).toBeVisible({ timeout: 20_000 })
      const box = (await page.locator('main svg').first().boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(3)
      const tb = (await title.boundingBox())!
      expect(Math.abs(tb.x + tb.width / 2 - size.width / 2)).toBeLessThanOrEqual(3)
    })
  })
}

test('OB-101 the customer header lines up with the 720 px column at 1280', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop project only')
  await quiet(page, { width: 1280, height: 800 })
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
  await page.goto('/explore/passport')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  const main = (await page.locator('main').first().boundingBox())!
  const logo = (await page.locator('header a[href="/explore/"]').first().boundingBox())!
  expect(Math.abs(logo.x - main.x)).toBeLessThanOrEqual(24)
  const last = (await page.locator('header button').last().boundingBox())!
  expect(Math.abs(last.x + last.width - (main.x + main.width))).toBeLessThanOrEqual(24)
})
