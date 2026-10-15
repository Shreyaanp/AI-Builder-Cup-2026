import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { closeSheet, enter, localOnly, phone, shareSigned } from './support.js'

/**
 * Seeds one shared shop at its own map pin, away from every other test shop, so Today's 7 near
 * that pin is about this shop alone. The customer then stands at the pin: a real verified stamp.
 * Pins never come from the client, except the exact GPS that replaces an approximate area pin
 * (the photo path), so: area pin first, exact point second, then the menu.
 */
async function seedPinnedShop(page: Page, name: string, at: { lat: number; lng: number }) {
  const business = {
    name,
    category: 'Bakery',
    location: 'Jayanagar, Bengaluru',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    locally_made: true,
    payment_methods: ['UPI', 'cash'],
    reward_text: 'Your tenth bun is free',
    stamps_needed: 10,
  }
  async function apply(data: object) {
    const prepared = await page.request.post('/api/v1/proposals', { data })
    expect(prepared.ok(), await prepared.text()).toBe(true)
    const proposal = await prepared.json()
    const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
    expect(approved.ok(), await approved.text()).toBe(true)
    const { business_id: id } = await approved.json()
    const shops: { id: string; revision: number }[] = await (
      await page.request.get('/api/v1/businesses')
    ).json()
    return shops.find((shop) => shop.id === id)!
  }
  let shop = await apply({
    kind: 'business',
    revision: 0,
    geocode_confirmed: true,
    business,
    products: [],
  })
  shop = await apply({
    kind: 'business',
    business_id: shop.id,
    revision: shop.revision,
    business: { ...business, ...at },
    products: [],
  })
  await apply({
    kind: 'inventory',
    business_id: shop.id,
    revision: shop.revision,
    products: [
      { name: 'Honey cake slice', price: 4000, unit: 'slice', category: 'Bakes' },
      { name: 'Masala bun', price: 2500, unit: 'piece', category: 'Bakes' },
    ],
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

type Mode = 'light' | 'dark'

/** One shop, its signed QR and a customer phone standing at its pin, in the given appearance. */
async function setup(page: Page, browser: Browser, mode: Mode) {
  await localOnly(page)
  await enter(page)
  const shopName = `Iyengar Bakery ${Date.now().toString().slice(-5)}`
  // A pin of its own in rural Karnataka: no other test shop within Today's 2 km.
  const at = { lat: 12.3 + Math.random() * 0.4, lng: 76.2 + Math.random() * 0.4 }
  await seedPinnedShop(page, shopName, at)
  const { qr } = await shareSigned(page)
  await closeSheet(page)
  const context = await browser.newContext({
    ...phone,
    viewport:
      test.info().project.name === 'desktop' ? { width: 1440, height: 1000 } : phone.viewport,
    isMobile: test.info().project.name !== 'desktop',
    hasTouch: test.info().project.name !== 'desktop',
    // The app follows its saved choice (default light), not the system scheme.
    colorScheme: mode === 'dark' ? 'light' : 'dark',
    permissions: ['geolocation'],
    geolocation: { latitude: at.lat, longitude: at.lng, accuracy: 15 },
  })
  await context.addInitScript((appearance) => {
    const key = 'niva.starter.preferences'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ appearance }))
  }, mode)
  return { context, shopName, qr }
}

/** Screenshot plus a WCAG 2 A/AA axe pass of whatever is on screen (dialogs included). */
function recorder(mode: Mode) {
  return async (page: Page, step: string | number) => {
    await page.evaluate(async () => {
      await document.fonts.ready
      // Finish finite CSS transitions (including the dialog fade), then let Chrome paint
      // the skipped GSAP end state before checking raster contrast. Infinite focus ripples
      // are decorative and must not hold up evidence capture.
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      )
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    })
    await page.screenshot({
      path: `docs/stories/customer-${test.info().project.name}-${mode}-stamp-${step}.png`,
      animations: 'disabled',
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      `S8/${step} (${mode})`,
    ).toEqual([])
  }
}

async function walk(customer: Page, shopName: string, qr: string, mode: Mode) {
  const evidence = recorder(mode)
  await localOnly(customer)
  await test.step("1 · Today's 7 on the Ask home", async () => {
    await customer.goto(`http://127.0.0.1:${process.env.WEB_PORT ?? 3200}/explore/`)
    await customer.getByRole('button', { name: 'Use my location' }).click()
    await customer.getByRole('button', { name: 'Explore my neighbourhood' }).click()
    const today = customer.getByRole('region', { name: /^Today near/ })
    const find = today.getByRole('listitem').filter({ hasText: shopName }).first()
    await expect(find).toBeVisible({ timeout: 20_000 })
    await expect(find).toContainText(/min walk/)
    await find.scrollIntoViewIfNeeded()
    await evidence(customer, 1)
  })
  await test.step('1b · Ask matches the real offline menu at this location', async () => {
    await customer.getByRole('search').getByRole('textbox').fill('Honey cake')
    await customer.getByRole('button', { name: 'Search', exact: true }).click()
    const match = customer.getByRole('link', { name: new RegExp(shopName) })
    await expect(match).toContainText('Honey cake slice')
    await expect(match).toContainText('₹40.00')
    await evidence(customer, '1-search')
    await customer.getByRole('button', { name: 'New search', exact: true }).click()
  })
  await test.step('2 · a find opens its shop', async () => {
    const today = customer.getByRole('region', { name: /^Today near/ })
    const find = today.getByRole('listitem').filter({ hasText: shopName }).first()
    await find.getByRole('link', { name: 'Go' }).click()
    await expect(customer).toHaveURL(/\/explore\/s\//)
    await expect(customer.getByRole('heading', { level: 1, name: shopName })).toBeVisible()
    // Signed out, the shop card is honest about where it lives.
    const card = customer.getByRole('region', { name: 'Stamp card' })
    await expect(card.getByRole('status')).toHaveText('0 stamps')
    await expect(card).toContainText('This card is stored on this phone.')
    await evidence(customer, 2)
  })
  await test.step('3 · scanning the counter QR: the stamp moment', async () => {
    await customer.goto(qr)
    const moment = customer.getByRole('dialog')
    await expect(moment.getByRole('button', { name: 'Done' })).toBeVisible()
    await expect(moment.getByRole('progressbar')).toHaveCount(0)
    // A tap skips the celebration to its end state.
    await moment.getByRole('heading').first().click()
    // Visibility alone accepts opacity:0. A skipped celebration must finish visibly.
    for (const line of await moment.locator('.stamp-line').all())
      await expect(line).toHaveCSS('opacity', '1', { timeout: 500 })
    await expect(moment.getByRole('heading', { name: 'First try!' })).toBeVisible()
    await expect(moment.getByText('+50 points')).toBeVisible()
    await expect(
      moment.getByText('Kept on this phone. Sign in to keep it everywhere.'),
    ).toBeVisible()
    await expect(moment.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await evidence(customer, 3)
    await moment.getByRole('button', { name: 'Done' }).click()
    await expect(moment).toBeHidden()
    // The signed link is spent from the address bar, and the phone card counted the visit.
    await expect(customer).not.toHaveURL(/[?&]k=/)
    const card = customer.getByRole('region', { name: 'Stamp card' })
    await expect(card.getByRole('status')).toHaveText('1 stamps')
  })
  await test.step('4 · passport: level, streak, stamp book and quests', async () => {
    // Back to the Ask home, then the Passport tab.
    await customer.getByRole('link', { name: 'Back', exact: true }).first().click()
    await customer.getByRole('navigation').getByRole('link', { name: 'Passport' }).click()
    await expect(customer.getByRole('heading', { level: 1, name: 'Your passport' })).toBeVisible()
    await expect(customer.getByText('On this phone', { exact: true })).toBeVisible()
    await expect(customer.getByText('Newcomer').first()).toBeVisible()
    await expect(customer.getByText('250 more points to Regular')).toBeVisible()
    await expect(customer.getByRole('region', { name: 'Weekly streak: 1' })).toBeVisible()
    await evidence(customer, '4-level')
    const book = customer.getByRole('region', { name: 'Stamp book' })
    await expect(book).toContainText(shopName)
    await book.scrollIntoViewIfNeeded()
    await evidence(customer, '4-book')
    const quests = customer.getByRole('region', { name: 'Quests' })
    await expect(quests.getByRole('heading', { name: 'Weekly breakthrough' })).toBeVisible()
    // This week's breakthrough has the one verified visit. (The early-bird crawl may also count it
    // when the run happens before 10am shop time, so the check is scoped to the breakthrough card.)
    const breakthrough = quests
      .getByRole('heading', { name: 'Weekly breakthrough' })
      .locator('xpath=..')
    await expect(breakthrough.getByRole('progressbar')).toHaveAccessibleName('1 of 3')
    await quests.scrollIntoViewIfNeeded()
    // Chrome rasterises freshly scrolled layers (opacity, progress bars) a beat later.
    await customer.waitForTimeout(400)
    await evidence(customer, '4-quests')
  })
  await test.step('5 · a second scan the same day is honest', async () => {
    await customer.goto(qr)
    const moment = customer.getByRole('dialog')
    await expect(moment.getByRole('heading', { name: 'Already stamped today' })).toBeVisible()
    await evidence(customer, 5)
    await moment.getByRole('button', { name: 'Done' }).click()
    await expect(
      customer.getByRole('region', { name: 'Stamp card' }).getByRole('status'),
    ).toHaveText('1 stamps')
  })
}

for (const mode of ['light', 'dark'] as const) {
  test(`S8 · Today's 7, a shop, the stamp moment and the passport (${mode})`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    const { context, shopName, qr } = await setup(page, browser, mode)
    try {
      const customer = await context.newPage()
      await walk(customer, shopName, qr, mode)
      const surface = await customer.evaluate(() => getComputedStyle(document.body).backgroundColor)
      // Kraft paper light, chalkboard dark (B30).
      expect(surface).toBe(mode === 'dark' ? 'rgb(23, 39, 31)' : 'rgb(251, 247, 236)')
    } finally {
      await context.close()
    }
  })
}
