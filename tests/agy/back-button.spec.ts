import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from '../stories/support.js'

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test.describe('Back button behaviour on phone (390px)', () => {
  test('owner tabs preserve history across Back, Forward, and sub-pages', async ({ page }) => {
    test.setTimeout(120_000)
    await enter(page)
    await seedShop(page)
    await page.keyboard.press('Escape')

    // 1. Tab changes push history entries
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await expect(page).toHaveURL(/tab=shop/)

    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await expect(page).toHaveURL(/tab=grow/)

    // 2. Browser Back returns to Shop tab
    await page.goBack()
    await expect(page).toHaveURL(/tab=shop/)

    // 3. Browser Forward returns to Grow tab
    await page.goForward()
    await expect(page).toHaveURL(/tab=grow/)

    // 4. Sub-page navigates back to tab
    await page.getByRole('button', { name: /^Get on Google/ }).click()
    await expect(page).toHaveURL(/tab=google/)
    await page.goBack()
    await expect(page).toHaveURL(/tab=grow/)

    // 5. Open menu/dialog: Back closes the menu instead of navigating away
    await page.getByRole('button', { name: /^Choose shop/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(page).toHaveURL(/tab=grow/)

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('customer profile sheet closes on Back and shop page navigates back cleanly', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => {
      localStorage.setItem('niva.language.chosen', '1')
      localStorage.setItem('chalkboard.customer.journey', 'done')
    })

    await page.goto('/explore/')
    await expect(page.locator('#ask-hello')).toBeVisible({ timeout: 15_000 })

    // Open customer profile sheet
    await page
      .getByRole('button', { name: /profile/i })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Browser back closes the profile sheet
    await page.goBack()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page).toHaveURL(/\/explore\/?$/)

    // Open a shop and hit Back
    await page.goto('/explore/s/demo-courtyard-chai')
    await page.goBack()
    await expect(page).toHaveURL(/\/explore\/?(\?.*)?$/)

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })
})
