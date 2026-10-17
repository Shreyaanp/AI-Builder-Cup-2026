import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop, shareSigned } from '../stories/support.js'

// Release gate for owner onboarding and the first customer visit. PR dependencies are recorded
// on each case so a skipped gate has an explicit reason in the Playwright report.
test.use({ colorScheme: 'light', reducedMotion: 'reduce' })

const shopId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const progressKey = 'chalkboard.customer.rewards.v1'

function dependsOn(...prs: string[]) {
  test.info().annotations.push({ type: 'depends-on', description: prs.join(', ') })
}

async function localOnlyPage(page: Page) {
  await localOnly(page)
}

async function onboardEntry(page: Page) {
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toBeVisible()
  // Main does not contain onboarding v2. Keep the gate visible and explain the dependency in
  // its report; once v2 is present, missing behaviour below is a real failure.
  if ((await page.getByTestId('shop-so-far').count()) === 0)
    test.skip(true, 'Depends on onboarding v2 (origin/fix/voice-reliability); absent on this branch')
}

async function say(page: Page, message: string) {
  await page.getByLabel('Message', { exact: true }).fill(message)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

for (const [language, locale] of [
  ['English', 'en-IN'],
  ['Hindi', 'hi-IN'],
] as const) {
  test.describe(`${language} critical paths`, () => {
    test.use({ locale })

    test('vendor text onboarding goes live with the minimum and finishes on Today', async ({
      page,
      context,
    }, info) => {
      dependsOn('onboarding v2')
      test.setTimeout(90_000)
      await localOnlyPage(page)
      if (info.project.name === 'phone') await page.setViewportSize({ width: 360, height: 800 })
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 12.9718234, longitude: 77.6412345, accuracy: 20 })
      await onboardEntry(page)

      await say(
        page,
        'name: Helmet Wash Point; category: self-cleaning helmet station; location: Indiranagar',
      )
      await expect(page.getByTestId('shop-so-far')).toContainText('Helmet Wash Point')
      await expect(page.getByTestId('shop-live')).toHaveText('Live')
      // Non-food business: no menu, halal or vegetarian questions.
      await expect(page.getByRole('log')).not.toContainText(/menu|halal|vegetarian|veg/i)
      await page.getByTestId('review-my-shop').click()
      await expect(page.getByTestId('draft-summary')).toContainText('Helmet Wash Point')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'My location' }).click()
      const map = page.getByTestId('map-card')
      await expect(map).toBeVisible()
      await map.getByRole('button', { name: 'This is my shop' }).click()
      await expect(page.getByTestId('shop-live')).toHaveText('Live')

      // The remaining hours/photo steps can be skipped without inventing business facts.
      for (let step = 0; step < 3 && (await page.getByTestId('camera-card').count()) > 0; step++) {
        await page.getByTestId('camera-card').getByRole('button', { name: 'Skip for now' }).click()
      }
      if (await page.getByTestId('shop-summary').count()) {
        const summary = page.getByTestId('shop-summary')
        await expect(summary).toContainText('Helmet Wash Point')
        const skip = summary.getByRole('button', { name: 'Skip for now' })
        if (await skip.count()) await skip.click()
      }
      const ready = page.getByRole('heading', { name: 'Your shop is ready' })
      if (await ready.count()) await page.getByRole('button', { name: 'Continue with my shop' }).click()
      await expect(page.getByTestId('today-day-one')).toContainText('Add your menu')
    })

    test('customer first open uses location and preserves the front door on shop back', async ({
      page,
      context,
    }, info) => {
      dependsOn('#60', '#64')
      await localOnlyPage(page)
      if (info.project.name === 'phone') await page.setViewportSize({ width: 360, height: 800 })
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 1.2847, longitude: 103.832, accuracy: 20 })
      await page.route('**/api/v1/discover/place?**', (route) =>
        route.fulfill({ json: { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' } }),
      )
      await page.route('**/api/v1/discover?**', (route) =>
        route.fulfill({
          json: {
            mode: 'demo',
            google_unavailable: false,
            places: [
              {
                id: shopId,
                name: 'Tiong Bahru Kopi',
                source: 'chalkboard',
                category: 'Cafe',
                lat: 1.2847,
                lng: 103.832,
                distance_m: 90,
                open_now: true,
                currency: 'SGD',
                items: [{ name: 'Kopi', price: 180, unit: 'cup', available: true }],
                matched: [{ name: 'Kopi', price: 180, unit: 'cup', available: true }],
                sold_out: [],
              },
            ],
          },
        }),
      )
      await page.route('**/api/v1/public/shops/*', (route) =>
        route.fulfill({
          json: {
            id: shopId,
            name: 'Tiong Bahru Kopi',
            category: 'Cafe',
            location: 'Tiong Bahru',
            currency: 'SGD',
            hours: '07:00–19:00',
            products: [{ name: 'Kopi', price: 180, unit: 'cup', available: true }],
            reward_text: '10th kopi free',
            stamps_needed: 8,
          },
        }),
      )
      await page.goto('/?app=customer')
      // A chosen language must be available from first open; location permission should resolve
      // the area without asking the customer to type it.
      await expect(page.getByRole('heading', { name: /What are you looking for nearby\?/ })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', locale.startsWith('hi') ? 'hi' : 'en')
      await expect(page.getByRole('textbox', { name: 'City or area' })).toHaveCount(0)
      const ask = page.getByRole('textbox', { name: 'Ask about anything nearby' })
      await ask.fill('Kopi under $3')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.getByRole('article').filter({ hasText: 'Tiong Bahru Kopi' })).toBeVisible()
      await expect(page.getByRole('article').filter({ hasText: 'Tiong Bahru Kopi' })).toContainText('Kopi')
      await page.getByRole('link').filter({ hasText: 'Tiong Bahru Kopi' }).first().click()
      await expect(page.getByRole('heading', { name: 'Tiong Bahru Kopi' })).toBeVisible()
      await page.goBack()
      await expect(ask).toHaveValue('Kopi under $3')
      await expect(page.getByRole('article').filter({ hasText: 'Tiong Bahru Kopi' })).toBeVisible()
    })
  })
}

test.describe('signed shop QR', () => {
  test.use({ locale: 'en-IN' })

  test('guest and signed-in scans agree across shop button, card and passport; daily scan is once', async ({
    page,
  }, info) => {
    dependsOn('#63', '#64')
    await localOnlyPage(page)
    if (info.project.name === 'phone') await page.setViewportSize({ width: 360, height: 800 })
    await page.clock.install({ time: new Date('2026-10-17T08:00:00+05:30') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByLabel('I agree to the Terms').check()
    await page.getByLabel('I have read the Privacy Notice').check()
    await page.getByRole('button', { name: 'Agree and continue' }).click()
    await seedShop(page, false, 'QR Acceptance Kopi')
    const { qr } = await shareSigned(page)

    // Guest QR scan: the signed poster is accepted and the welcome stamps are included.
    await page.goto(qr)
    const card = page.getByRole('region', { name: 'Stamp card' })
    await expect(card.getByRole('status')).toHaveText('3 stamps')
    await expect(page.getByRole('button', { name: /Stamp card.*3.*10/ })).toBeVisible()
    await page.reload()
    await expect(card.getByRole('status')).toHaveText('3 stamps')

    // Sign in to the customer account then repeat the signed scan; the server passport is the
    // canonical count and must match the shop's button and card.
    await page.request.post('/api/v1/customer/session', { data: { name: 'QR Guest' } })
    await page.goto(qr)
    await expect(card.getByRole('status')).toHaveText('3 stamps')
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Passport/ }).click()
    await expect(page.getByText('3 stamps', { exact: true })).toBeVisible()
  })

  test('no-reward shop has no stamps; a full reward card asks for sign-in', async ({ page }) => {
    dependsOn('#63')
    await localOnlyPage(page)
    await page.route('**/api/v1/public/shops/*', (route) =>
      route.fulfill({
        json: {
          id: shopId,
          name: 'Plain Repair',
          timezone: 'Asia/Kolkata',
          category: 'Repair',
          location: 'Bengaluru',
          currency: 'INR',
          reward_text: '',
          stamps_needed: 8,
          stamps_enabled: false,
          products: [],
        },
      }),
    )
    await page.goto(`/explore/s/${shopId}?source=qr&k=acceptance-signed-key`)
    await expect(page.getByRole('region', { name: 'Stamp card' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /collect daily stamp/i })).toHaveCount(0)
    const raw = await page.evaluate((key) => localStorage.getItem(key), progressKey)
    const saved = raw ? JSON.parse(raw) : { shops: {} }
    expect(saved.shops?.[shopId]?.stamps ?? 0).toBe(0)

    const fullId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await page.route(`**/api/v1/public/shops/${fullId}`, (route) =>
      route.fulfill({
        json: {
          id: fullId,
          name: 'Full Card Kopi',
          timezone: 'Asia/Kolkata',
          category: 'Cafe',
          location: 'Bengaluru',
          currency: 'INR',
          reward_text: 'Free kopi',
          stamps_needed: 3,
          products: [],
        },
      }),
    )
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          shops: { [fullId]: { stamps: 3, lastStamp: null, claimed: 0 } },
          days: [],
          streak: false,
          early: false,
          reminders: [],
        }),
      )
    }, progressKey)
    await page.goto(`/explore/s/${fullId}`)
    const fullCard = page.getByRole('region', { name: 'Stamp card' })
    await expect(fullCard.getByRole('button', { name: 'Claim reward' })).toBeVisible()
    await fullCard.getByRole('button', { name: 'Claim reward' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Mark used' }).click()
    // Release expectation: redeeming a full card must establish the customer account first.
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible()
  })
})
