import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

// Simplify batch 4a (owner app, SIMPLIFY-owner.md §3.11, §7): Grow opens on a short list of rows
// and a More tools grid of named tools. Rows that hold more than one tool open on the same screen
// to each tool under its own name, so every former Grow tool is at most 2 taps from the tab. No
// tool lost its screen, and the old deep links still open. The merges themselves are batch 4b.

test.setTimeout(150_000)

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `simplify-grow-${info.testId}-${Math.random()}`,
  })
})

// Grow puts Close the day first after 17:00; measure at 10:00 shop time (the last one past: a
// clock ahead of the server makes the demo session look expired).
function morning() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  const today = new Date(`${day}T10:00:00+08:00`)
  return today.getTime() <= Date.now() ? today : new Date(today.getTime() - 24 * 3600_000)
}

async function openDemo(page: Page, width = 390, height = 844) {
  await page.setViewportSize({ width, height })
  await page.clock.setFixedTime(morning())
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Skip', exact: true })
    .click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

const grow = (page: Page) => page.locator('section[aria-label="Grow"]')

async function openGrow(page: Page) {
  await page.locator('[data-tour="nav-grow"]').click()
  await expect(page.locator('[data-tour="nav-grow"]')).toHaveAttribute('aria-current', 'page')
  // Rows settle once the brief, the forecast and the week have loaded.
  await expect(grow(page).getByRole('button', { name: /^Morning brief/ })).toBeVisible({
    timeout: 15_000,
  })
  await expect(grow(page).getByRole('button', { name: /^My sales/ })).toBeVisible({
    timeout: 15_000,
  })
  await expect(
    grow(page).getByRole('button', { name: /^How much to make.*Prep plan/ }),
  ).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
}

/** What Grow shows in the first screenful (no top bar, no tab bar). */
function firstView(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('section[aria-label="Grow"]')!
    const nav = document.querySelector('[data-tour="nav-grow"]')!.getBoundingClientRect().top
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect()
      return (
        box.width > 1 &&
        box.height > 1 &&
        box.top < nav &&
        box.bottom > 0 &&
        (el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
    }
    const tappable = Array.from(
      root.querySelectorAll('button,a[href],[role="button"],[role="switch"],input,select'),
    ).filter(shown)
    let words = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (!el || el.closest('svg') || !shown(el)) continue
      words += (node.textContent ?? '').split(/\s+/).filter(Boolean).length
    }
    const rows = Array.from(
      root.querySelectorAll('[data-testid="grow-tiles"] > :not([hidden])'),
    ).filter(shown)
    const tools = Array.from(
      root.querySelectorAll('[data-testid="grow-more-tools"] button'),
    ).filter(shown)
    const sizes = new Set<string>()
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (!shown(el)) continue
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()))
        continue
      sizes.add(getComputedStyle(el).fontSize)
    }
    const top = root.getBoundingClientRect().top + scrollY
    return {
      tappable: tappable.length,
      words,
      rows: rows.length,
      tools: tools.map((el) => el.textContent ?? ''),
      sizes: [...sizes],
      carousel: Array.from(root.querySelectorAll('[aria-roledescription="carousel"]')).filter(shown)
        .length,
      // Screenfuls of the Grow content, between its top and the tab bar.
      screens: (root.getBoundingClientRect().bottom + scrollY - top) / (nav - top),
    }
  })
}

test('Grow: a short list and a More tools grid, calm at 390 and about one screenful at 360', async ({
  page,
}) => {
  await openDemo(page)
  await openGrow(page)
  const view = await firstView(page)
  expect(view.rows, 'rows in the first view').toBeLessThanOrEqual(6)
  expect(view.tools.length, 'named tools in More tools').toBeGreaterThanOrEqual(4)
  expect(view.tools.length, 'named tools in More tools').toBeLessThanOrEqual(5)
  for (const tool of view.tools) expect(tool.trim().length).toBeGreaterThan(0)
  expect(view.tappable, 'tappable in the first view').toBeLessThanOrEqual(15)
  expect(view.words, 'words in the first view').toBeLessThanOrEqual(70)
  expect(view.carousel, 'no carousel in the first view').toBe(0)
  expect(view.sizes.length, `text sizes ${view.sizes.join(', ')}`).toBeLessThanOrEqual(3)
  await expect(page.getByTestId('grow-more-tools').getByRole('heading')).toHaveText('More tools')
  // Every grouped tool still shows its own name on the first screen, on its row.
  for (const name of [
    'Prep plan',
    'Plan tomorrow',
    'Orders',
    'Purchase orders',
    'Supply chain',
    'Your week',
    'Weekly recap',
  ])
    await expect(grow(page).getByTestId('grow-tiles')).toContainText(name)
  await page.screenshot({ path: test.info().outputPath('grow-390.png') })

  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(500)
  const small = await firstView(page)
  expect(small.screens, 'screenfuls at 360').toBeLessThanOrEqual(1.3)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'no sideways scroll at 360',
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath('grow-360.png'), fullPage: true })
})

// Every tool Grow had before this batch, and the row that holds it (none: it is a row or a More
// tools icon of its own). Get on Google is not in the demo; the local test below opens it.
const FORMER: [tool: string, row: string | null][] = [
  ['Morning brief', null],
  ['Prep plan', 'How much to make'],
  ['Plan tomorrow', 'How much to make'],
  ['Close the day', null],
  ['Orders', 'Buy stock'],
  ['Purchase orders', 'Buy stock'],
  ['Supply chain', 'Buy stock'],
  ['Your week', 'My sales'],
  ['Weekly recap', 'My sales'],
  ['Rescue deals', null],
  ['Asked nearby', null],
  ['Payments & rides', null],
  ['Stamps & perks', null],
]

async function closeAll(page: Page) {
  await page.keyboard.press('Escape')
  const back = page.getByRole('button', { name: 'Back', exact: true }).first()
  if (await back.isVisible()) await back.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('Grow: every former Grow tool opens within 2 taps of the tab', async ({ page }) => {
  await openDemo(page)
  for (const [tool, row] of FORMER) {
    await openGrow(page)
    let taps = 0
    if (row) {
      const group = grow(page).getByRole('button', { name: new RegExp(`^${row}`) })
      await expect(group).toHaveAttribute('aria-expanded', 'false')
      await group.click()
      taps += 1
    }
    const entry = grow(page)
      .getByRole('button', { name: new RegExp(`^${tool.replace(/[&]/g, '\\$&')}`) })
      .filter({ visible: true })
      .first()
    await entry.click()
    taps += 1
    expect(taps, `${tool}: taps from Grow`).toBeLessThanOrEqual(2)
    if (tool === 'Morning brief') {
      // The brief opens in place: its slides, no hide button (the row holds it).
      await expect(grow(page).locator('[aria-roledescription="carousel"]')).toBeVisible()
      await expect(grow(page).getByRole('heading', { name: 'Prep today' })).toBeVisible()
      await entry.click()
      continue
    }
    await expect(
      page
        .getByRole('dialog')
        .or(page.getByRole('button', { name: 'Back', exact: true }))
        .first(),
      `${tool} opens its own screen`,
    ).toBeVisible({ timeout: 15_000 })
    await closeAll(page)
    if (row)
      await grow(page)
        .getByRole('button', { name: new RegExp(`^${row}`) })
        .click()
  }
})

test('Grow: the Morning brief row opens the brief, and its best action still works', async ({
  page,
}) => {
  await openDemo(page)
  await openGrow(page)
  const row = grow(page).getByRole('button', { name: /^Morning brief/ })
  await expect(row).toContainText('Prep today · Running low')
  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  const brief = grow(page).locator('[aria-roledescription="carousel"]')
  await expect(brief.getByRole('button', { name: 'Hide for today' })).toHaveCount(0)
  await expect(brief.getByRole('group', { name: /Slide 1/ })).toContainText(/\d/)
})

test('Grow (local shop): Get on Google is a row; old deep links still open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.keyboard.press('Escape')
  await page.locator('[data-tour="nav-grow"]').click()
  const google = page.getByRole('button', { name: /^Get on Google/ })
  await expect(google).toBeVisible()
  const view = await firstView(page)
  expect(view.rows, 'rows with Get on Google').toBeLessThanOrEqual(6)
  await google.click()
  await expect(page).toHaveURL(/tab=google/)
  await expect(page.getByRole('heading', { name: 'Get on Google' })).toBeVisible()

  // ?tab=google and ?feature=payments open their screens straight from the address.
  for (const [address, heading] of [
    ['/?tab=google', 'Get on Google'],
    ['/?tab=grow&feature=payments', 'Payments & rides'],
  ] as const) {
    await page.goto(address)
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
      timeout: 15_000,
    })
  }
})
