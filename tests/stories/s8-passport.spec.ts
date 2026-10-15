import { expect, test, type Page } from '@playwright/test'
import { closeSheet, enter, localOnly, phone, shareSigned, shot } from './support.js'

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

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test("S8 · Today's 7, a shop, the stamp moment and the passport", async ({ page, browser }) => {
  test.setTimeout(90_000)
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
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
    geolocation: { latitude: at.lat, longitude: at.lng, accuracy: 15 },
  })
  try {
    const customer = await context.newPage()
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
      await shot(customer, 8, 1)
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
      await shot(customer, 8, 2)
    })
    await test.step('3 · scanning the counter QR: the stamp moment', async () => {
      await customer.goto(qr)
      const moment = customer.getByRole('dialog')
      await expect(moment.getByRole('button', { name: 'Done' })).toBeVisible()
      await expect(moment.getByRole('progressbar')).toHaveCount(0)
      // A tap skips the celebration to its end state.
      await moment.getByRole('heading').first().click()
      await expect(moment.getByRole('heading', { name: 'First try!' })).toBeVisible()
      await expect(moment.getByText('+50 points')).toBeVisible()
      await expect(
        moment.getByText('Kept on this phone. Sign in to keep it everywhere.'),
      ).toBeVisible()
      await expect(moment.getByRole('button', { name: 'Sign in' })).toBeVisible()
      await shot(customer, 8, 3)
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
      await shot(customer, 8, '4-level')
      const book = customer.getByRole('region', { name: 'Stamp book' })
      await expect(book).toContainText(shopName)
      await book.scrollIntoViewIfNeeded()
      await shot(customer, 8, '4-book')
      const quests = customer.getByRole('region', { name: 'Quests' })
      await expect(quests.getByRole('heading', { name: 'Weekly breakthrough' })).toBeVisible()
      // The quests in order: this week's breakthrough has the one verified visit.
      await expect(quests.getByRole('progressbar', { name: '1 of 3' })).toHaveCount(1)
      await quests.scrollIntoViewIfNeeded()
      await shot(customer, 8, '4-quests')
    })
    await test.step('5 · a second scan the same day is honest', async () => {
      await customer.goto(qr)
      const moment = customer.getByRole('dialog')
      await expect(moment.getByRole('heading', { name: 'Already stamped today' })).toBeVisible()
      await shot(customer, 8, 5)
      await moment.getByRole('button', { name: 'Done' }).click()
      await expect(
        customer.getByRole('region', { name: 'Stamp card' }).getByRole('status'),
      ).toHaveText('1 stamps')
    })
  } finally {
    await context.close()
  }
})
