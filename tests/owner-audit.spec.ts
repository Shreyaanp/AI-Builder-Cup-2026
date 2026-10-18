import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { gpsBoardPath, openNewShopReview } from './stories/support.js'

// Owner story audit (16 Oct, docs/qa/story-audit/owner-report.md): every finding reproduced,
// then fixed. Runs on phone and desktop; light and dark are both checked with axe.

// The real Bengaluru menu board the story audit used.
const PHOTO = readFileSync(gpsBoardPath)

async function local(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

async function enter(page: Page) {
  await local(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

type Item = { name: string; unit: string; price: number }
const CHAI: Item[] = [
  { name: 'Special Chai', unit: 'cup', price: 1500 },
  { name: 'Special Chai', unit: 'pot', price: 4000 },
  { name: 'Masala Dosa', unit: 'plate', price: 6000 },
]

/** A saved shop (through the same sealed proposal the app uses), then the app reloaded on it. */
async function seed(page: Page, name: string, products: Item[] = CHAI, category = 'Restaurant') {
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: { name, category, location: 'Jayanagar, Bengaluru', hours: '11:00-23:00' },
        products,
      },
    })
  ).json()
  const saved = await (
    await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
  ).json()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
  return saved.business_id as string
}

async function axe(page: Page) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.evaluate(async () => {
      await document.fonts.ready
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
    expect(result.violations.map((v) => [colorScheme, v.id, v.nodes.map((n) => n.target)])).toEqual(
      [],
    )
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
}

async function atLeast44(target: Locator) {
  const box = (await target.boundingBox())!
  expect(box.height, await target.innerText()).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  return page.getByRole('dialog', { name: 'Menu' })
}

test('#1 a menu photo without connected AI offers real next steps, never an empty save', async ({
  page,
}) => {
  await enter(page)
  await seed(page, 'Dakshin Sagar')
  const menu = await openMenu(page)
  await menu.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
  await menu
    .locator('input[type="file"][accept*=".xlsx"]')
    .setInputFiles({ name: 'board.jpg', mimeType: 'image/jpeg', buffer: PHOTO })
  const failed = menu.getByTestId('import-failed')
  await expect(failed).toContainText('needs connected AI')
  await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(failed.getByRole('button', { name: 'Import CSV or Excel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm and save' })).toHaveCount(0)
  await axe(page)
  await failed.getByRole('button', { name: 'Type items' }).click()
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible()
})

test('#1 a reader that found nothing never offers "Confirm and save"', async ({ page }) => {
  await enter(page)
  const bid = await seed(page, 'Dakshin Sagar')
  // An empty extraction, as a photo reader could return: nothing to confirm.
  await page.route('**/api/v1/businesses/*/import', (route) =>
    route.fulfill({
      json: {
        kind: 'menu',
        items: 0,
        skipped: 0,
        proposal: {
          id: 'empty',
          digest: 'x',
          expires: 0,
          snapshot: {
            kind: 'inventory',
            business_id: bid,
            revision: 1,
            business: null,
            products: [],
          },
        },
      },
    }),
  )
  const menu = await openMenu(page)
  await menu.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
  await menu
    .locator('input[type="file"][accept*=".xlsx"]')
    .setInputFiles({ name: 'board.jpg', mimeType: 'image/jpeg', buffer: PHOTO })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Nothing was found to save')
  await expect(review.getByRole('button', { name: 'Confirm and save' })).toHaveCount(0)
  await axe(page)
  await review.getByRole('button', { name: 'Type items' }).click()
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible()
})

test('#2 #7 the owner message thread is a real list, with full-size translation toggles', async ({
  page,
}) => {
  const thread = {
    id: 't1',
    name: 'Priya',
    contact: 'priya@example.com',
    message: 'Do you have Special Chai today?',
    created: 1_760_000_000,
    unread: true,
    done: false,
    blocked: false,
    messages: [
      {
        id: 'm1',
        author: 'customer',
        kind: '',
        text: 'Do you have Special Chai today?',
        created: 1_760_000_000,
      },
      { id: 'm2', author: 'owner', kind: '', text: 'Yes, until 9 pm.', created: 1_760_000_100 },
    ],
  }
  await page.route('**/api/v1/businesses/*/inquiries/stream', (route) => route.abort())
  await page.route('**/api/v1/businesses/*/inquiries', (route) => route.fulfill({ json: [thread] }))
  await page.route('**/api/v1/businesses/*/inquiries/t1/*', (route) =>
    route.fulfill({ json: { ...thread, unread: false } }),
  )
  await enter(page)
  await seed(page, 'Dakshin Sagar')
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Messages/ }).click()
  await page.getByRole('button', { name: 'Open conversation' }).click()
  const log = page.getByRole('log', { name: 'Conversation' })
  await expect(log).toContainText('Yes, until 9 pm.')
  // Every message is an item of the list inside the live region.
  await expect(log.getByRole('list').getByRole('listitem')).toHaveCount(2)
  await axe(page)
  const translate = log.getByRole('button', { name: 'See translation' }).first()
  await atLeast44(translate)
})

test('#3 a rescue with no menu items says why and offers to add them', async ({ page }) => {
  await enter(page)
  await seed(page, 'Dakshin Sagar', [])
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Rescue deals/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Closing-time rescue' })
  await expect(sheet.getByTestId('rescue-no-items')).toContainText('made from your menu items')
  await expect(sheet.getByRole('button', { name: 'Send rescue' })).toHaveCount(0)
  await axe(page)
  await sheet.getByRole('button', { name: 'Add today’s items' }).click()
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible()
})

test('#4 a phone sheet closes from the thumb zone; desktop keeps the corner X', async ({
  page,
  isMobile,
}) => {
  await enter(page)
  await seed(page, 'Dakshin Sagar')
  const menu = await openMenu(page)
  const close = menu.getByRole('button', { name: 'Close', exact: true })
  await expect(close).toHaveCount(1)
  const box = (await close.boundingBox())!
  const height = page.viewportSize()!.height
  const sheet = (await menu.boundingBox())!
  if (isMobile) {
    // The lower part of the screen, inside the sheet's bottom row.
    expect(box.y).toBeGreaterThan(height * 0.6)
    await atLeast44(close)
  } else {
    expect(box.y - sheet.y).toBeLessThan(64)
  }
  await axe(page)
  await close.click()
  await expect(menu).toHaveCount(0)

  // Close the day (a full-screen dialog on a phone) also closes from the bottom.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Close the day/ }).click()
  const day = page.getByRole('dialog', { name: 'Close the day' })
  const dayClose = day.getByRole('button', { name: 'Close', exact: true })
  await expect(dayClose).toHaveCount(1)
  const dayBox = (await dayClose.boundingBox())!
  if (isMobile) expect(dayBox.y).toBeGreaterThan(height * 0.8)
  else expect(dayBox.y - (await day.boundingBox())!.y).toBeLessThan(64)
  await dayClose.click()
  await expect(day).toHaveCount(0)
})

test('#5 #7 #9 a till photo that fails offers typed numbers; the review fits 360px', async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 })
  await enter(page)
  await seed(page, 'Dakshin Sagar')
  await page.route('**/api/v1/businesses/*/day/read*', (route) =>
    route.fulfill({ status: 503, json: { detail: 'EXTRACTION_UNAVAILABLE' } }),
  )
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Close the day/ }).click()
  const day = page.getByRole('dialog', { name: 'Close the day' })
  await day.getByRole('button', { name: /Till or POS report/ }).click()
  await day
    .locator('input[type=file]')
    .setInputFiles({ name: 'till.jpg', mimeType: 'image/jpeg', buffer: PHOTO })
  const trouble = day.getByTestId('close-day-trouble')
  await expect(trouble).toContainText('couldn’t be read')
  await axe(page)
  await trouble.getByRole('button', { name: 'Type the numbers instead' }).click()
  const typed = day.getByTestId('close-day-typed')
  for (const [item, qty, amount] of [
    ['Masala Dosa', '12', '720'],
    ['Filter coffee with extra decoction, jaggery and a second refill', '30', '1200'],
  ] as const) {
    await typed.getByLabel('Item').fill(item)
    await typed.getByLabel('Quantity sold').fill(qty)
    await typed.getByLabel(/^Amount/).fill(amount)
    await typed.getByRole('button', { name: 'Add line' }).click()
  }
  await expect(typed.getByRole('listitem')).toHaveCount(2)
  await day.getByRole('button', { name: /^Review \(2/ }).click()
  await expect(day.getByText('Today’s sales')).toBeVisible()
  await noSideScroll(page)
  const width = page.viewportSize()!.width
  for (const remove of await day.getByRole('button', { name: /^Remove: / }).all()) {
    await atLeast44(remove)
    const box = (await remove.boundingBox())!
    // Clear of the screen edge: the row keeps the dialog's own gutter.
    expect(box.x + box.width).toBeLessThanOrEqual(width - 12)
  }
  await axe(page)
  await day.getByRole('button', { name: 'Save day' }).click()
  await expect(day.getByText('Day closed')).toBeVisible({ timeout: 20_000 })
})

test('#9 offline, close the day offers typed numbers right away', async ({ page, context }) => {
  await enter(page)
  await seed(page, 'Dakshin Sagar')
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Close the day/ }).click()
  const day = page.getByRole('dialog', { name: 'Close the day' })
  await expect(day.getByRole('button', { name: 'Type the numbers instead' })).toBeVisible()
  await context.setOffline(true)
  await expect(day.getByTestId('close-day-trouble')).toContainText('You’re offline')
  await context.setOffline(false)
})

test('#6 after "per cup or per pot?", the coach links to the item in the menu', async ({
  page,
}) => {
  await enter(page)
  const bid = await seed(page, 'Dakshin Sagar')
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  // The coach's answer to "Special Chai per cup is 20 rupees": one sealed change to that item.
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'inventory',
        business_id: bid,
        revision: shop.revision,
        products: [{ name: 'Special Chai', unit: 'cup', price: 2000 }],
      },
    })
  ).json()
  const events = [
    { kind: 'ready', mode: 'offline' },
    { kind: 'proposal', data: proposal },
    { kind: 'reply', text: 'Updated Special Chai per cup to 20. Check and save it.' },
    { kind: 'turn_complete' },
  ]
  await page.route('**/api/v1/coach/stream', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    }),
  )
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('Special Chai per cup is 20 rupees')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  const log = page.getByRole('log')
  await expect(log).toContainText('Updated Special Chai')
  const link = log.getByRole('button', { name: 'See Special Chai in your menu' })
  await expect(link).toHaveCount(1)
  await atLeast44(link)
  await axe(page)
  await link.click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu).toBeVisible()
  // Focus lands on that item; there is still exactly one Special Chai per cup.
  await expect(menu.getByRole('button', { name: 'Edit Special Chai' }).first()).toBeFocused()
  await expect(menu.getByText(/20.00/)).toHaveCount(1)
  await expect(menu.getByRole('button', { name: 'Edit Special Chai' })).toHaveCount(2)
})

// Onboarding v2 (owner decision, 17 Oct) asks only name, kind, place, hours and a shop photo:
// dietary info is no longer part of the new-shop review, for a restaurant or a tea stall.
test('#8 the new-shop review of a restaurant asks nothing beyond the five onboarding fields', async ({
  page,
}) => {
  await enter(page)
  await openNewShopReview(page, 'name: Dakshin Sagar; category: Restaurant; location: Jayanagar')
  const review = page.getByTestId('draft-summary')
  await expect(review).toContainText('Dakshin Sagar')
  await expect(page.getByTestId('dietary-optional')).toHaveCount(0)
  await expect(review.locator('[data-field]')).toHaveCount(5)
  await noSideScroll(page)
  await axe(page)
})

test('#8 a tea stall review has no dietary prompt', async ({ page }) => {
  await enter(page)
  await openNewShopReview(page)
  await expect(page.getByTestId('draft-summary')).toBeVisible()
  await expect(page.getByTestId('dietary-optional')).toHaveCount(0)
})
