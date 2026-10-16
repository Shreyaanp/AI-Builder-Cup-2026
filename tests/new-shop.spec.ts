import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  confirm,
  createShopFromReview,
  enter,
  image,
  localOnly,
  openNewShopReview,
  seedShop,
} from './stories/support.js'

// The full-screen new-shop flow: hero, a coach-led conversation, one review page, ready moment.
test.use({ reducedMotion: 'reduce' })
test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

async function audit(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  // Nothing in the flow is a modal, dialog or sheet.
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function begin(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText('What is your business called?')
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

for (const scheme of ['light', 'dark'] as const) {
  // Screenshots of every state (voice mode included) come from tests/new-shop-voice.spec.ts.
  test(`hero, conversation, review and ready pass axe (${scheme})`, async ({ page }) => {
    await page.addInitScript((appearance) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
    }, scheme)
    await enter(page)
    const capture = (step: string) => test.step(`audit ${step}`, () => audit(page))
    await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
    await expect(page).toHaveURL(/\/new-shop\?step=hero/)
    await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await capture('1-hero')
    await page.getByRole('button', { name: 'Let’s begin' }).click()
    await expect(page.getByRole('log')).toContainText('What is your business called?')
    await say(page, 'name: Market Chai; category: Tea stall')
    await expect(page.getByTestId('agent-action').last()).toContainText('Market Chai')
    await expect(page.getByTestId('shop-so-far')).toContainText('Market Chai')
    await expect(page.getByRole('log')).toContainText('Where is your shop?')
    await capture('2-chat')
    await page.getByRole('button', { name: 'Review my shop' }).click()
    await expect(page.getByTestId('new-shop-review')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Check your shop' })).toBeFocused()
    await capture('3-review')
    await page.getByRole('button', { name: 'Open my shop' }).click()
    await expect(page.getByRole('heading', { name: 'Your shop is ready' })).toBeFocused()
    await capture('4-ready')
    await page.getByRole('button', { name: 'Continue with my shop' }).click()
    await expect(page.getByRole('button', { name: 'Choose shop: Market Chai' })).toBeVisible()
  })
}

test('a menu photo in the chat: the coach says what it read and asks the actual name', async ({
  page,
}) => {
  await enter(page)
  await page.route('**/api/v1/photos?*', (route) =>
    route.fulfill({
      json: {
        status: 'nothing_to_propose',
        photo_kind: 'menu',
        proposal: null,
        extraction: {
          uncertain: ['Offline fixture: no model read this photo.'],
          business: { name: '', category: '', location: '', hours: '', phone: '' },
          products: [{ name: 'Chai', price: 15, unit: 'cup', category: 'Drinks' }],
        },
      },
    }),
  )
  await begin(page)
  // The camera card opens in the chat; a photo the owner already has goes in by upload.
  await page.getByRole('button', { name: 'Menu photo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
  await (await chooser).setFiles(await image(page))
  const actions = page.getByTestId('agent-action')
  await expect(actions.first()).toContainText('I read your menu: 1 item')
  // The menu is not evidence of a name: the owner supplies it explicitly.
  await expect(page.getByRole('log')).toContainText('What is your business called?')
  await say(page, 'name: Chai Corner')
  await expect(actions.last()).toContainText('Chai Corner')
  await page.getByRole('button', { name: 'Review my shop' }).click()
  const review = page.getByTestId('new-shop-review')
  await expect(review).toContainText('Chai Corner')
  await expect(review).toContainText('15.00 / cup')
  await expect(review).toContainText('Offline fixture: no model read this photo.')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  await createShopFromReview(page)
  // Gallery reuse stays an offer, never automatic.
  await expect(page.getByText('Add this photo to your shop gallery?')).toBeVisible()
})

test('a measured location is an action in the chat and is sealed for review', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 12.9718234, longitude: 77.6412345, accuracy: 20 })
  await enter(page)
  await begin(page)
  await say(page, 'name: Courtyard Chai; category: Tea stall')
  await expect(page.getByTestId('agent-action').last()).toContainText('Courtyard Chai')
  await page.getByRole('button', { name: 'My location' }).click()
  // The map opens in the chat at the measured point; nothing is saved until the owner confirms.
  const map = page.getByTestId('map-card')
  await expect(map).toContainText('Near Indiranagar')
  await expect(map).toContainText('within 20 m')
  await map.getByRole('button', { name: 'This is my shop' }).click()
  await expect(
    page.getByTestId('agent-action').filter({ hasText: 'Saved your location: Near Indiranagar' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Review my shop' }).click()
  const review = page.getByTestId('new-shop-review')
  await expect(review).toContainText('within 20 m')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  await createShopFromReview(page)
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  expect(shops[0].fields).toMatchObject({ lat: 12.9718234, lng: 77.6412345, pin_source: 'device' })
})

test('denied location: the coach says so in the chat; an address still works', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) =>
      failure?.({ code: 1 } as GeolocationPositionError)
  })
  await enter(page)
  await begin(page)
  await page.getByRole('button', { name: 'My location' }).click()
  await expect(page.getByRole('log')).toContainText('Location access was denied')
  await say(page, 'name: Corner Bakery; location: Katong; category: Bakery')
  await expect(page.getByTestId('agent-action').last()).toContainText('Katong')
  await page.getByRole('button', { name: 'Review my shop' }).click()
  const review = page.getByTestId('new-shop-review')
  await expect(review).toContainText('Katong')
  await review.getByRole('button', { name: /Find.*pin/i }).click()
  await expect(review).toContainText('Demo')
  await createShopFromReview(page)
  await expect(page.getByRole('button', { name: 'Choose shop: Corner Bakery' })).toBeVisible()
})

test('Back from the review returns to the same conversation, which carries on', async ({
  page,
}) => {
  await enter(page)
  await openNewShopReview(page, 'name: First Bakery; category: Bakery')
  await expect(page).toHaveURL(/step=review/)
  await page.goBack()
  await expect(page).toHaveURL(/step=chat/)
  await expect(page.getByRole('log')).toContainText('First Bakery')
  await say(page, 'name: Revised Bakery')
  await expect(page.getByTestId('agent-action').last()).toContainText('Revised Bakery')
  await page.getByRole('button', { name: 'Review my shop' }).click()
  await expect(page.getByTestId('new-shop-review')).toContainText('Revised Bakery')
  await createShopFromReview(page)
  await expect(page.getByRole('button', { name: 'Choose shop: Revised Bakery' })).toBeVisible()
})

test('header plus opens a separate draft; cancel restores the current shop draft', async ({
  page,
}) => {
  await enter(page)
  await seedShop(page)
  const before = await (await page.request.get('/api/v1/businesses')).json()
  await page.getByLabel('Message', { exact: true }).fill('Keep my daily draft')
  await page.getByRole('button', { name: 'Add shop details', exact: true }).click()
  await expect(page).toHaveURL(/\/new-shop/)
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Keep my daily draft')
  await page.getByRole('button', { name: /Choose shop/ }).click()
  await page.getByRole('menuitem', { name: 'New shop', exact: true }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText('What is your business called?')
  await say(page, 'name: Second Bakery; category: Bakery')
  await expect(page.getByTestId('agent-action').last()).toContainText('Second Bakery')
  await page.getByRole('button', { name: 'Review my shop' }).click()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual(before)
  await createShopFromReview(page)
  await expect(page.getByRole('button', { name: 'Choose shop: Second Bakery' })).toBeVisible()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(2)
})

test('shop details proposes a measured location without silently saving', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -6.2088, longitude: 106.8456, accuracy: 35 })
  await enter(page)
  await seedShop(page)
  const before = await (await page.request.get('/api/v1/businesses')).json()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await page.getByRole('button', { name: 'Use my current location' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('within 35 m')
  await expect(review).toContainText('Near Jakarta')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual(before)
  await confirm(page)
})
