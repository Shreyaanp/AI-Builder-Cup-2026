import { expect, test, type Locator, type Page } from '@playwright/test'
import { enter, localOnly, shareSigned } from './stories/support.js'

/**
 * The customer app as a phone app (owner brief, 17 Oct): at 390 px the front door leads with
 * big shop photos, every page's controls sit in a bar instead of floating over titles (#101),
 * the shop photo runs edge to edge, and a QR stamp slides up as a sheet and then lands on the
 * card. One shop, seeded by its owner, walked by a customer on a phone.
 */

const AT = { lat: 1.2 + Math.random() * 0.1, lng: 103.7 + Math.random() * 0.1 }

async function seedShop(page: Page, name: string) {
  const business = {
    name,
    category: 'Bakery',
    location: 'Tiong Bahru, Singapore',
    currency: 'SGD',
    timezone: 'Asia/Singapore',
    reward_text: 'A free kaya bun',
    stamps_needed: 8,
  }
  const products = [
    { name: 'Kaya toast', price: 250, unit: 'piece', available: true, category: 'Bakery' },
    { name: 'Kopi', price: 180, unit: 'cup', available: true, category: 'Drinks' },
  ]
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
    products,
  })
  await apply({
    kind: 'business',
    business_id: shop.id,
    revision: shop.revision,
    business: { ...business, ...AT },
    // Products are set once; a details update must not carry them.
    products: [],
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

/** True when two boxes share any area. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

test('customer app at 390 px: photos first, bars not floating, full-bleed shop, stamp sheet', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'phone', 'The phone layout is the subject.')
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  const name = `Kaya Corner ${Date.now().toString().slice(-5)}`
  await seedShop(page, name)
  const { qr } = await shareSigned(page)
  const origin = new URL(qr).origin

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    permissions: ['geolocation'],
    geolocation: { latitude: AT.lat, longitude: AT.lng, accuracy: 15 },
  })
  const c = await context.newPage()
  try {
    await localOnly(c)

    // Front door: the shops nearby are big photo cards in one swipeable row.
    await c.goto(`${origin}/explore/`)
    await c.getByRole('button', { name: 'Use my location' }).click()
    const nearby = c.getByRole('list', { name: 'Near you now' })
    const card = nearby.getByRole('link').filter({ hasText: name })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('img')).toBeVisible()
    const cardBox = await box(card)
    expect(cardBox.width).toBeGreaterThan(200)
    expect((await box(card.locator('img'))).width).toBeGreaterThan(200)
    expect(await nearby.evaluate((list) => getComputedStyle(list).flexDirection)).toBe('row')
    await noSideScroll(c)

    // Passport (#101): the controls live in the app bar, above the title, never over it.
    await c.goto(`${origin}/explore/passport`)
    const title = c.getByRole('heading', { level: 1 })
    await expect(title).toBeVisible()
    const bar = c.getByRole('banner')
    const controls = [
      bar.getByRole('button', { name: /Profile|Your profile|Account/i }).first(),
      bar.getByRole('button', { name: /^Language/ }),
      bar.getByRole('button', { name: /Switch to (dark|light) mode/ }),
    ]
    const titleBox = await box(title)
    for (const control of controls) {
      await expect(control).toBeVisible()
      expect(overlaps(await box(control), titleBox)).toBe(false)
    }
    expect(titleBox.y).toBeGreaterThanOrEqual((await box(bar)).y + (await box(bar)).height - 1)
    await noSideScroll(c)

    // The full list: Back sits in the same bar and goes home.
    await c.goto(`${origin}/explore/browse`)
    await expect(c.getByRole('heading', { name: 'What’s around me?' })).toBeVisible()
    await expect(
      c.getByRole('banner').getByRole('link', { name: 'Back', exact: true }),
    ).toBeVisible()
    await expect(c.getByRole('button', { name: 'Map view' })).toBeVisible()
    await noSideScroll(c)

    // Shop page: the photo runs edge to edge; Back sits in the bar above it with a 48px target; Follow
    // and the stamp card stay on screen.
    await c.goto(`${origin}/explore/s/${new URL(qr).pathname.split('/').pop()}`)
    const heading = c.getByRole('heading', { level: 1, name })
    await expect(heading).toBeVisible()
    const hero = await box(c.getByTestId('shop-hero-banner'))
    expect(hero.x).toBeLessThanOrEqual(0.5)
    expect(hero.width).toBeGreaterThanOrEqual(389)
    const back = await box(c.locator('a[aria-label="Back"]').first())
    expect(back.width).toBeGreaterThanOrEqual(48)
    expect(back.height).toBeGreaterThanOrEqual(48)
    const headingBox = await box(heading)
    expect(overlaps(back, headingBox)).toBe(false)
    // Back lives in a solid bar above the photo, never over it (#259).
    expect(back.y + back.height).toBeLessThanOrEqual(hero.y + 1)
    const follow = await box(c.getByRole('button', { name: /^Follow / }))
    const stamps = await box(c.getByRole('link', { name: /^Stamp card · / }))
    // They wrap onto a second line when they must, never cut at the screen edge (#259).
    for (const b of [follow, stamps]) expect(b.x + b.width).toBeLessThanOrEqual(390)
    await noSideScroll(c)

    // QR scan: the stamp moment slides up from the bottom edge; Done brings the card into
    // view with the new stamp on it.
    await c.goto(qr)
    const sheet = c.getByRole('dialog')
    const done = sheet.getByRole('button', { name: 'Done' })
    await expect(done).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => Math.round((await box(sheet)).y + (await box(sheet)).height))
      .toBe(844)
    await done.click()
    await expect(sheet).toBeHidden()
    const stampCard = c.getByRole('region', { name: 'Stamp card' })
    await expect(stampCard.getByRole('status')).toHaveText('3 stamps')
    await expect(stampCard).toBeInViewport()
  } finally {
    await context.close()
  }
})
