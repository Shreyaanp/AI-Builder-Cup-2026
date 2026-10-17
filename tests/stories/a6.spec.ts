import { expect, test } from '@playwright/test'
import {
  confirm,
  enter,
  gpsBoardPath,
  localOnly,
  phone,
  reviewName,
  seedShop,
  shot,
  sortAsMenu,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
test('A6 · an existing shop reviews menu and photo pin separately', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  const before = (await (await page.request.get('/api/v1/businesses')).json())[0]
  await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles(gpsBoardPath)
  await sortAsMenu(page)
  await expect(page.getByRole('dialog', { name: reviewName })).toContainText('Chai')
  await confirm(page)
  expect(
    (await (await page.request.get('/api/v1/businesses')).json())[0].fields.lat ?? null,
  ).toBeNull()
  await expect(page.getByText(/This photo also has a location/)).toBeVisible()
  await shot(page, 1, 'A6-offer')
  await page.getByRole('button', { name: 'Review photo location' }).click()
  await expect(page.getByRole('dialog', { name: reviewName })).toContainText('12.97180, 77.64120')
  await shot(page, 1, 'A6-review')
  // Another owner action makes this exact review stale; approval must preserve the pin.
  const current = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const edit = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business_id: current.id,
        revision: current.revision,
        business: { ...current.fields, phone: '+919876543210' },
      },
    })
  ).json()
  expect(
    (
      await page.request.post(`/api/v1/proposals/${edit.id}/approve`, {
        data: { digest: edit.digest },
      })
    ).ok(),
  ).toBe(true)
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed or expired')
  expect(
    (await (await page.request.get('/api/v1/businesses')).json())[0].fields.lat ?? null,
  ).toBeNull()
  expect(before.fields.lat ?? null).toBeNull()
  await expect(page.getByRole('button', { name: 'Confirm and save' })).toBeEnabled()
  // The review's own Cancel is its way out on every window size.
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Review photo location' }).click()
  await expect(page.getByRole('dialog', { name: reviewName })).toContainText('+919876543210')
  await confirm(page)
  expect((await (await page.request.get('/api/v1/businesses')).json())[0].fields.lat).toBeCloseTo(
    12.9718,
  )
})
