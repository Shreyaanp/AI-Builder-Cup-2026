import { expect, test, type APIRequestContext } from '@playwright/test'
import { glideTo, localOnly, phone, relabelApi, warm } from './support.js'

// The customer's story on the real app (local preview, seeded demo world, a guest customer):
// ask for chai nearby → open the shop → scan its QR for a stamp → the passport.
const AT = { latitude: 12.9716, longitude: 77.641 }

/** Chai Corner, set up through the owner API as a real owner would (₹ prices, a stamp card). */
async function chaiCorner(request: APIRequestContext) {
  await request.get('/api/v1/bootstrap')
  const me = await (await request.get('/api/v1/me')).json()
  await request.post('/api/v1/consent', {
    data: { version: me.legal_version, terms: true, privacy: true },
  })
  const business = {
    name: 'Chai Corner',
    category: 'Tea stall',
    location: 'Indiranagar, Bengaluru',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    hours: '06:00–23:00',
    stamps_enabled: true,
    stamps_needed: 8,
    reward_text: 'A free chai',
    description: 'Ginger chai brewed fresh all day.',
  }
  async function apply(data: object) {
    const proposal = await (await request.post('/api/v1/proposals', { data })).json()
    const approved = await request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
    expect(approved.ok(), await approved.text()).toBe(true)
    return (await approved.json()).business_id as string
  }
  const id = await apply({
    kind: 'business',
    business,
    products: [
      { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Chai' },
      { name: 'Ginger chai', price: 2500, unit: 'cup', category: 'Chai' },
      { name: 'Bun maska', price: 3500, unit: 'piece', category: 'Snacks' },
      { name: 'Samosa', price: 2000, unit: 'piece', category: 'Snacks' },
    ],
  })
  const shops = await (await request.get('/api/v1/businesses')).json()
  await apply({
    kind: 'business',
    business_id: id,
    revision: shops.find((s: { id: string }) => s.id === id).revision,
    business: { ...business, lat: 12.9719, lng: 77.6413 },
    geocode_confirmed: true,
    products: [],
  })
  await request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })
  const qr = await (await request.get(`/api/v1/businesses/${id}/qr-key`)).json()
  return { id, key: qr.key as string }
}

test('customer', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000)
  const { id, key } = await chaiCorner(request)
  const { context, page, clock, cast } = await phone(browser, baseURL!, 'customer', {
    permissions: ['geolocation'],
    geolocation: { ...AT, accuracy: 10 },
  })
  await localOnly(page)
  await relabelApi(page, baseURL!)
  await warm(page, 'Use my location', '/explore/')
  await page.goto('/explore/')
  const composer = page.getByRole('search').getByRole('textbox')
  await expect(composer).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)

  // Four slow scenes a stranger can follow: ask → the shop → scan for a stamp → the passport.
  // 1. Ask for chai nearby: Chai Corner comes first.
  clock.start('find')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Use my location' }).click()
  await page.waitForTimeout(1500)
  await composer.click()
  await composer.pressSequentially('chai', { delay: 220 })
  await page.waitForTimeout(600)
  await composer.press('Enter')
  const result = page.locator(`a[href="/explore/s/${id}"]`).first()
  await expect(result).toBeVisible({ timeout: 15_000 })
  await glideTo(page, result)
  await clock.end(page, 3)

  // 2. Open the shop: the menu and prices, before walking over.
  clock.start('shop')
  await result.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Chai Corner' })).toBeVisible()
  await page.waitForTimeout(2200)
  await glideTo(page, page.getByText('Masala chai').first())
  await clock.end(page, 3)

  // 3. At the counter: scan the shop's QR (the camera opens the signed link) for a stamp.
  clock.start('scan')
  await page.goto(`/explore/s/${id}?source=qr&k=${encodeURIComponent(key)}`)
  const reveal = page.getByRole('button', { name: /^Scratch card from/ })
  await expect(reveal).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2600)
  await reveal.click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await clock.end(page, 1.2)

  // 4. The passport keeps every stamp; eight earn a free chai.
  await page.goto('/explore/passport')
  clock.start('passport')
  await expect(page.getByRole('heading', { name: 'Your passport' })).toBeVisible()
  await page.waitForTimeout(2200)
  await glideTo(page, page.getByText(/A free chai/).first())
  await clock.end(page, 3.2)

  clock.save('customer.json')
  await cast.finish()
  await context.close()
})
