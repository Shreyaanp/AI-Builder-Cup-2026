import { expect, test, type Locator, type Page } from '@playwright/test'
import { enter, localOnly, shareSigned } from './stories/support.js'

const at = { lat: 12.97, lng: 77.59 }

async function seedShop(page: Page, name: string) {
  const business = {
    name,
    category: 'Bakery',
    location: 'Indiranagar, Bengaluru',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    reward_text: 'A free bun',
    stamps_needed: 8,
  }
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      revision: 0,
      geocode_confirmed: true,
      business,
      products: [
        { name: 'Kaya bun', price: 50, unit: 'piece', available: true, category: 'Bakery' },
      ],
    },
  })
  expect(prepared.ok(), await prepared.text()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok(), await approved.text()).toBe(true)
  const { business_id: id } = await approved.json()
  const update = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business_id: id,
      revision: 1,
      geocode_confirmed: true,
      business: { ...business, ...at },
      products: [],
    },
  })
  expect(update.ok(), await update.text()).toBe(true)
  const details = await update.json()
  const saved = await page.request.post(`/api/v1/proposals/${details.id}/approve`, {
    data: { digest: details.digest },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  expect(value).not.toBeNull()
  return value!
}

function overlaps(a: Awaited<ReturnType<typeof box>>, b: Awaited<ReturnType<typeof box>>) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

test('shop and passport controls never cover nearby or page titles at 360 and 390 px', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone widths are the subject.')
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  const name = `Overlap Bakery ${Date.now().toString().slice(-5)}`
  await seedShop(page, name)
  const { qr } = await shareSigned(page)
  const origin = new URL(qr).origin

  for (const width of [360, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      permissions: ['geolocation'],
      geolocation: { latitude: at.lat, longitude: at.lng, accuracy: 15 },
    })
    const phone = await context.newPage()
    try {
      await localOnly(phone)
      await phone.route('**/api/v1/discover/similar?**', (route) =>
        route.fulfill({
          json: {
            places: [
              {
                id: 'similar-fixture',
                name: 'Nearby Bakery',
                category: 'Bakery',
                distance_m: 300,
                open_now: true,
                demo_shop: true,
                currency: 'INR',
                photo_url: null,
              },
            ],
          },
        }),
      )

      await phone.goto('/explore/passport')
      const passportTitle = phone.getByRole('heading', { level: 1 })
      await expect(passportTitle).toBeVisible()
      const passportTitleBox = await box(passportTitle)
      for (const control of [
        phone.getByRole('banner').getByRole('button', { name: /Profile|Your profile|Account/i }),
        phone.getByRole('banner').getByRole('button', { name: /^Language/ }),
        phone.getByRole('banner').getByRole('button', { name: /Switch to (dark|light) mode/ }),
      ]) {
        await expect(control).toBeVisible()
        expect(
          overlaps(await box(control), passportTitleBox),
          `passport control overlaps at ${width}px`,
        ).toBe(false)
      }

      await phone.goto(`${origin}/explore/s/${new URL(qr).pathname.split('/').pop()}`)
      const shopTitle = phone.getByRole('heading', { level: 1, name })
      await expect(shopTitle).toBeVisible()
      const similarTitle = phone.getByRole('heading', { name: 'Similar nearby' })
      await expect(similarTitle).toBeVisible({ timeout: 30_000 })
      const chat = phone.getByRole('button', { name: 'Chat with the shop' })
      await expect(chat).toBeVisible()
      const chatBox = await box(chat)
      expect(
        overlaps(chatBox, await box(similarTitle)),
        `chat action overlaps Similar nearby at ${width}px`,
      ).toBe(false)
      expect(
        overlaps(chatBox, await box(shopTitle)),
        `chat action overlaps shop title at ${width}px`,
      ).toBe(false)
      const back = phone.getByRole('link', { name: 'Back' }).first()
      expect(
        overlaps(await box(back), await box(shopTitle)),
        `shop Back overlaps title at ${width}px`,
      ).toBe(false)
    } finally {
      await context.close()
    }
  }
})
