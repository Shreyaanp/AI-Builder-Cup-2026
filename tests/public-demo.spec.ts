import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

test.setTimeout(60_000)

test.beforeEach(async ({ context }, info) => {
  // Separate visitors exercise the real allocation limit without sharing one test IP.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `demo-${info.testId}` })
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
})

for (const width of [360, 390, 412]) {
  for (const language of ['en', 'hi']) {
    for (const appearance of ['light', 'dark']) {
      test(`public demo ${width} ${language} ${appearance}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'phone', 'Phone flow')
        await page.setViewportSize({ width, height: 844 })
        await page.addInitScript(
          ({ language, appearance }) => {
            localStorage.setItem(
              'niva.starter.preferences',
              JSON.stringify({ language, appearance }),
            )
          },
          { language, appearance },
        )
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        const realApi: string[] = []
        page.on('request', (request) => {
          const path = new URL(request.url()).pathname
          // The public analytics config (no account data) is the one allowed call besides the demo.
          if (
            path.startsWith('/api/') &&
            !path.startsWith('/api/v1/demo/') &&
            path !== '/api/v1/bootstrap'
          )
            realApi.push(path)
        })
        await page.goto('/demo')
        const banner =
          language === 'en'
            ? 'Demo shop - nothing here is real'
            : 'डेमो दुकान - यहाँ कुछ भी असली नहीं है'
        await expect(page.getByText(banner, { exact: true })).toBeVisible({ timeout: 30_000 })
        await expect(page.locator('[data-tour="menu"]')).toBeVisible({ timeout: 15_000 })
        await expect(page).toHaveURL(/\/demo$/)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const edit = page.locator('[data-tour="customer"] button').first()
        await edit.click()
        await expect(
          page.getByText(
            language === 'en' ? 'Demo only. Changes are turned off.' : 'यह डेमो है। बदलाव बंद हैं।',
            { exact: true },
          ),
        ).toBeVisible()
        await page.locator('[data-tour="menu"]').click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByRole('dialog').locator('li').first()).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        if (width === 390) {
          await page.screenshot({
            path: `output/playwright/demo-owner-${language}-${appearance}.png`,
            fullPage: true,
          })
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
          expect(axe.violations).toEqual([])
        }
        await page
          .getByRole('link', {
            name: language === 'en' ? 'Browse shops' : 'दुकानें देखें',
            exact: true,
          })
          .click()
        await expect(page.locator('main a').first()).toBeVisible()
        await page.locator('main a').first().click()
        await expect(page.getByTestId('shop-hero-banner')).toBeVisible()
        await expect(page.locator('main li').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        if (width === 390) {
          await page.screenshot({
            path: `output/playwright/demo-customer-${language}-${appearance}.png`,
            fullPage: true,
          })
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
          expect(axe.violations).toEqual([])
        }
        expect(realApi).toEqual([])
        expect(errors).toEqual([])
        await page
          .getByRole('button', {
            name: language === 'en' ? 'Exit demo' : 'डेमो छोड़ें',
            exact: true,
          })
          .click()
        await expect(page).toHaveURL(/\/explore\/$/)
      })
    }
  }
}

test('demo expiry and allocation failure offer a retry', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await page.route('**/api/v1/demo/workspace?*', async (route) => {
    await route.fulfill({ json: { session_id: 'expired', expires_at: Date.now() / 1000 - 1 } })
  })
  await page.goto('/demo')
  await expect(page.getByText('This demo has ended. Try again.')).toBeVisible({ timeout: 30_000 })
  await page.route('**/api/v1/demo/workspace?*', (route) =>
    route.fulfill({ status: 429, json: { detail: 'RATE_LIMITED' } }),
  )
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('The demo could not open. Try again.')).toBeVisible()
})
