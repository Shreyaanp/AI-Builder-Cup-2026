import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { enter, localOnly, phone, shareSigned } from './support.js'

/**
 * S13 · The passport games (docs/research/gamification.md). An owner sets a scratch-card prize
 * and thank-yous; a signed-in neighbour standing at the shop scans the counter QR: stamp →
 * scratch card → prize → collection-set progress → the neighbourhood goal → a streak freeze for
 * next week. Light and dark, phone and desktop; screenshots in docs/stories/games-*.png and a
 * screen recording of the main moment (phone, light) in docs/stories/games-scratch.webm.
 */

type Mode = 'light' | 'dark'

/** One chai stall at its own pin (rural Karnataka: no other test shop nearby), with a menu. */
async function seedChaiStall(page: Page, name: string, at: { lat: number; lng: number }) {
  const business = {
    name,
    category: 'Chai stall',
    location: 'Jayanagar, Bengaluru',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    locally_made: true,
    payment_methods: ['UPI', 'cash'],
    reward_text: 'Free bun maska',
    stamps_needed: 8,
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
      { name: 'Cutting chai', price: 1500, unit: 'cup', category: 'Chai' },
      { name: 'Bun maska', price: 3000, unit: 'piece', category: 'Bakes' },
    ],
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

function recorder(mode: Mode) {
  return async (page: Page, step: string) => {
    await page.evaluate(async () => {
      await document.fonts.ready
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
    // GSAP timelines (bar fill, flame, prize pop) finish within about 1.5 s.
    await page.waitForTimeout(1600)
    await page.screenshot({
      path: `docs/stories/games-${test.info().project.name}-${mode}-${step}.png`,
      animations: 'disabled',
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      `S13/${step} (${mode})`,
    ).toEqual([])
  }
}

async function ownerSetsPerks(page: Page, mode: Mode, name: string) {
  await localOnly(page)
  await enter(page)
  const at = { lat: 12.3 + Math.random() * 0.4, lng: 76.2 + Math.random() * 0.4 }
  await seedChaiStall(page, name, at)
  const { qr } = await shareSigned(page)
  // The Customer page sheet holds the owner's thank-you perks: calm fields, one save.
  const perks = page.getByRole('region', { name: 'Thank-you perks' })
  await perks.scrollIntoViewIfNeeded()
  await perks.getByLabel('A scratch-card prize').fill('Free bun maska with any chai')
  await perks.getByLabel('On your third visit').fill('Third visit: half-price cutting chai')
  await perks.getByLabel('When you leave a tip').fill('Thanks for the tip: free biscuit')
  await perks.getByLabel('When you finish a set here').fill('Set finisher: masala chai on us')
  const saved = page.waitForResponse(
    (r) => /\/businesses\/[^/]+\/perks$/.test(r.url()) && r.request().method() === 'PUT',
  )
  await perks.getByRole('button', { name: 'Save perks' }).click()
  expect((await saved).ok()).toBe(true)
  if (test.info().project.name === 'phone' && mode === 'light')
    await page.screenshot({ path: 'docs/stories/games-owner-perks.png', animations: 'disabled' })
  return { qr, at }
}

async function customerContext(browser: Browser, mode: Mode, at: { lat: number; lng: number }) {
  const desktop = test.info().project.name === 'desktop'
  const record = !desktop && mode === 'light'
  const context = await browser.newContext({
    ...phone,
    viewport: desktop ? { width: 1440, height: 1000 } : phone.viewport,
    isMobile: !desktop,
    hasTouch: !desktop,
    colorScheme: mode === 'dark' ? 'light' : 'dark',
    permissions: ['geolocation'],
    geolocation: { latitude: at.lat, longitude: at.lng, accuracy: 15 },
    ...(record && { recordVideo: { dir: 'test-results/games-video', size: phone.viewport } }),
  })
  await context.addInitScript((appearance) => {
    const key = 'niva.starter.preferences'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ appearance }))
  }, mode)
  return { context, record }
}

/** Rub the foil like a finger would: a zigzag across the card. */
async function scratch(page: Page) {
  const foil = page.getByTestId('scratch-foil')
  await foil.scrollIntoViewIfNeeded()
  const box = (await foil.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  for (let row = 0; row < 6; row++) {
    const y = box.y + 15 + (row * (box.height - 30)) / 5
    await page.mouse.move(box.x + (row % 2 ? 10 : box.width - 10), y, { steps: 12 })
  }
  await page.mouse.up()
}

async function walk(customer: Page, qr: string, name: string, mode: Mode) {
  const evidence = recorder(mode)
  await localOnly(customer)
  const shopUrl = new URL(qr)
  shopUrl.search = ''
  await test.step('1 · the shop page: stamp card with 2 welcome stamps, thank-yous, odds', async () => {
    await customer.goto(shopUrl.toString())
    await expect(customer.getByRole('heading', { level: 1, name })).toBeVisible()
    // The card is prominent near the top: its progress counts the 2 welcome stamps.
    await expect(customer.getByRole('link', { name: /Stamp card · 2 of 10 stamps/ })).toBeVisible()
    const card = customer.getByRole('region', { name: 'Stamp card' })
    await expect(card).toContainText('Welcome stamps on us: 2')
    await expect(card.getByRole('img', { name: '2 of 10 stamps' })).toBeVisible()
    const thanks = customer.getByRole('region', { name: 'Thank-yous from this shop' })
    await expect(thanks).toContainText('Free bun maska with any chai')
    await expect(thanks).toContainText('On your third visit')
    await thanks.getByRole('button', { name: 'See the odds' }).click()
    await expect(thanks).toContainText('A perk from the shop')
    await card.scrollIntoViewIfNeeded()
    await evidence(customer, '1-shop')
  })
  await test.step('2 · scan the counter QR: stamp, then a scratch card', async () => {
    await customer.goto(qr)
    const moment = customer.getByRole('dialog')
    await expect(moment.getByRole('heading', { name: 'First try!' })).toBeVisible()
    await moment.getByRole('heading', { name: 'First try!' }).click()
    await expect(moment.getByText(/You helped the neighbourhood goal: 1 of 100/)).toBeVisible()
    await expect(moment.getByText(`Earned at ${name}`)).toBeVisible()
    await moment.getByRole('button', { name: 'See the odds' }).click()
    await expect(moment.getByText('Your very first card always wins +25 points.')).toBeVisible()
    await expect(moment.getByText('10%')).toBeVisible() // the shop's perk, published
    await evidence(customer, '2-stamp')
  })
  await test.step('3 · scratch the foil: the prize, decided on the server', async () => {
    const moment = customer.getByRole('dialog')
    const foil = customer.getByTestId('scratch-foil')
    expect(await foil.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none')
    const container = customer.getByTestId('scratch-card-foil-container')
    expect(await container.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none')
    expect(await container.evaluate((el) => getComputedStyle(el).overscrollBehavior)).toBe('none')
    await scratch(customer)
    const reveal = moment.getByRole('button', { name: /^Scratch card from/ })
    // A short rub may not clear enough foil; the Reveal button finishes it (keyboard path).
    if (await reveal.isVisible()) await reveal.click()
    await expect(moment.getByRole('status').filter({ hasText: '+25 bonus points' })).toBeVisible()
    await expect(moment.getByText('Added to your passport.')).toBeVisible()
    await evidence(customer, '3-scratch')
    await moment.getByRole('button', { name: 'Done' }).click()
    await expect(moment).toBeHidden()
  })
  await test.step('4 · passport: next reward, set progress, the neighbourhood goal', async () => {
    await customer.goto(`${shopUrl.origin}/explore/passport`)
    await expect(customer.getByRole('heading', { level: 1, name: 'Your passport' })).toBeVisible()
    // 50 for the first try + 25 from the scratch card.
    await expect(customer.getByText('225 more points to Regular')).toBeVisible()
    await expect(customer.getByText('Next reward')).toBeVisible()
    // The shop's stamp card outranks a badge (welcome stamps count: 8 needed, 1 scanned → 7 more).
    await expect(customer.getByText('7 more stamps → Free bun maska')).toBeVisible()
    const sets = customer.getByRole('region', { name: 'Collection sets' })
    const made = sets.getByRole('listitem').filter({ hasText: 'Locally made' })
    await expect(made.getByRole('img', { name: '1 of 3' })).toBeVisible()
    const chai = sets.getByRole('listitem').filter({ hasText: 'Chai trail' })
    await expect(chai.getByRole('img', { name: '1 of 4' })).toBeVisible()
    await evidence(customer, '4-passport')
    const coop = customer.getByRole('region', { name: 'Neighbourhood goal' })
    await expect(coop.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await expect(coop).toContainText('Your visits: 1')
    await expect(coop).toContainText('100 visits')
    await coop.scrollIntoViewIfNeeded()
    await evidence(customer, '5-coop')
    await sets.scrollIntoViewIfNeeded()
    await evidence(customer, '6-sets')
  })
  await test.step('5 · the streak: freeze next week ahead of a trip', async () => {
    const run = customer.getByRole('region', { name: 'Weekly streak: 1' })
    await run.scrollIntoViewIfNeeded()
    await expect(run.getByRole('img', { name: 'Freezes: 1' })).toBeVisible()
    await run.getByRole('button', { name: 'Freeze next week' }).click()
    await expect(run.getByRole('status')).toHaveText('Next week is frozen. Enjoy the break!')
    await expect(run.getByRole('img', { name: 'Freezes: 0' })).toBeVisible()
    await expect(run.getByRole('button', { name: 'Freeze next week' })).toHaveCount(0)
    await evidence(customer, '7-streak')
    // Every game explains itself in 3 steps.
    await run.getByRole('button', { name: 'How it works: Weekly streak' }).click()
    const how = customer.getByRole('dialog', { name: 'Weekly streak' })
    await expect(how.getByRole('listitem')).toHaveCount(3)
    await evidence(customer, '8-how')
    await how.getByRole('button', { name: 'Got it' }).click()
  })
  await test.step('6 · the scratch card was spent once: no card waiting, no double prize', async () => {
    await customer.reload()
    await expect(customer.getByText('225 more points to Regular')).toBeVisible()
    await expect(customer.getByRole('region', { name: 'Scratch card' })).toHaveCount(0)
  })
}

for (const mode of ['light', 'dark'] as const) {
  test(`S13 · stamp, scratch, prize, sets, the neighbourhood goal and a streak freeze (${mode})`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000)
    const name = `Chai Point ${Date.now().toString().slice(-5)}`
    const { qr, at } = await ownerSetsPerks(page, mode, name)
    const { context, record } = await customerContext(browser, mode, at)
    const customer = await context.newPage()
    try {
      const origin = new URL(qr).origin
      await customer.request.post(`${origin}/api/v1/customer/session`, {
        data: { name: 'Asha Rao' },
      })
      await walk(customer, qr, name, mode)
    } finally {
      await context.close()
      if (record) await customer.video()?.saveAs('docs/stories/games-scratch.webm')
    }
  })
}
