import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { confirm, enter, localOnly, reviewName, seedShop } from '../stories/support.js'

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

const posMenuCsv = fileURLToPath(
  new URL('../../backend/tests/fixtures/connect/pos_menu.csv', import.meta.url),
)
const petpoojaJson = fileURLToPath(
  new URL('../../backend/tests/fixtures/connect/petpooja_menu.json', import.meta.url),
)
const screenPhotoExcel = fileURLToPath(
  new URL('../../backend/tests/fixtures/screen-photos/excel/photo.png', import.meta.url),
)
const screenPhotoPetpooja = fileURLToPath(
  new URL('../../backend/tests/fixtures/screen-photos/petpooja/photo.png', import.meta.url),
)

test.describe('POS import flows on phone (390px)', () => {
  test('POS import via CSV file → column mapping → review → menu updated', async ({ page }) => {
    test.setTimeout(90_000)
    await enter(page)
    await seedShop(page)

    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /Connect your system/i }).click()

    const connectDialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(connectDialog).toBeVisible()

    // Pick Petpooja system
    await connectDialog.getByRole('button', { name: 'Petpooja', exact: true }).click()

    // Upload CSV menu file
    await connectDialog.getByTestId('connector-file').setInputFiles({
      name: 'pos-menu.csv',
      mimeType: 'text/csv',
      buffer: readFileSync(posMenuCsv),
    })

    // Column mapping appears
    await expect(connectDialog.getByRole('heading', { name: /Column mapping/i })).toBeVisible({
      timeout: 15_000,
    })
    await expect(connectDialog.getByText('Item name: Masala Dosa', { exact: true })).toBeVisible()

    // Confirm & review import
    await connectDialog.getByRole('button', { name: 'Confirm & review import' }).click()

    // Check before saving dialog
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toBeVisible()
    await expect(review).toContainText('Masala Dosa')
    await confirm(page)

    // Verify imported item appears in shop menu
    await page.getByRole('button', { name: /^Menu/ }).click()
    const menuDialog = page.getByRole('dialog', { name: 'Menu' })
    await expect(menuDialog).toContainText('Masala Dosa')

    // Check no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('POS import via JSON file (Petpooja export) → column mapping → review', async ({ page }) => {
    test.setTimeout(90_000)
    await enter(page)
    await seedShop(page)

    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /Connect your system/i }).click()

    const connectDialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(connectDialog).toBeVisible()

    await connectDialog.getByRole('button', { name: 'Petpooja', exact: true }).click()
    await connectDialog.getByTestId('connector-file').setInputFiles({
      name: 'petpooja_menu.json',
      mimeType: 'application/json',
      buffer: readFileSync(petpoojaJson),
    })

    // Column mapping for JSON
    await expect(connectDialog.getByRole('heading', { name: /Column mapping/i })).toBeVisible({
      timeout: 15_000,
    })
    await connectDialog.getByRole('button', { name: 'Confirm & review import' }).click()

    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toBeVisible()
    await confirm(page)

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('POS import via screen photo (photo of a screen/printout) → AI mapping → review', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await enter(page)
    await seedShop(page)

    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /Connect your system/i }).click()

    const connectDialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(connectDialog).toBeVisible()
    await expect(connectDialog.getByText('Take a photo of your screen or printout')).toBeVisible()

    // Supply screen photos via screen-gallery input
    await connectDialog
      .getByTestId('screen-gallery')
      .setInputFiles([screenPhotoExcel, screenPhotoPetpooja])
    await expect(connectDialog.getByRole('status')).toContainText('Photos selected: 2')

    // Click Read photos
    await connectDialog.getByRole('button', { name: 'Read photos', exact: true }).click()

    // Mapping review appears
    await expect(connectDialog.getByRole('heading', { name: /Column mapping/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      connectDialog.getByText('Sample photos only: no AI read these images.'),
    ).toBeVisible()

    // Confirm & review
    await connectDialog.getByRole('button', { name: 'Confirm & review import' }).click()
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toBeVisible()
    await expect(review).toContainText('Masala Dosa')
    await confirm(page)

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })
})
