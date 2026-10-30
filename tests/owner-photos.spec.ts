import { expect, test, type Page } from '@playwright/test'
import { ownerTools } from './owner-tools-support.js'

const fixture = 'scripts/impact/fixtures/bakery.png'

test.setTimeout(120_000)
test.use({ actionTimeout: 30_000 })
const slow = { timeout: 45_000 }

async function openPhotos(page: Page) {
  await ownerTools(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Photos/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Photos' })
  await expect(sheet).toBeVisible()
  return sheet
}

for (const width of [360, 390, 412]) {
  test(`#482 #481 photos are grouped by kind and say which one is the cover (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    const sheet = await openPhotos(page)
    const picker = sheet.locator('input[type=file]:not([capture])')

    // Add to "Shop front" (the default), then to "Menu".
    await picker.setInputFiles(fixture)
    const front = sheet.getByRole('region', { name: 'Shop front' })
    await expect(front.getByRole('heading', { name: 'Shop front · 1' })).toBeVisible(slow)
    await sheet.getByRole('radio', { name: 'Menu', exact: true }).click()
    await picker.setInputFiles(fixture)
    const menu = sheet.getByRole('region', { name: 'Menu' })
    await expect(menu.getByRole('heading', { name: 'Menu · 1' })).toBeVisible(slow)

    // The first photo is the cover customers see; the note says where each is used.
    await expect(front.getByTestId('cover-photo')).toBeVisible()
    await expect(menu.getByTestId('cover-photo')).toHaveCount(0)
    await expect(
      sheet.getByText(/first photo customers see, on your shop page and in search/),
    ).toBeVisible()

    // Targets stay at least 48px tall on a phone.
    for (const target of [
      sheet.getByRole('radio', { name: 'Menu', exact: true }),
      menu.getByRole('button', { name: 'Make photo 2 the cover' }),
    ])
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(48)

    // Making the menu photo the cover moves the cover label to it.
    await menu.getByRole('button', { name: 'Make photo 2 the cover' }).click()
    await expect(menu.getByTestId('cover-photo')).toBeVisible(slow)
    await expect(front.getByTestId('cover-photo')).toHaveCount(0)

    // Phone rules: nothing wider than the screen, targets reachable.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [360, 390, 412]) {
  test(`#586 OB-219 a photo can be moved to another group (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const sheet = await openPhotos(page)
    const picker = sheet.locator('input[type=file]:not([capture])')
    await picker.setInputFiles(fixture)
    const front = sheet.getByRole('region', { name: 'Shop front' })
    await expect(front.getByRole('heading', { name: 'Shop front · 1' })).toBeVisible(slow)

    const move = front.getByRole('button', { name: 'Move photo 1 to another group' })
    expect((await move.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await move.click()
    const menuItem = page.getByRole('menuitem', { name: 'Menu', exact: true })
    // The menu is still scaling in, so check the target's own height, not its animated box.
    await expect(menuItem).toHaveCSS('min-height', '48px')
    await menuItem.click()

    const menu = sheet.getByRole('region', { name: 'Menu' })
    await expect(menu.getByRole('heading', { name: 'Menu · 1' })).toBeVisible(slow)
    await expect(sheet.getByRole('region', { name: 'Shop front' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('#374 replacing the shop icon never draws the old picture while the new one loads', async ({
  page,
}) => {
  await ownerTools(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  const icon = page.getByTestId('shop-icon')
  await expect(icon).toBeVisible()
  const picker = icon.locator('input[type=file]')
  const shown = icon.getByRole('img', { name: 'Shop icon' })

  await picker.setInputFiles(fixture)
  await expect(shown).toBeVisible(slow)
  const first = await shown.getAttribute('src')

  // Hold the replacement's picture back: until it arrives the old (revoked) address must not show.
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/businesses/*/icon/*.jpg', async (route) => {
    await gate
    await route.continue()
  })
  await picker.setInputFiles(fixture)
  await expect(icon.getByText('Saving your icon…')).toHaveCount(0, slow)
  await expect(shown).toHaveCount(0)
  release()
  await expect(shown).toBeVisible(slow)
  expect(await shown.getAttribute('src')).not.toBe(first)
  expect(await shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})
