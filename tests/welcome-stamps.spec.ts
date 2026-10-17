import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, shareSigned } from './stories/support.js'

/**
 * The 2 welcome stamps count everywhere (owner decision, 17 Oct): after the first QR scan the
 * shop page's button, the stamp card and the passport all show the same number, from the
 * passport view's `stamps` field. Runs on the phone and desktop projects.
 */

async function seedShop(page: Page, name: string, at: { lat: number; lng: number }) {
  const business = {
    name,
    category: 'Bakery',
    location: 'Tiong Bahru, Singapore',
    currency: 'SGD',
    timezone: 'Asia/Singapore',
    reward_text: 'A free kaya bun',
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
  const shop = await apply({
    kind: 'business',
    revision: 0,
    geocode_confirmed: true,
    business,
    products: [],
  })
  await apply({
    kind: 'business',
    business_id: shop.id,
    revision: shop.revision,
    business: { ...business, ...at },
    products: [],
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

test('first scan: the shop button, the card and the passport show the same stamp count', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  const name = `Kaya Corner ${Date.now().toString().slice(-5)}`
  // Its own quiet pin, so no other test shop is nearby.
  const at = { lat: 1.2 + Math.random() * 0.1, lng: 103.7 + Math.random() * 0.1 }
  await seedShop(page, name, at)
  const { qr } = await shareSigned(page)

  const viewport = page.viewportSize()!
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    permissions: ['geolocation'],
    geolocation: { latitude: at.lat, longitude: at.lng, accuracy: 15 },
  })
  const customer = await context.newPage()
  try {
    await localOnly(customer)
    // Before any scan, the card already holds the 2 welcome stamps: 2 everywhere on the page.
    const shopUrl = new URL(qr)
    shopUrl.search = ''
    await customer.goto(shopUrl.toString())
    const button = customer.getByRole('link', { name: /^Stamp card · / })
    const card = customer.getByRole('region', { name: 'Stamp card' })
    await expect(button).toHaveText('Stamp card · 2 of 10 stamps')
    await expect(card.getByRole('status')).toHaveText('2 stamps')

    // The first scan (signed out): one verified stamp on top of the 2 welcome ones.
    await customer.goto(qr)
    const moment = customer.getByRole('dialog')
    await expect(moment.getByRole('button', { name: 'Done' })).toBeVisible()
    await moment.getByRole('button', { name: 'Done' }).click()
    await expect(moment).toBeHidden()
    await expect(button).toHaveText('Stamp card · 3 of 10 stamps')
    await expect(card.getByRole('status')).toHaveText('3 stamps')
    await expect(card.getByRole('img', { name: '3 of 10 stamps' })).toBeVisible()
    await expect(card).toContainText('7 more for A free kaya bun')

    // The passport counts the same card the same way.
    await customer.goto(`${shopUrl.origin}/explore/passport`)
    const tile = customer.getByRole('listitem').filter({ hasText: name })
    await expect(tile).toContainText('3 of 10 stamps')
    await expect(customer.getByText('7 more stamps → A free kaya bun')).toBeVisible()

    // Back on the shop page after a reload: still 3, not counted twice.
    await customer.goto(shopUrl.toString())
    await expect(button).toHaveText('Stamp card · 3 of 10 stamps')
    await expect(card.getByRole('status')).toHaveText('3 stamps')
  } finally {
    await context.close()
  }
})
