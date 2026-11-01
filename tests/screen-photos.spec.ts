import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { confirm, enter, localOnly, reviewName, seedShop } from './stories/support.js'

const photo = (name: string) =>
  fileURLToPath(
    new URL(`../backend/tests/fixtures/screen-photos/${name}/photo.png`, import.meta.url),
  )

test('phone photos → merged rows → mapping review → explicit confirmation', async ({ page }) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /Link your billing app/i }).click()
  const connect = page.getByRole('dialog', { name: 'Link your billing app' })
  await expect(connect.getByText('Take a photo of your screen or printout')).toBeVisible()
  await expect(connect.getByTestId('screen-camera')).toHaveAttribute('capture', 'environment')
  await connect.getByTestId('screen-gallery').setInputFiles([photo('excel'), photo('petpooja')])
  await expect(connect.getByRole('status')).toContainText('Photos selected: 2')
  await connect.getByRole('button', { name: 'Read photos', exact: true }).click()
  await expect(connect.getByRole('heading', { name: 'Column mapping' })).toBeVisible()
  await expect(connect.getByText('Unclear rows were left out.', { exact: false })).toBeVisible()
  await expect(connect.getByText('Currency: INR')).toBeVisible()
  await expect(connect.getByText('Sample photos only: no AI read these images.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'output/playwright/screen-photos-review.png', fullPage: true })
  const business = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const inventory = async () =>
    (await (await page.request.get(`/api/v1/businesses/${business.id}/inventory`)).json()) as {
      name: string
    }[]
  expect((await inventory()).some((item) => item.name === 'Masala Dosa')).toBe(false)
  await connect.getByRole('button', { name: 'Confirm & review import' }).click()
  const review = page.getByRole('dialog', { name: reviewName })
  await expect(review).toContainText('Masala Dosa')
  await expect(review).toContainText('Mango Lassi')
  await expect(review).not.toContainText('Cut-off item')
  expect((await inventory()).some((item) => item.name === 'Masala Dosa')).toBe(false)
  await confirm(page)
  expect((await inventory()).some((item) => item.name === 'Masala Dosa')).toBe(true)
})

test('unreadable photo keeps a retry path and file upload', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /Link your billing app/i }).click()
  const connect = page.getByRole('dialog', { name: 'Link your billing app' })
  await connect.getByTestId('screen-gallery').setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('unreadable'),
  })
  await connect.getByRole('button', { name: 'Read photos', exact: true }).click()
  await expect(connect.getByRole('alert')).toContainText('Couldn’t read these photos.')
  await expect(connect.getByRole('button', { name: 'Read photos', exact: true })).toBeEnabled()
  await expect(connect.getByRole('button', { name: 'Upload file', exact: false })).toBeEnabled()
  await connect.getByRole('button', { name: 'Clear photos', exact: true }).click()
  await expect(connect.getByText('Photos selected:', { exact: false })).toHaveCount(0)
})
