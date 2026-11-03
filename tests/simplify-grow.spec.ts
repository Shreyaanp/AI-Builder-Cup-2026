import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'
import { openBuyStock } from './support/grow.js'
import { kirana } from './support/kirana.js'

// Simplify batch 4 (owner app, SIMPLIFY-owner.md §3.11, §3.12, §7). 4a: Grow opens on a short
// list of rows and a More tools grid of named tools. 4b: How much to make, Buy stock and My sales
// each open ONE sheet that holds what were separate Grow tools (Prep plan + Plan tomorrow; Orders
// + Purchase orders + Supply chain + the runs-out card; Your week + Weekly recap). Those old
// names are gone from Grow, yet every function they had has a visible name inside the merged
// sheet, and the old ways in (deep links, the coach's "open this screen") still land there.

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
    // The first visit after the dev server starts builds the demo: it can take a while.
    .click({ timeout: 120_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

const grow = (page: Page) => page.locator('section[aria-label="Grow"]')

async function openGrow(page: Page) {
  await page.locator('[data-tour="nav-grow"]').click()
  await expect(page.locator('[data-tour="nav-grow"]')).toHaveAttribute('aria-current', 'page')
  // Rows settle once the brief, the forecast, the stock and the week have loaded.
  for (const row of [/^Morning brief/, /^How much to make/, /^Buy stock/, /^My sales/])
    await expect(grow(page).getByRole('button', { name: row })).toBeVisible({ timeout: 15_000 })
  await expect(grow(page).getByRole('button', { name: /^How much to make/ })).not.toContainText(
    'Preparing',
    { timeout: 15_000 },
  )
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

// The names that were separate Grow entries before batch 4b.
const OLD_ENTRIES = [
  'Prep plan',
  'Plan tomorrow',
  'Purchase orders',
  'Supply chain',
  'Weekly recap',
]

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
  // Batch 4b: the old tools are no longer entries of their own on Grow.
  const text = await grow(page).innerText()
  for (const name of OLD_ENTRIES) expect(text, `"${name}" on Grow`).not.toContain(name)
  // OB-254: the Buy stock row says what needs buying, not the names of tools.
  const stock = grow(page).getByRole('button', { name: /^Buy stock/ })
  await expect(stock).toContainText(/runs out|arriving|to do|on the way|Reorder or find a supplier/)
  await expect(stock).not.toContainText(/Orders|Purchase orders|Supply chain/)
  // How much to make shows tomorrow's numbers; My sales this week's.
  await expect(grow(page).getByRole('button', { name: /^How much to make/ })).toContainText(/\d/)
  await expect(grow(page).getByRole('button', { name: /^My sales/ })).toContainText(
    /This week ₹[\d,]+/,
  )
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

// Every function the old Grow tools had, the visible names that reach it from the Grow tab
// (the row, then a tab or a control in its sheet), and what shows there. More tools icons and
// the Morning brief are single names.
const FORMER: {
  was: string
  path: string[]
  shows: (page: Page) => ReturnType<Page['locator']>
}[] = [
  {
    was: 'Prep plan',
    path: ['How much to make'],
    shows: (page) => page.getByRole('dialog').getByText('Tomorrow', { exact: true }),
  },
  {
    was: 'Plan tomorrow',
    path: ['How much to make', 'Change the numbers'],
    shows: (page) => page.getByRole('region', { name: 'Change the numbers' }),
  },
  {
    was: 'Close the day',
    path: ['Close the day'],
    shows: (page) => page.getByRole('dialog', { name: 'Close the day' }),
  },
  {
    was: 'Purchase orders (reorder)',
    path: ['Buy stock'],
    shows: (page) => page.getByRole('dialog').getByRole('button', { name: 'Draft a reorder' }),
  },
  {
    // Its order on the way counted, it says what is arriving instead (OB-263).
    was: 'Tea dust runs out · Find suppliers',
    path: ['Buy stock'],
    shows: (page) => page.getByRole('dialog').getByRole('button', { name: /runs out|arriving/ }),
  },
  {
    was: 'Supply chain (needs me now, must send)',
    path: ['Buy stock', 'To do'],
    shows: (page) => page.getByRole('dialog').getByRole('button', { name: /^To do/ }),
  },
  {
    was: 'Supply chain (coming in, received) and Orders',
    path: ['Buy stock', 'On the way'],
    shows: (page) => page.getByRole('dialog').getByRole('heading', { name: 'What’s coming in?' }),
  },
  {
    was: 'Purchase orders (suppliers and rules)',
    path: ['Buy stock', 'My suppliers'],
    shows: (page) => page.getByRole('dialog').getByRole('list', { name: 'Suppliers and rules' }),
  },
  {
    was: 'Orders (find a supplier)',
    path: ['Buy stock', 'Find a supplier'],
    shows: (page) => page.getByRole('dialog').getByLabel('What do you need?'),
  },
  {
    was: 'Your week',
    path: ['My sales'],
    shows: (page) => page.getByRole('dialog').getByText('This week', { exact: true }).first(),
  },
  {
    was: 'Weekly recap',
    path: ['My sales', 'Week summary'],
    shows: (page) =>
      page.getByRole('dialog').getByRole('button', { name: /^Week summary/, expanded: true }),
  },
  {
    was: 'Rescue deals',
    path: ['Rescue deals'],
    shows: (page) => page.getByRole('dialog'),
  },
  { was: 'Asked nearby', path: ['Asked nearby'], shows: (page) => page.getByRole('dialog') },
  {
    was: 'Payments & rides',
    path: ['Payments & rides'],
    shows: (page) => page.getByRole('heading', { name: 'Payments & rides' }).first(),
  },
  { was: 'Stamps & perks', path: ['Stamps & perks'], shows: (page) => page.getByRole('dialog') },
]

async function closeAll(page: Page) {
  await page.keyboard.press('Escape')
  const back = page.getByRole('button', { name: 'Back', exact: true }).first()
  if (await back.isVisible()) await back.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('Grow: every former tool is a visible name inside the merged sheets, 2 taps from the tab', async ({
  page,
}) => {
  await openDemo(page)
  for (const { was, path, shows } of FORMER) {
    await openGrow(page)
    const [row, inside] = path
    // Tap 1: the row or More tools icon, by its name.
    await grow(page)
      .getByRole('button', { name: new RegExp(`^${row!.replace(/[&]/g, '\\$&')}`) })
      .click()
    // Tap 2: the tab or control inside the sheet, by its name.
    if (inside) {
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const control = dialog.getByRole('button', { name: new RegExp(`^${inside}`) })
      await expect(control, `${was}: "${inside}" is visible in ${row}`).toBeVisible()
      // To do is where Buy stock opens: already there, no tap needed.
      if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click()
    }
    await expect(shows(page), `${was} → ${path.join(' → ')}`).toBeVisible({ timeout: 15_000 })
    expect(path.length, `${was}: taps from Grow`).toBeLessThanOrEqual(2)
    await closeAll(page)
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

test('Buy stock: reorder from the Grow tab in 3 taps, to an order ready to send', async ({
  page,
}) => {
  await openDemo(page)
  let taps = 0
  await page.locator('[data-tour="nav-grow"]').click()
  taps += 1
  await grow(page)
    .getByRole('button', { name: /^Buy stock/ })
    .click()
  taps += 1
  const sheet = page.getByRole('dialog', { name: /^Buy stock/ })
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  taps += 1
  const card = sheet.getByRole('article')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByRole('button', { name: 'Approve and send', exact: true })).toBeVisible()
  expect(taps, 'taps from Coach to an order to send').toBeLessThanOrEqual(3)
  await expect(sheet).not.toContainText(/\bPO \d/)
})

// One purchase order is one card with one status, counted once (SUPPLY-CHAIN-UX-RULES §5, §10):
// the Supply chain board and the purchase orders are the same records, never shown twice.
test('Buy stock: a drafted reorder is one card in To do and "1 to do" on the row (demo)', async ({
  page,
}) => {
  await openDemo(page)
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page)
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  await expect(sheet.getByRole('article')).toBeVisible({ timeout: 15_000 })
  await sheet.getByRole('button', { name: 'Buy stock', exact: true }).click()
  await expect(sheet.getByRole('article')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /Sri Lakshmi/ })).toHaveCount(1)
  // The runs-out card and the draft: two cards, and the tab says 2.
  await expect(sheet.getByRole('button', { name: /^To do/ })).toHaveText(/^To do\s*2$/)
  await sheet.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 })
  await expect(grow(page).getByRole('button', { name: /^Buy stock/ })).toContainText(
    /(^|· )1 to do$/,
  )
})

test('Buy stock: the seeded tea dust order shows once in On the way (demo)', async ({ page }) => {
  await openDemo(page)
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page, 'On the way')
  await expect(sheet.getByRole('button', { name: /13 kg/ }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(sheet.getByRole('button', { name: /13 kg/ })).toHaveCount(1)
})

test('Buy stock (fresh shop): an approved and sent reorder is one card in On the way', async ({
  page,
}) => {
  await kirana(page, { width: 390, height: 844 })
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page)
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  const card = sheet.getByRole('article')
  await expect(card).toBeVisible({ timeout: 15_000 })
  const item = ((await card.getAttribute('aria-label')) ?? '').split(' from ')[0].trim()
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(card).toContainText('Marked Sent')
  await sheet.getByRole('button', { name: 'Buy stock', exact: true }).click()
  await sheet.getByRole('button', { name: /^On the way/ }).click()
  const order = sheet.getByRole('button', { name: new RegExp(item, 'i') })
  await expect(order.first()).toBeVisible({ timeout: 15_000 })
  await expect(order).toHaveCount(1)
  await expect(sheet.getByRole('button', { name: /^On the way/ })).toHaveText(/^On the way\s*1$/)
})

test('Buy stock (fresh shop): an order with changes to check is one card in To do, none in On the way', async ({
  page,
}) => {
  await kirana(page, { width: 390, height: 844 })
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page)
  await sheet.getByRole('button', { name: 'Draft a reorder' }).click()
  const card = sheet.getByRole('article')
  await expect(card).toBeVisible({ timeout: 15_000 })
  const item = ((await card.getAttribute('aria-label')) ?? '').split(' from ')[0].trim()
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(card).toContainText('Marked Sent')
  await card.getByRole('button', { name: 'Confirm part, back-order the rest' }).click()
  await expect(card).toContainText('Changes to check', { timeout: 15_000 })
  await sheet.getByRole('button', { name: 'Buy stock', exact: true }).click()
  // Changes to check is a To do state: the order is counted there once, never on the way too.
  await expect(sheet.getByRole('button', { name: /^On the way$/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: new RegExp(item, 'i') })).toHaveCount(1)
  await sheet.getByRole('button', { name: /^On the way/ }).click()
  await expect(sheet.getByText('Nothing on the way yet.')).toBeVisible()
})

test('Buy stock → Find a supplier → milk 20 L → vendor list → Order → card with Send (demo, no paid AI)', async ({
  page,
}) => {
  const coach: string[] = []
  page.on('request', (request) => {
    if (/\/coach(\/stream)?(\?|$)/.test(new URL(request.url()).pathname)) coach.push(request.url())
  })
  await openDemo(page)
  await page.locator('[data-tour="nav-grow"]').click()
  const sheet = await openBuyStock(page, 'Find a supplier')
  await sheet.getByLabel('What do you need?').fill('Milk')
  await sheet.getByLabel(/^How much\?/).fill('20 L')
  await sheet.getByRole('button', { name: 'Find a supplier', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The coach finds the demo suppliers and drafts the owner's 20 L from the first. Only the
  // newest card is open (OB-249): the vendor list folds to one line above it; one tap opens it.
  const log = page.getByRole('log')
  await expect(log).toContainText('I drafted 20 litre', { timeout: 30_000 })
  await log.getByRole('button', { name: /Suppliers for Milk/ }).click()
  const list = log.getByRole('list', { name: /suppliers? nearby/ }).last()
  await expect(list).toBeVisible()
  await expect(list.getByText('Demo', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  const order = list.getByRole('button', { name: 'Order', exact: true }).first()
  expect((await order.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await order.click()
  // Order drafts the card to that supplier for the same 20 L, with Send: nothing goes until it
  // is tapped.
  await expect(log.getByText(/^Order from number 1: 20 litre milk$/i)).toBeVisible()
  await expect(log).toContainText(/I drafted 20 litre Milk from .+\(Demo\) below/, {
    timeout: 30_000,
  })
  await expect(log.getByRole('button', { name: /^Send to / }).last()).toBeVisible()
  await expect(log).toContainText('It goes only when you tap Send, and only in the demo.')
  // Every coach turn went to the demo sandbox's offline coach, never the paid one.
  expect(coach.length).toBeGreaterThanOrEqual(2)
  for (const url of coach) expect(url).toContain('/demo/sessions/')
})

// The coach's "open this screen" for the old tools lands in the merged sheets.
function streamAction(target: string, label: string) {
  return [
    { kind: 'ready', mode: 'offline' },
    { kind: 'action', data: { target, label } },
    { kind: 'reply', text: `Opening ${label}.` },
    { kind: 'turn_complete' },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('')
}

test('Grow (local shop): Get on Google is a row; old deep links and coach links still open', async ({
  page,
}) => {
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

  // The coach's links to the old screens (open_screen "supply": purchase orders, "plan": plan
  // tomorrow) open Buy stock and How much to make with its numbers.
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  for (const [target, label, dialog, shows] of [
    ['supply', 'Buy stock', /^Buy stock/, 'Draft a reorder'],
    ['plan', 'How much to make', 'How much to make', 'Change the numbers'],
  ] as const) {
    await page.route('**/api/v1/coach/stream', (route) =>
      route.fulfill({ contentType: 'text/event-stream', body: streamAction(target, label) }),
    )
    await page.locator('[data-tour="nav-coach"]').click()
    await page.getByLabel('Message', { exact: true }).fill(`open ${label}`)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: dialog })
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-tour="nav-grow"]')).toHaveAttribute('aria-current', 'page')
    await expect(sheet.getByRole('button', { name: shows }).first()).toBeVisible()
    if (target === 'plan')
      await expect(sheet.getByRole('button', { name: 'Change the numbers' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.unroute('**/api/v1/coach/stream')
  }
})

test('Grow: a live leftover deal shows a Live badge on its More tools icon (OB-254)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.keyboard.press('Escape')
  await page.locator('[data-tour="nav-grow"]').click()
  const rescue = page.getByTestId('grow-more-tools').getByRole('button', { name: /^Rescue deals/ })
  await expect(rescue).toBeVisible()
  await expect(rescue.getByTestId('tool-badge')).toHaveCount(0)
  const now = Math.floor(Date.now() / 1000)
  await page.route('**/api/v1/businesses/*/rescue', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: [
            {
              id: 'live-1',
              status: 'live',
              starts: now - 600,
              ends: now + 3600,
              discount_pct: 30,
              pickup_note: '',
              items: [{ name: 'Bun maska', qty: 6, qty_left: 4, price: 2000 }],
            },
          ],
        })
      : route.fallback(),
  )
  await page.locator('[data-tour="nav-coach"]').click()
  await page.locator('[data-tour="nav-grow"]').click()
  await expect(rescue.getByTestId('tool-badge')).toHaveText('Live')
  const box = await rescue.getByTestId('tool-badge').boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
})
