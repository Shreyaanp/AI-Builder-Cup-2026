import { expect, test, type Page } from '@playwright/test'

// The customer front door is a one-thumb page (owner, 16 Oct: "comfortable, phone-first"): no
// sideways scroll, 48px targets, the composer above the keyboard, no layout shift, every
// language readable at 360px, and back returns to the opening page.
// A cold dev server can take a while to serve the first page.
test.describe.configure({ timeout: 90_000 })

const AREA = { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' }
const shops = ['Corner Cup', 'Sunrise Bakehouse', 'Lane 4 Street Kitchen'].map((name, i) => ({
  id: `demo-layout-${i}`,
  name,
  source: 'chalkboard',
  category: i === 1 ? 'bakery' : 'cafe',
  lat: AREA.lat + i * 0.001,
  lng: AREA.lng,
  distance_m: 150 + i * 100,
  open_now: true,
  currency: 'INR',
  demo: false,
  demo_shop: true,
  items: [
    { name: i === 1 ? 'Croissant' : 'Filter coffee', price: 6500, unit: '', available: true },
  ],
  sold_out: [],
}))

const answer = {
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
  groups: [{ id: 'best', places: [{ ...shops[0], matched: shops[0]!.items, reasons: [] }] }],
  anchor: null,
}

async function open(page: Page, { scheme = 'light', language = 'en' } = {}) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: shops, google_unavailable: false } }),
  )
  await page.route('**/api/v1/discover/suggest?**', (route) =>
    route.fulfill({
      json: {
        items: ['Filter coffee', 'Croissant'],
        shops: 3,
        open_now: 3,
        locally_made: 0,
        deals: 1,
      },
    }),
  )
  await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: answer }))
  await page.addInitScript(
    ([area, preferences]) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
      localStorage.setItem('niva.starter.preferences', JSON.stringify(preferences))
      // Layout shifts from the first paint on, for the CLS check.
      const w = window as unknown as { cls: number }
      w.cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number
          hadRecentInput: boolean
        }[])
          if (!entry.hadRecentInput) w.cls += entry.value
      }).observe({ type: 'layout-shift', buffered: true })
    },
    [AREA, { appearance: scheme, language }] as const,
  )
  await page.goto('/explore/', { timeout: 80_000 })
  await expect(composer(page)).toBeVisible({ timeout: 30_000 })
  // This area's shops as cards (named in the page's language).
  await expect(page.locator('section[aria-labelledby="ask-nearby"] ul a')).toHaveCount(3)
}

const composer = (page: Page) => page.getByRole('search').getByRole('textbox')

/** Visible interactive elements smaller than 48 x 48 (inline text links excepted). */
function smallTargets(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'main button, main a[href], main [role="button"], nav a[href], [role="search"] .MuiInputBase-root',
      ),
    )
      .filter((el) => {
        const box = el.getBoundingClientRect()
        if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') return false
        if (el.closest('[aria-hidden="true"]')) return false
        return box.width < 47.5 || box.height < 47.5
      })
      .map(
        (el) => `${el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim()}"`,
      ),
  )
}

const horizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

for (const scheme of ['light', 'dark'] as const)
  test(`front door layout (${scheme}): no sideways scroll, 48px targets, no shift, thumb-zone dock`, async ({
    page,
    isMobile,
  }) => {
    await open(page, { scheme })
    expect(await horizontalScroll(page)).toBe(false)
    expect(await smallTargets(page)).toEqual([])
    // Big suggestion chips sit in the page under the cards (#105, #123), reachable in the bottom of the screen.
    const chips = page.getByRole('list', { name: 'Ask about anything nearby' }).getByRole('button')
    expect(await chips.count()).toBeGreaterThanOrEqual(3)
    expect(await chips.count()).toBeLessThanOrEqual(4)
    // Measure where the chips land, not mid deal-in.
    await page
      .getByRole('list', { name: 'Ask about anything nearby' })
      .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
    const viewport = page.viewportSize()!
    const field = (await page.getByRole('search').boundingBox())!
    expect(field.y).toBeGreaterThan(viewport.height / 2)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    for (const chip of await chips.all()) {
      const box = (await chip.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(48)
      // Scrolled to, each chip is wholly on screen, in the lower half, and nothing covers it.
      expect(box.y).toBeGreaterThan(viewport.height / 2)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      const covered = await chip.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit !== null && !el.contains(hit)
      })
      expect(covered).toBe(false)
    }
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.01)
    if (!isMobile) {
      // Desktop: one centered column, not stretched.
      expect(field.width).toBeLessThanOrEqual(720)
      const left = field.x
      const right = viewport.width - field.x - field.width
      expect(Math.abs(left - right)).toBeLessThan(4)
    }
  })

test('the keyboard never covers the composer; the nav steps aside while typing', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone keyboard')
  await open(page)
  const { width, height } = page.viewportSize()!
  await composer(page).tap()
  await expect(page.locator('html')).toHaveAttribute('data-typing', '')
  await expect(page.getByRole('navigation', { name: /./ }).last()).toBeHidden()
  // An on-screen keyboard takes about 45% of the screen (resizes-content).
  const keyboardTop = Math.round(height * 0.55)
  await page.setViewportSize({ width, height: keyboardTop })
  await expect(composer(page)).toBeInViewport({ ratio: 1 })
  const box = (await page.getByRole('search').boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(keyboardTop)
  await composer(page).fill('coffee')
  await page.getByRole('button', { name: 'Send', exact: true }).tap()
  await page.setViewportSize({ width, height })
  await expect(page.locator('html')).not.toHaveAttribute('data-typing', '')
  await expect(page.getByRole('link').filter({ hasText: 'Corner Cup' }).first()).toBeVisible()
})

test('back from an answer returns to the opening page', async ({ page }) => {
  await open(page)
  await composer(page).fill('coffee')
  await composer(page).press('Enter')
  await expect(page.getByRole('button', { name: 'New conversation' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/explore\/$/)
  await expect(
    page.getByRole('heading', { name: 'What are you looking for nearby?' }),
  ).toBeVisible()
  await expect(page.getByRole('list', { name: 'Near you now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New conversation' })).toHaveCount(0)
  // "New conversation" lands in the same place, through the same history entry.
  await composer(page).fill('coffee')
  await composer(page).press('Enter')
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(page.getByRole('list', { name: 'Near you now' })).toBeVisible()
  await expect(composer(page)).toBeFocused()
})

test('reduced motion: the front door does not animate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  const animated = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('main *, [role="search"] *')).filter(
        (el) => getComputedStyle(el).animationName !== 'none',
      ).length,
  )
  expect(animated).toBe(0)
})

for (const language of ['ta', 'hi', 'ja'])
  test(`${language} at 360px: nothing cut off, nothing sideways`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'narrow phone')
    await page.setViewportSize({ width: 360, height: 800 })
    await open(page, { language })
    expect(await horizontalScroll(page)).toBe(false)
    expect(await smallTargets(page)).toEqual([])
    // Every label fits its own box: nav labels, chips, the heading and the composer.
    const overflowing = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          'nav a, nav a *, main h1, main h2, [data-chips] button, [role="search"] .MuiInputBase-root',
        ),
      )
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    )
    expect(overflowing).toEqual([])
    // The chips sit in the page, below the cards: scrolled to, none is hidden behind the dock or nav (#123).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const covered = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll<HTMLElement>('[data-chips] button'))
      return chips
        .filter((chip) => {
          const r = chip.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return hit !== null && !chip.contains(hit)
        })
        .map((chip) => chip.textContent)
    })
    expect(covered).toEqual([])
    // Nav labels never run into each other.
    const labels = await page
      .getByRole('navigation')
      .last()
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.getBoundingClientRect()))
    for (let i = 1; i < labels.length; i++)
      expect(labels[i]!.left).toBeGreaterThanOrEqual(labels[i - 1]!.right - 0.5)
  })
