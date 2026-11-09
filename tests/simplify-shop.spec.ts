import { expect, test, type Page } from '@playwright/test'

// Simplify batch 3 (owner app, SIMPLIFY-owner.md §3.9, §3.10, §3.13, §7): Shop opens on one page
// card and a short list of rows, quieter tools behind More, nothing that was on Shop harder to
// find; You leads with the language.

test.setTimeout(120_000)

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `simplify-shop-${info.testId}-${Math.random()}`,
  })
})

async function openDemo(page: Page, width = 390, height = 844) {
  await page.setViewportSize({ width, height })
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Skip', exact: true })
    .click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

async function tab(page: Page, name: 'shop' | 'you') {
  await page.locator(`[data-tour="nav-${name}"]`).click()
  await expect(page.locator(`[data-tour="nav-${name}"]`)).toHaveAttribute('aria-current', 'page')
  // Rows settle once the photo count and unread count load.
  await expect(page.getByTestId(name === 'shop' ? 'shop-tiles' : 'you-settings')).toBeVisible()
  await page.waitForTimeout(500)
}

/** What the tab's own content shows in the first screenful (no top bar, no tab bar). */
function firstView(page: Page, label: string) {
  return page.evaluate((label) => {
    const root = document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!
    const nav = document.querySelector('[data-tour="nav-shop"]')!.getBoundingClientRect().top
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
      if (getComputedStyle(el).clipPath.startsWith('inset(50%')) continue
      words += (node.textContent ?? '').split(/\s+/).filter(Boolean).length
    }
    return {
      tappable: tappable.length,
      filled: tappable.filter((el) => el.classList.contains('MuiButton-contained')).length,
      words,
      bottom: root.getBoundingClientRect().bottom,
      nav,
    }
  }, label)
}

test('Shop: one page card and short rows, calm at 390 and one screenful at 360', async ({
  page,
}) => {
  await openDemo(page)
  await tab(page, 'shop')
  const view = await firstView(page, 'Shop')
  expect(view.tappable, 'tappable in the first view').toBeLessThanOrEqual(12)
  expect(view.words, 'words in the first view').toBeLessThanOrEqual(50)
  expect(view.filled, 'filled buttons').toBe(1)
  // The one primary action sits in the thumb zone, below the rows (PHONE-UX-RULES rule 1).
  const primary = await page.getByRole('button', { name: 'Show to customers' }).boundingBox()
  expect(primary!.y + primary!.height / 2).toBeGreaterThan(844 / 2)
  // The waiting customer and the daily menu question live on Coach Today, not here too.
  // (Coach stays mounted while hidden, so look inside Shop only.)
  const shop = page.locator('section[aria-label="Shop"]')
  await expect(shop.getByText('Still the same menu today?')).toHaveCount(0)
  await expect(shop.getByText(/customers? (is|are) waiting/)).toHaveCount(0)
  await expect(shop.getByRole('button', { name: /Turn on your page/ })).toHaveCount(0)
  await expect(shop.getByRole('button', { name: /^Customer page/ })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('shop-390.png') })

  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(500)
  const small = await firstView(page, 'Shop')
  expect(small.bottom, 'Shop fits one screenful at 360').toBeLessThanOrEqual(small.nav)
  await page.screenshot({ path: test.info().outputPath('shop-360.png') })
})

test('Shop: "Show to customers" opens the page switch', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  await page.getByRole('button', { name: 'Show to customers', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Your shop page' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('switch', { name: 'Customers can see my shop' })).toBeVisible()
  // The quieter thank-you perks moved to the stamp card.
  await expect(sheet.getByRole('textbox')).toHaveCount(0)
})

test('Shop: every former tile is still reachable by name', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'shop')
  const opens = async (row: RegExp, dialog: string | RegExp) => {
    await page.getByRole('button', { name: row }).first().click()
    await expect(page.getByRole('dialog', { name: dialog })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await opens(/^Menu/, 'Menu')
  await opens(/^Sold out/, 'Sold out')
  await opens(/^Messages/, /Messages/)
  await opens(/^Photos/, 'Photos')
  await opens(/^Shop details/, /^Lantern Chai Corner/)
  // More opens on the same screen.
  const more = page.getByRole('button', { name: /^More/ })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await expect(more).toContainText('Stamp card · Billing app')
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await opens(/^Link your billing app/, 'Link your billing app')
  await page.getByRole('button', { name: /^Stamp card/ }).click()
  const stamps = page.getByRole('dialog', { name: 'Stamp card' })
  await expect(stamps.getByRole('button', { name: 'Change stamp card' })).toBeVisible()
  await stamps.getByRole('button', { name: 'More rewards' }).click()
  await expect(stamps.getByRole('textbox').first()).toBeVisible()
})

test('Shop: Add product asks for name and price; the rest is behind More details', async ({
  page,
}) => {
  await openDemo(page)
  await tab(page, 'shop')
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page
    .getByRole('dialog', { name: 'Menu' })
    .getByRole('button', { name: 'Add product' })
    .click()
  const form = page.getByRole('dialog', { name: 'Add product' })
  await expect(form.getByRole('textbox', { name: 'Product name' })).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'Price' })).toBeVisible()
  await expect(form.getByLabel('Category', { exact: true })).toHaveCount(0)
  await expect(form.getByTestId('ask-hint')).toBeVisible()
  await form.getByRole('button', { name: 'More details' }).click()
  await expect(form.getByLabel('Category', { exact: true })).toBeVisible()
  await expect(form.getByRole('group', { name: 'Do you make it or buy it?' })).toBeVisible()
})

test('Shop: Messages is a chat list; a conversation has one header with its name', async ({
  page,
}) => {
  await openDemo(page)
  await tab(page, 'shop')
  await page.getByRole('button', { name: /^Messages/ }).click()
  const inbox = page.getByRole('region', { name: /Messages/ })
  await expect(inbox.getByRole('button', { name: 'Reload messages' })).toHaveCount(0)
  const row = inbox.getByRole('button', { name: /^Open conversation: / }).first()
  const name = ((await row.getAttribute('aria-label')) ?? '').replace('Open conversation: ', '')
  await row.click()
  await expect(inbox.getByRole('heading', { name, exact: true })).toBeVisible()
  // "Messages (0)" stays only for screen readers (it names the region).
  const title = await inbox.getByRole('heading', { name: /^Messages \(/ }).boundingBox()
  expect(title!.width).toBeLessThanOrEqual(1)
  // Close and Block wait in the ⋯ menu, not beside each other on the screen.
  await expect(inbox.getByRole('button', { name: 'Block customer' })).toHaveCount(0)
  await inbox.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByRole('menuitem', { name: 'Block customer' })).toBeVisible()
  await page.keyboard.press('Escape')
  await inbox.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(inbox.getByRole('heading', { name: /^Messages \(/ })).toBeVisible()
})

test('You: Language is the first row; Look, What the coach knows and Help are short rows', async ({
  page,
}) => {
  await openDemo(page)
  await tab(page, 'you')
  const settings = page.getByTestId('you-settings')
  const first = settings.locator(':scope > *').first()
  await expect(first.getByRole('combobox', { name: 'Language' })).toBeVisible()
  // Look is one row; its three choices open under it.
  await expect(page.getByRole('group', { name: 'Look', exact: true })).toHaveCount(0)
  const look = page.getByRole('button', { name: /^Look/ })
  await expect(look).toContainText('Light')
  await look.click()
  await page
    .getByRole('group', { name: 'Look', exact: true })
    .getByRole('button', { name: 'Dark', exact: true })
    .click()
  await expect(look).toContainText('Dark')
  // What the coach knows has its own row.
  await page.getByRole('button', { name: 'What the coach knows', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'What Chalkboard knows about your shop' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  // Help: the tour and what to ask; the intro replays from that page.
  const help = page.getByRole('region', { name: 'Help', exact: true })
  await expect(help.getByRole('button', { name: 'Take the tour', exact: true })).toBeVisible()
  await expect(help.getByRole('button', { name: 'Replay the intro' })).toHaveCount(0)
  await help.getByRole('button', { name: 'What can I ask?', exact: true }).click()
  await page.getByRole('button', { name: 'Replay the intro', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
