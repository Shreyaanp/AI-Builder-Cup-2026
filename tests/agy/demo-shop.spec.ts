import { expect, test } from '@playwright/test'
import { localOnly } from '../stories/support.js'

test.use({
  reducedMotion: 'reduce',
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
  if (test.info().project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 })
})

test.describe('Try the demo shop flow', () => {
  test('OB-118 / OB-137: unauthenticated visitor opens /demo, browses a demo shop, and exits demo', async ({
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

    // 2. /demo is the full owner app: dismiss the welcome tour and see the owner navigation
    const welcome = page.getByRole('dialog')
    await expect(welcome.getByRole('button', { name: 'Skip' })).toBeVisible({ timeout: 30_000 })
    await welcome.getByRole('button', { name: 'Skip' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // 3. Inspect the demo owner app
    for (const id of ['coach', 'shop', 'grow', 'you'])
      await expect(page.locator(`[data-tour="nav-${id}"]`)).toBeVisible()

    // 4. Browse shops link in demo mode
    const browseLink = page.getByRole('link', { name: 'Browse shops', exact: true })
    await expect(browseLink).toBeVisible()
    await browseLink.click()

    // Demo browse shows shops
    await expect(page.locator('main a').first()).toBeVisible({ timeout: 15_000 })
    // Guided steps precede the shop cards and can lead outside the demo session. Choose an actual
    // demo shop so this flow remains in DemoApp, where the Exit demo control is available.
    const demoShop = page.locator('main a[href^="/explore/demo/"]').first()
    await expect(demoShop).toBeVisible({ timeout: 15_000 })
    await demoShop.click()
    await expect(page).toHaveURL(/\/explore\/demo\/demo-[a-z0-9-]+\/?$/)

    // Demo shop detail page opens with hero banner
    await expect(page.getByTestId('shop-hero-banner')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('main li').first()).toBeVisible()

    // 5. Check no horizontal overflow in demo
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )

    // 6. OB-118: the shared demo header must provide an accessible way out of shop details.
    const exit = page.getByRole('button', { name: 'Exit demo', exact: true })
    await expect(exit).toBeVisible()
    await expect(exit).toBeEnabled()
    expect(unauthorizedCalls).toEqual([])
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        /^\/api\/v1\/demo\/sessions\/[^/]+$/.test(new URL(response.url()).pathname),
    )
    if (test.info().project.name === 'desktop') {
      await exit.focus()
      await expect(exit).toBeFocused()
      await page.keyboard.press('Enter')
    } else await exit.click()
    expect((await deleted).ok()).toBe(true)
    await expect(page).toHaveURL(/\/explore\/$/)
    expect(
      await page.evaluate(() => sessionStorage.getItem('chalkboard.demo.session') === null),
    ).toBe(true)
    await expect(page.getByRole('button', { name: 'Exit demo', exact: true })).toHaveCount(0)
  })
})
