import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  enter,
  localOnly,
  confirm,
  seedShop,
  image,
  voiceFixture,
  tryVoice,
} from './stories/support.js'

test.use({ reducedMotion: 'reduce' })

test('a menu without a shop name keeps its items and lets the coach suggest the name', async ({
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
  await page.locator('#coach input[type=file]').setInputFiles(await image(page))
  await page.getByRole('button', { name: 'Review my new shop' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Chai Corner')
  await expect(review).toContainText('$15.00 / cup')
  await expect(review).toContainText('Offline fixture: no model read this photo.')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  await confirm(page)
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test('new shop starts with camera, voice and consented location in both themes', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 12.9718234, longitude: 77.6412345, accuracy: 19.2 })
  await voiceFixture(page)
  await enter(page)
  await expect(page.getByRole('button', { name: 'Tell me about your shop' })).toBeVisible()
  await page.evaluate(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
    navigator.geolocation.getCurrentPosition = (success, failure, options) => {
      Object.assign(window, { locationOptions: options })
      original(success, failure, options)
    }
  })
  await page.getByRole('button', { name: 'Use my current location' }).click()
  await expect(page.getByText('within 20 m')).toBeVisible()
  const options = await page.evaluate(() => Reflect.get(window, 'locationOptions'))
  expect(options).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  for (const mode of ['Light', 'Dark']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: mode, exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden()
    await page.getByRole('heading', { name: 'New shop', exact: true }).click()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    if (info.project.name === 'phone')
      await page.screenshot({
        path: `docs/stories/new-shop-${mode.toLowerCase()}.png`,
        animations: 'disabled',
      })
  }
  await tryVoice(page, 1)
  await page.locator('#coach input[type=file]').setInputFiles(await image(page))
  await page.getByRole('button', { name: 'Review my new shop' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Your location')
  await expect(review).toContainText('within 20 m')
  await expect(review).toContainText('12.97182, 77.64123')
  await expect(review).toContainText('Chai')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  if (info.project.name === 'phone')
    await page.screenshot({ path: 'docs/stories/new-shop-review-dark.png', animations: 'disabled' })
  await confirm(page)
  await expect(page.getByText('Your new shop is ready', { exact: true })).toBeVisible()
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  expect(shops).toHaveLength(1)
  expect(shops[0].fields).toMatchObject({
    lat: 12.9718234,
    lng: 77.6412345,
    pin_source: 'device',
    pin_accuracy_m: 19.2,
  })
})

test('denied location keeps text, camera, voice and address fallback available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) =>
      failure?.({ code: 1 } as GeolocationPositionError)
  })
  await enter(page)
  await page.getByRole('button', { name: 'Use my current location' }).click()
  await expect(page.getByRole('alert')).toContainText('Location access was denied')
  await expect(page.getByRole('button', { name: 'Snap your menu or shopfront' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Press to talk', exact: true })).toBeEnabled()
  await page
    .getByLabel('Message', { exact: true })
    .fill('name: Corner Bakery; location: Katong; category: Bakery')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Review my new shop' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Katong')
  await review.getByRole('button', { name: /Find.*pin/i }).click()
  await expect(review).toContainText('Demo')
  await confirm(page)
})

test('second shop has an isolated draft, cancels to current shop and switches only after approval', async ({
  page,
}) => {
  await enter(page)
  await seedShop(page)
  const before = await (await page.request.get('/api/v1/businesses')).json()
  const openNew = async () => {
    await page.getByRole('button', { name: /Choose shop/ }).click()
    await page.getByRole('menuitem', { name: 'New shop', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'New shop', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.getByLabel('Message', { exact: true }).fill('Keep my daily draft')
  await openNew()
  await page.getByRole('button', { name: 'Back to my current shop' }).click()
  await expect(
    page.getByRole('button', { name: `Choose shop: ${before[0].fields.name}` }),
  ).toBeVisible()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Keep my daily draft')
  await openNew()
  const turn = page.waitForRequest('**/coach/stream')
  await page.getByLabel('Message', { exact: true }).fill('name: Second Bakery; category: Bakery')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  expect((await turn).postDataJSON()).toMatchObject({ new_shop: true, business_id: null })
  await page.getByRole('button', { name: 'Review my new shop' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Second Bakery')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual(before)
  await confirm(page)
  await expect(page.getByRole('button', { name: 'Choose shop: Second Bakery' })).toBeVisible()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(2)
  await page.getByRole('button', { name: /Choose shop/ }).click()
  await page.getByRole('menuitem', { name: new RegExp(before[0].fields.name) }).click()
  await expect(
    page.getByRole('button', { name: `Choose shop: ${before[0].fields.name}` }),
  ).toBeVisible()
  expect(
    (await (await page.request.get('/api/v1/businesses')).json()).find(
      (shop: { id: string }) => shop.id === before[0].id,
    ),
  ).toEqual(before[0])
})

test('shop details proposes a fresh measured location without silently saving', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -6.2088, longitude: 106.8456, accuracy: 35 })
  await enter(page)
  await seedShop(page)
  const before = await (await page.request.get('/api/v1/businesses')).json()
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await page.getByRole('button', { name: 'Use my current location' }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('within 35 m')
  await expect(review).toContainText('-6.20880, 106.84560')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual(before)
  await confirm(page)
  const saved = await (await page.request.get('/api/v1/businesses')).json()
  expect(saved[0].fields).toMatchObject({ lat: -6.2088, lng: 106.8456, pin_source: 'device' })
})
