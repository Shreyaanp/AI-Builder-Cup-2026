import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { localOnly } from '../stories/support.js'

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
  locale: 'en-SG',
  timezoneId: 'Asia/Singapore',
})

async function seedTestShop(request: APIRequestContext, name: string) {
  await request.get('/api/v1/bootstrap')
  const me = await (await request.get('/api/v1/me')).json()
  await request.post('/api/v1/consent', {
    data: { version: me.legal_version, terms: true, privacy: true },
  })
  const business = {
    name,
    category: 'Bakery & Coffee',
    location: 'Tiong Bahru, Singapore',
    hours: '08:00–20:00',
    currency: 'SGD',
    stamps_enabled: true,
    stamps_needed: 6,
    reward_text: 'Free artisan pastry',
  }

  const proposed = await request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business,
      products: [{ name: 'Kopi C', price: 220, unit: 'cup' }],
    },
  })
  expect(proposed.ok()).toBe(true)
  const proposal = await proposed.json()
  const approved = await request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
  const id = (await approved.json()).business_id as string

  const shops = await (await request.get('/api/v1/businesses')).json()
  const target = shops.find((s: { id: string }) => s.id === id)
  await request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business_id: id,
      revision: target.revision,
      business: { ...business, lat: 1.285, lng: 103.827 },
      products: [],
    },
  }).then(async (res) => {
    const prop = await res.json()
    await request.post(`/api/v1/proposals/${prop.id}/approve`, { data: { digest: prop.digest } })
  })

  await request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })
  const qrKeyRes = await (await request.get(`/api/v1/businesses/${id}/qr-key`)).json()
  return { id, qrKey: qrKeyRes.key as string }
}

test.describe('Customer immersive flow on phone (390px)', () => {
  test.beforeEach(async ({ page, context }) => {
    await localOnly(page)
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 1.285, longitude: 103.827, accuracy: 15 })
    await page.addInitScript(() => {
      localStorage.setItem('niva.language.chosen', '1')
      localStorage.setItem('chalkboard.customer.journey', 'done')
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ appearance: 'light', language: 'en' }),
      )
    })
  })

  test('location → shop → follow → QR stamp → passport', async ({ page, request }) => {
    test.setTimeout(90_000)
    const uniqueShopName = `Tiong Bahru Delights ${Date.now().toString().slice(-4)}`
    const { id, qrKey } = await seedTestShop(request, uniqueShopName)

    // 1. Customer lands on /explore and sees active location
    await page.goto('/explore')
    await expect(page.locator('#ask-hello')).toBeVisible({ timeout: 15_000 })

    // Change location via PlaceSearch if desired, or verify location button
    const locationBtn = page.getByRole('button', { name: /Tiong Bahru|Nearby/i }).first()
    await expect(locationBtn).toBeVisible()

    // 2. Open shop detail page
    const shopUrl = `/explore/s/${id}`
    await page.goto(shopUrl)
    await expect(page.getByRole('heading', { name: uniqueShopName })).toBeVisible({
      timeout: 15_000,
    })

    // 3. Follow the shop
    const followBtn = page.getByRole('button', { name: new RegExp(`Follow ${uniqueShopName}`) })
    await expect(followBtn).toBeVisible()
    await followBtn.click()
    const unfollowBtn = page.getByRole('button', { name: new RegExp(`Unfollow ${uniqueShopName}`) })
    await expect(unfollowBtn).toBeVisible()
    await expect(unfollowBtn).toHaveAttribute('aria-pressed', 'true')

    // 4. Customer scans QR code (?source=qr&k=...)
    await page.goto(`${shopUrl}?source=qr&k=${qrKey}`)

    // Stamp moment dialog appears
    const momentDialog = page.getByRole('dialog')
    await expect(momentDialog).toBeVisible({ timeout: 15_000 })
    const doneBtn = momentDialog.getByRole('button', { name: 'Done' })
    await expect(doneBtn).toBeVisible()
    await doneBtn.click()
    await expect(momentDialog).toBeHidden()

    // 5. Navigate to passport and check stamp status
    await page.goto('/explore/passport')
    await expect(page.getByRole('heading', { name: /Passport/i })).toBeVisible({ timeout: 15_000 })

    // Shop item in passport should reflect stamps
    const passportItem = page.getByRole('listitem').filter({ hasText: uniqueShopName })
    await expect(passportItem).toBeVisible()
    await expect(passportItem).toContainText(/stamps|stamp/i)

    // Verify phone viewport has no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })
})
