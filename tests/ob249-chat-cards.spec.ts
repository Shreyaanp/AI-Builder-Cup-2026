import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// OB-249 (#636), owner: "when anything comes up like order, the existing bigger components need to
// become a minimised version". Only the newest chat card is full size; earlier ones fold to one
// line (icon · what · status), tap to open (one at a time), and a card that still needs the owner
// keeps its action on the line. Local preview with the offline coach: the public demo answers
// "reorder …" or "how was this week" in words only (no card), so a kirana with four weeks of sales
// brings the real cards: a purchase order, suppliers, an order request and a forecast chart.
test.skip(({ isMobile }) => !isMobile, 'phone story')

async function say(page: Page, text: string) {
  await page.locator('textarea[name="message"]').fill(text)
  await page.locator('form button[type="submit"]').last().click()
}

/** A kirana (onions in kg, milk in l, 12 of each) with four weeks of sales. */
async function kirana(
  page: Page,
  size: { width: number; height: number },
  language: 'en' | 'hi' = 'en',
  appearance: 'light' | 'dark' = 'light',
) {
  await page.setViewportSize(size)
  await localOnly(page)
  await enter(page)
  await page.evaluate(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance },
  )
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name: 'Corner Store',
          category: 'Grocery',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          phone: '+919876543210',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Onions', price: 4000, unit: 'kg', category: 'Veg', stock: 12 },
          { name: 'Milk', price: 6000, unit: 'l', category: 'Dairy', stock: 12 },
        ],
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  const { business_id: id } = await approved.json()
  const shopDay = (back: number) =>
    new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
  for (let back = 28; back >= 1; back--) {
    const v = 3 + (back % 3)
    const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
      data: {
        date: shopDay(back),
        sales: [
          { item: 'Onions', quantity: v, amount: v * 40 },
          { item: 'Milk', quantity: v, amount: v * 60 },
        ],
      },
    })
    const { sales } = await day.json()
    await page.request.post(`/api/v1/businesses/${id}/import/${sales.import_id}/approve`, {
      data: { digest: sales.digest },
    })
  }
  await page.reload()
  await page
    .getByRole('button', {
      name: language === 'hi' ? 'स्थानीय प्रीव्यू जारी रखें' : 'Continue local preview',
    })
    .click()
  await expect(page.locator('textarea[name="message"]')).toBeVisible()
  await page.keyboard.press('Escape')
}

const lines = (page: Page) => page.locator('[role="log"] [aria-expanded]')

/** Four cards, one after another; each new one folds the ones before it. */
async function fourCards(page: Page) {
  await say(page, 'reorder milk')
  await expect(page.getByRole('article')).toBeVisible({ timeout: 30_000 })
  await expect(lines(page)).toHaveCount(0)
  await say(page, 'My onions are running low')
  await expect(lines(page)).toHaveCount(1, { timeout: 30_000 })
  await say(page, 'order 20 kg onions from the first one')
  await expect(lines(page)).toHaveCount(2, { timeout: 30_000 })
  await say(page, 'forecast demand')
  await expect(lines(page)).toHaveCount(3, { timeout: 30_000 })
  for (const line of await lines(page).all())
    await expect(line).toHaveAttribute('aria-expanded', 'false')
}

async function fitsAndPasses(page: Page, label: string) {
  const width = page.viewportSize()!.width
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${label}: no side scroll`,
  ).toBe(true)
  const log = page.locator('[role="log"]')
  for (const button of await log.locator('[data-card-line] button').all()) {
    await button.scrollIntoViewIfNeeded()
    const box = (await button.boundingBox())!
    expect(Math.round(box.height), `${label}: 48 px targets`).toBeGreaterThanOrEqual(48)
    expect(box.x + box.width, `${label}: inside the screen`).toBeLessThanOrEqual(width + 1)
  }
  const result = await new AxeBuilder({ page })
    .include('[role="log"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    `${label}: axe`,
  ).toEqual([])
}

test('OB-249: only the newest card is full; earlier ones are one line that keeps its action', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await kirana(page, { width: 390, height: 844 })
  await fourCards(page)

  // The forecast is the newest card: full size. The others are one line each, with status.
  await expect(page.getByText('Based on your last weeks')).toBeVisible()
  const po = page.getByRole('button', { name: /^Order · Milk .+ · Needs your OK\. Show$/ })
  const suppliers = page.getByRole('button', { name: /^Suppliers for onions · \d+ found\. Show$/ })
  const order = page.getByRole('button', { name: /^Order · Onions 20 kg · Needs your OK\. Show$/ })
  await expect(po).toBeVisible()
  await expect(suppliers).toBeVisible()
  await expect(order).toBeVisible()
  await expect(page.getByRole('article')).toBeHidden()
  await expect(page.getByRole('list', { name: /suppliers? nearby/ })).toBeHidden()
  await expect(page.getByText('Order request', { exact: true })).toBeHidden()

  // Nothing that needs a decision is hidden: Send and Approve stay on their lines, same names.
  const send = page.getByRole('button', { name: 'Send to Shree Ganesh Wholesale Traders' })
  const approve = page.getByRole('button', { name: 'Approve and send', exact: true })
  await expect(send).toHaveCount(1)
  await expect(send).toBeVisible()
  await expect(approve).toHaveCount(1)
  await expect(approve).toBeVisible()
  await fitsAndPasses(page, '390 folded')
  await page.screenshot({ path: test.info().outputPath('folded-390.png') })

  // Tap a line: it opens and the open one folds (one at a time).
  await po.click()
  const poOpen = page.getByRole('button', { name: /^Order · Milk .+\. Hide$/ })
  await expect(poOpen).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('article')).toBeVisible()
  await expect(page.getByText('Based on your last weeks')).toBeHidden()
  await expect(
    page.getByRole('button', { name: /^Forecast · Milk, Onions · Next 7 days\. Show$/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[role="log"] [aria-expanded="true"]')).toHaveCount(1)
  await order.click()
  await expect(page.getByRole('button', { name: /^Order · Onions 20 kg .+\. Hide$/ })).toBeVisible()
  await expect(page.getByRole('article')).toBeHidden()
  await expect(page.locator('[role="log"] [aria-expanded="true"]')).toHaveCount(1)

  // Keyboard: a line is a button; Enter opens it.
  await suppliers.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: /suppliers? nearby/ })).toBeVisible()
  await expect(page.locator('[role="log"] [aria-expanded="true"]')).toHaveCount(1)

  // The action on a folded line works: the purchase order is approved without opening it.
  await expect(approve).toBeVisible()
  await approve.click()
  await expect(
    page.getByRole('button', { name: /^Order · Milk .+\. Show$/ }),
  ).not.toHaveAccessibleName(/Needs your OK/, { timeout: 15_000 })
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await expect(approve).toHaveCount(0)

  // Display only: what the owner typed in a card survives folding and opening again.
  await page.getByRole('button', { name: /^Order · Milk .+\. Show$/ }).click()
  await page.getByRole('button', { name: 'Paste a supplier document' }).click()
  const typed = page.getByRole('textbox', { name: 'A document, CSV or a message' })
  await typed.fill('Confirmed: 25 l milk tomorrow 9am')
  await page.getByRole('button', { name: /^Forecast · .+\. Show$/ }).click()
  await expect(typed).toBeHidden()
  await page.getByRole('button', { name: /^Order · Milk .+\. Show$/ }).click()
  await expect(typed).toBeVisible()
  await expect(typed).toHaveValue('Confirmed: 25 l milk tomorrow 9am')
  await fitsAndPasses(page, '390 opened')
})

test('OB-249: a folded cancellation says "Cancellation to send", not that the order needs sending', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await kirana(page, { width: 390, height: 844 })
  await say(page, 'reorder milk')
  await expect(page.getByRole('article')).toBeVisible({ timeout: 30_000 })
  await say(page, 'My onions are running low')
  await expect(lines(page)).toHaveCount(1, { timeout: 30_000 })
  await say(page, 'order 20 kg onions from the first one')
  await expect(lines(page)).toHaveCount(2, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Send to Shree Ganesh Wholesale Traders' }).first().click()
  await expect(page.getByText(/Confirmed: 20 kg Onions/).first()).toBeVisible({ timeout: 30_000 })
  await say(page, 'cancel the onions order')
  await expect(page.getByText('Cancellation to send').first()).toBeVisible({ timeout: 30_000 })
  await say(page, 'forecast demand')
  const folded = page.getByRole('button', {
    name: /^Order · Onions 20 kg · Cancellation to send\. Show$/,
  })
  await expect(folded).toBeVisible({ timeout: 30_000 })
  await expect(folded).not.toHaveAccessibleName(/Needs your OK/)
  await expect(
    page.getByRole('button', { name: 'Send cancellation to Shree Ganesh Wholesale Traders' }),
  ).toBeVisible()
  // After the line action runs, focus stays on that line instead of dropping to the page top.
  await page
    .getByRole('button', { name: 'Send cancellation to Shree Ganesh Wholesale Traders' })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: 'Send cancellation to Shree Ganesh Wholesale Traders' }),
  ).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Order · Onions 20 kg .+\. Show$/ })).toBeFocused()
})

for (const [width, height, appearance] of [
  [360, 800, 'dark'],
  [412, 915, 'dark'],
  [1280, 800, 'light'],
] as const)
  test(`OB-249: folded cards fit ${width} px (${appearance})`, async ({ page }) => {
    test.setTimeout(150_000)
    // Reduced motion: lines open and fold at once.
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: appearance })
    await kirana(page, { width, height }, 'en', appearance)
    await fourCards(page)
    await expect(page.getByRole('button', { name: 'Approve and send', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Send to / })).toBeVisible()
    await fitsAndPasses(page, `${width} ${appearance}`)
    await page.screenshot({ path: test.info().outputPath(`folded-${width}-${appearance}.png`) })
  })

test('OB-249: the lines in Hindi, 360 px', async ({ page }) => {
  test.setTimeout(150_000)
  await kirana(page, { width: 360, height: 800 }, 'hi')
  await fourCards(page)
  const names = await lines(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  )
  expect(names.some((name) => name.startsWith('ऑर्डर · ') && name.includes('मंज़ूरी चाहिए'))).toBe(
    true,
  )
  for (const name of names) {
    expect(name).toMatch(/दिखाएँ$/)
    expect(name).not.toMatch(/[{}]|undefined|NaN/)
  }
  await expect(page.getByRole('button', { name: 'मंज़ूर करके भेजें', exact: true })).toBeVisible()
  await fitsAndPasses(page, '360 hi')
  await page.screenshot({ path: test.info().outputPath('folded-360-hi.png') })
})
