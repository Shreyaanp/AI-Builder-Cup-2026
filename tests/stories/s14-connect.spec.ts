import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { confirm, enter, localOnly, phone, reviewName, seedShop } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')

test('S14 · Connect your system (POS/ERP import, AI mapping, sync & review)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)

  // Step 1: Open My shop and open Connect sheet
  await test.step('1 · Open My shop and open Connect your system', async () => {
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    const connectTile = page.getByRole('button', { name: /Connect your system/i })
    await expect(connectTile).toBeVisible()
    await connectTile.click()

    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('tab', { name: /Upload/i })).toBeVisible()
    await expect(dialog.getByRole('tab', { name: /Paste/i })).toBeVisible()

    // Pick system (e.g. Petpooja)
    await dialog.getByRole('button', { name: 'Petpooja' }).click()

    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.screenshot({ path: 'docs/stories/connect-1-select.png', animations: 'disabled' })

    // Verify accessibility (Axe clean)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      'Connect sheet accessibility violations',
    ).toEqual([])
  })

  // Step 2: Paste data, analyze and view AI field mapping
  await test.step('2 · Paste data, analyze and view AI field mapping', async () => {
    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await dialog.getByRole('tab', { name: /Paste/i }).click()

    const sampleCsv = `Item Name,Rate,Category,Available Qty,Unit
Masala Chai,20.00,Beverages,50,cup
Filter Coffee,25.00,Beverages,40,cup
Bun Maska,35.00,Snacks,25,piece`

    const textarea = dialog.getByRole('textbox')
    await textarea.fill(sampleCsv)

    await dialog.getByRole('button', { name: /Analyze sample/i }).click()

    // Mapping view appears with confidence
    await expect(dialog.getByText('AI column mapping')).toBeVisible()
    await expect(dialog.getByText('Item Name', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Rate', { exact: true })).toBeVisible()

    // 1-tap change role
    const changeButtons = dialog.getByRole('button', { name: 'Change mapped field' })
    if ((await changeButtons.count()) > 0) {
      await changeButtons.first().click()
      await expect(dialog.getByText(/Select Chalkboard role/i)).toBeVisible()
      // Tap on a role chip in the picker
      await dialog.getByRole('button', { name: 'Stock count' }).last().click()
    }

    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.screenshot({ path: 'docs/stories/connect-2-mapping.png', animations: 'disabled' })
  })

  // Step 3: Diff and Preview
  await test.step('3 · View preview rows and diff summary', async () => {
    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(dialog.getByText(/Mapped preview/i)).toBeVisible()
    await expect(dialog.getByText(/Sync diff/i)).toBeVisible()

    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.screenshot({ path: 'docs/stories/connect-3-diff.png', animations: 'disabled' })

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      'Mapping review accessibility violations',
    ).toEqual([])
  })

  // Step 4: Confirm & Review proposal
  await test.step('4 · Confirm mapping and review import proposal', async () => {
    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await dialog.getByRole('button', { name: /Confirm & review import/i }).click()

    // Review proposal sheet opens before writing
    const reviewDialog = page.getByRole('dialog', { name: reviewName })
    await expect(reviewDialog).toBeVisible()
    await confirm(page)
  })

  // Step 5: Verify Saved mapping and Last Synced status
  await test.step('5 · Re-open connect sheet and verify saved mapping & last synced', async () => {
    const connectTile = page.getByRole('button', { name: /Connect your system/i })
    await expect(connectTile).toBeVisible()
    await connectTile.click()

    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Connected/i)).toBeVisible()
    await expect(dialog.getByText(/Last synced/i)).toBeVisible()

    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.screenshot({ path: 'docs/stories/connect-4-synced.png', animations: 'disabled' })

    await dialog.getByRole('button', { name: 'Close' }).first().click()
  })

  // Step 6: Coach entry point
  await test.step('6 · Coach attachment menu entry point', async () => {
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    const attachButton = page.getByRole('button', { name: 'Attach a photo or document' })
    await expect(attachButton).toBeVisible()
    await attachButton.click()

    const connectMenuItem = page.getByRole('menuitem', { name: 'Connect your system' })
    await expect(connectMenuItem).toBeVisible()
    await connectMenuItem.click()

    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).first().click()
  })

  // Step 7: Desktop responsive check
  await test.step('7 · Desktop responsive check', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    const connectTile = page.getByRole('button', { name: /Connect your system/i })
    await expect(connectTile).toBeVisible()
    await connectTile.click()

    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(dialog).toBeVisible()

    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.waitForTimeout(500)

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      'Desktop accessibility violations',
    ).toEqual([])

    await dialog.getByRole('button', { name: 'Close' }).first().click()
  })

  // Step 8: Dark mode check via in-app settings
  await test.step('8 · Dark mode check', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    const connectTile = page.getByRole('button', { name: /Connect your system/i })
    await expect(connectTile).toBeVisible()
    await connectTile.click()

    const dialog = page.getByRole('dialog', { name: 'Connect your system' })
    await expect(dialog).toBeVisible()

    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.waitForTimeout(500)

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      'Dark mode accessibility violations',
    ).toEqual([])

    await dialog.getByRole('button', { name: 'Close' }).first().click()
  })
})
