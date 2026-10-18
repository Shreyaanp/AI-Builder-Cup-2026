import { expect, test } from '@playwright/test'
import { localOnly } from '../stories/support.js'

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test.describe('Try the demo shop flow on phone (390px)', () => {
  test('unauthenticated visitor opens /demo, inspects demo shop, browses shops, and exits demo', async ({
    page,
  }) => {
    test.setTimeout(90_000)

    // Intercept any unwanted real account calls
    const unauthorizedCalls: string[] = []
    page.on('request', (req) => {
      const path = new URL(req.url()).pathname
      if (
        path.startsWith('/api/') &&
        !path.startsWith('/api/v1/demo/') &&
        path !== '/api/v1/bootstrap' &&
        path !== '/api/v1/auth/session'
      ) {
        unauthorizedCalls.push(path)
      }
    })

    // Navigate to /demo
    await page.goto('/demo')

    // 1. Labelled demo banner
    const banner = 'Demo shop - nothing here is real'
    await expect(page.getByText(banner, { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(/\/demo$/)

    // 2. Interacting with edit triggers demo alert: "Demo only. Changes are turned off."
    const editBtn = page.locator('[data-tour="customer"] button').first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
      await expect(page.getByText('Demo only. Changes are turned off.', { exact: true })).toBeVisible()
    }

    // 3. Inspect demo menu
    const menuTile = page.locator('[data-tour="menu"]')
    await expect(menuTile).toBeVisible()
    await menuTile.click()
    const menuDialog = page.getByRole('dialog')
    await expect(menuDialog).toBeVisible()
    await expect(menuDialog.locator('li').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menuDialog).toHaveCount(0)

    // 4. Browse shops link in demo mode
    const browseLink = page.getByRole('link', { name: 'Browse shops', exact: true })
    await expect(browseLink).toBeVisible()
    await browseLink.click()

    // Demo browse shows shops
    await expect(page.locator('main a').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('main a').first().click()

    // Demo shop detail page opens with hero banner
    await expect(page.getByTestId('shop-hero-banner')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('main li').first()).toBeVisible()

    // 5. Check no horizontal overflow in demo
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )

    // 6. Exit demo button
    await page.getByRole('button', { name: 'Exit demo', exact: true }).click()
    await expect(page).toHaveURL(/\/explore\/$/)
  })
})
