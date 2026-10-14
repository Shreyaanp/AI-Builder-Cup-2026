import { expect, test } from '@playwright/test'
import {
  closeSheet,
  confirm,
  enter,
  image,
  localOnly,
  phone,
  seedShop,
  share,
  shot,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
for (const existing of [false, true]) {
  test(`A8 · coach photo reuse is explicit for ${existing ? 'existing' : 'new'} shops`, async ({
    page,
  }) => {
    await localOnly(page)
    await enter(page)
    if (existing) await seedShop(page)
    await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles(await image(page))
    await confirm(page)
    const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
    expect(shop.gallery ?? []).toEqual([])
    await expect(
      page.getByText('Add this photo to your shop gallery?', { exact: true }),
    ).toBeVisible()
    await shot(page, 1, `A8-${existing ? 'existing' : 'new'}-offer`)
    await page.getByRole('button', { name: 'Not now', exact: true }).click()
    expect((await (await page.request.get('/api/v1/businesses')).json())[0].gallery ?? []).toEqual(
      [],
    )
    await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles(await image(page))
    await confirm(page)
    await page.getByRole('button', { name: 'Add to gallery', exact: true }).click()
    await expect(
      page.getByText('Add this photo to your shop gallery?', { exact: true }),
    ).toHaveCount(0)
    expect((await (await page.request.get('/api/v1/businesses')).json())[0].gallery).toHaveLength(1)
    await page.getByRole('button', { name: 'Google', exact: true }).click()
    await page.getByRole('button', { name: 'Step 2 of 4: Photos' }).click()
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
  })
}

test('A8 · header and discovery use the first gallery photo with removal/error fallback', async ({
  page,
  context,
}) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page, true, `Photo shop ${Date.now()}`)
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const file = await image(page)
  const added = await (
    await page.request.post(`/api/v1/businesses/${shop.id}/gallery`, {
      headers: { 'Content-Type': file.mimeType },
      data: file.buffer,
    })
  ).json()
  const photo = `/api/v1/public/shops/${shop.id}/photos/${added.photo_id}.jpg`
  const url = await share(page)
  await closeSheet(page)
  const customer = await context.newPage()
  await localOnly(customer)
  await customer.goto(url)
  await expect(customer.locator(`img[src="${photo}"]`)).toBeVisible()
  await shot(customer, 3, 'A8-header')
  await customer.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await customer.goto(`/explore/browse/?area=Katong`)
  // Render actual discovery projection for this shop; avoid relying on a different city's fixtures.
  const discovery = await (
    await page.request.get('/api/v1/discover?lat=12.9718&lng=77.6412')
  ).json()
  await customer.route('**/api/v1/discover?*', (route) => route.fulfill({ json: discovery }))
  await customer.reload()
  await expect(customer.locator(`img[src="${photo}"]`).first()).toBeVisible()
  await shot(customer, 3, 'A8-discovery')
  await customer.route(`**${photo}`, (route) => route.fulfill({ status: 404 }))
  await customer.goto(url)
  await expect(customer.locator('main img[src^="/art/category-"]')).toBeVisible()
  await page.request.delete(`/api/v1/businesses/${shop.id}/gallery/${added.photo_id}`)
  await customer.reload()
  await expect(customer.locator('main img[src^="/art/category-"]')).toBeVisible()
  await shot(customer, 3, 'A8-fallback')
  expect((await page.request.get(photo)).status()).toBe(404)
})
