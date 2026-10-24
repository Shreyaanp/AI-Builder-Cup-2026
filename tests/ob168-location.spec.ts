import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { missingForListing } from '../src/features/v1/goLive.js'
import { enter, localOnly } from './stories/support.js'

test('OB-168 listing requires both coordinates, not just a place name', () => {
  const business = { name: 'Chai', category: 'Tea', location: 'MG Road' }
  expect(missingForListing({ business })).toEqual(['location'])
  expect(missingForListing({ business: { ...business, lat: 12.9 } })).toEqual(['location'])
  expect(missingForListing({ business: { ...business, lat: 12.9, lng: 77.6 } })).toEqual([])
})

async function checkSavedShopPin(page: Page, width: number, appearance: 'light' | 'dark') {
  await localOnly(page)
  await page.addInitScript((appearance) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
  }, appearance)
  await enter(page)
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: {
        name: `Pin repair ${crypto.randomUUID().slice(0, 8)}`,
        category: 'Tea',
        location: 'Madhavpur',
      },
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
  await page.route('**/api/v1/places/pin?*', (route) =>
    route.fulfill({ json: { lat: 12.9716, lng: 77.6412, label: 'Madhavpur' } }),
  )
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: 'Customer page', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Customer page', exact: true })
  await expect(sheet).toContainText('Add your location so customers can find you.')
  await expect(sheet.getByRole('switch')).toHaveCount(0)
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `output/ob168/saved-shop-${width}-${appearance}.png` })
  await sheet.getByRole('button', { name: 'This is my shop', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving', exact: true })
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Confirm and save', exact: true }).click()
  await expect(review).toHaveCount(0)
  await page.getByRole('button', { name: 'Customer page', exact: true }).click()
  await expect(sheet.getByRole('switch', { name: 'Share customer page' })).toBeVisible()
}

for (const [width, height] of [
  [360, 800],
  [390, 844],
  [412, 915],
  [1280, 800],
]) {
  for (const appearance of ['light', 'dark'] as const) {
    test.describe(`saved shop ${width} ${appearance}`, () => {
      test.use({ viewport: { width, height }, reducedMotion: 'reduce' })
      test('OB-168 a saved shop without a pin offers location confirmation before sharing', async ({
        page,
      }) => {
        await checkSavedShopPin(page, width, appearance)
      })
    })
    test.describe(`${width} ${appearance}`, () => {
      test.use({
        viewport: { width, height },
        locale: 'hi',
        timezoneId: 'UTC',
        reducedMotion: 'reduce',
      })
      test('OB-168 Hindi place name is confirmed before the shop becomes discoverable', async ({
        page,
      }) => {
        const shopName = `परीक्षण किराना ${crypto.randomUUID().slice(0, 8)}`
        await localOnly(page)
        await page.addInitScript((appearance) => {
          localStorage.setItem(
            'niva.starter.preferences',
            JSON.stringify({ language: 'hi', appearance }),
          )
        }, appearance)
        // Local geocoder fixture: a Hindi place-name suggestion, not an automatic saved pin.
        await page.route('**/api/v1/places/pin?*', async (route) => {
          expect(new URL(route.request().url()).searchParams.get('q')).toBe('माधवपुर')
          expect(route.request().headers()['x-app-language']).toBe('hi')
          await route.fulfill({ json: { lat: 21.27, lng: 69.97, label: 'माधवपुर' } })
        })
        await page.goto('/')
        await page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें' }).click()
        await page.getByLabel('मैं शर्तों से सहमत हूँ').check()
        await page.getByLabel('मैंने गोपनीयता सूचना पढ़ी है').check()
        await page.getByRole('button', { name: 'सहमत होकर आगे बढ़ें' }).click()
        await page
          .getByRole('banner')
          .getByRole('button', { name: 'दुकान की जानकारी जोड़ें' })
          .click()
        await page.getByRole('button', { name: 'शुरू करें', exact: true }).click()
        const message = page.getByLabel('संदेश', { exact: true })
        await expect(message).toBeEnabled()
        await message.fill(`name: ${shopName}; category: किराना; location: माधवपुर`)
        await page.getByRole('button', { name: 'भेजें', exact: true }).click()
        const map = page.getByTestId('map-card')
        await expect(map.getByTestId('pin-map')).toBeVisible()
        await expect(map).toContainText('जगह जोड़ें ताकि ग्राहक आपको ढूँढ सकें।')
        expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
        const confirm = map.getByRole('button', { name: 'यही मेरी दुकान है', exact: true })
        await expect(confirm).toBeEnabled()
        await confirm.scrollIntoViewIfNeeded()
        const box = await confirm.boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(48)
        expect(box!.y + box!.height).toBeLessThanOrEqual(height)
        const credit = await map.getByRole('link', { name: 'OpenStreetMap' }).boundingBox()
        expect(credit?.height).toBeGreaterThanOrEqual(48)
        expect(credit?.width).toBeGreaterThanOrEqual(48)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect(
          (
            await new AxeBuilder({ page })
              .include('[data-testid="map-card"]')
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
              .analyze()
          ).violations,
        ).toEqual([])
        await page.screenshot({ path: `output/ob168/map-${width}-${appearance}.png` })
        await confirm.click()
        await expect(map).toHaveAttribute('data-state', 'done')
        await expect
          .poll(async () => (await (await page.request.get('/api/v1/businesses')).json()).length)
          .toBe(1)
        const [shop] = await (await page.request.get('/api/v1/businesses')).json()
        expect(shop.public).toBe(true)
        expect(shop.fields).toMatchObject({
          lat: 21.27,
          lng: 69.97,
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        })
        const discovery = await (
          await page.request.get('/api/v1/discover?lat=21.27&lng=69.97&currency=INR')
        ).json()
        expect(discovery.places).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: shop.id })]),
        )
      })
    })
  }
}
