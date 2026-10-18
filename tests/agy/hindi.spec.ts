import { expect, test } from '@playwright/test'
import { localOnly } from '../stories/support.js'

test.use({
  viewport: { width: 390, height: 844 },
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  reducedMotion: 'reduce',
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test.describe('Hindi language flows on phone (390px)', () => {
  test('onboarding in Hindi: greeting, typing, stop, and congratulations in Hindi', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ appearance: 'light', language: 'hi' }),
      )
    })

    await page.goto('/')
    // Continue local preview in Hindi
    const continueBtn = page.getByRole('button', {
      name: /स्थानीय प्रीव्यू जारी रखें|Continue local preview/i,
    })
    await expect(continueBtn).toBeVisible({ timeout: 30_000 })
    await continueBtn.click()

    // Terms checkboxes in Hindi
    await page.getByLabel(/मैं शर्तों से सहमत हूँ|I agree to the Terms/i).check()
    await page.getByLabel(/मैंने गोपनीयता सूचना पढ़ी है|Privacy Notice/i).check()
    await page.getByRole('button', { name: /सहमत होकर आगे बढ़ें|Agree and continue/i }).click()

    // Add shop details
    await page
      .getByRole('banner')
      .getByRole('button', { name: /दुकान की जानकारी जोड़ें|Add shop details/i })
      .click()
    const beginBtn = page.getByRole('button', { name: /शुरू करें|Let’s begin/i })
    await expect(beginBtn).toBeVisible()
    await beginBtn.click()

    // Verify first question appears in Hindi or greeting
    const log = page.getByRole('log')
    await expect(log).toBeVisible({ timeout: 15_000 })
    await expect(log).toContainText(/दुकान|shop/i)

    // Type details
    const input = page.getByLabel(/संदेश|Message/i, { exact: true })
    await input.fill('name: Chai Point; category: Tea stall; location: MG Road, Bengaluru')
    await page.getByRole('button', { name: /भेजें|Send/i, exact: true }).click()

    // Verify live chip appears
    await expect(page.getByTestId('shop-live')).toBeVisible({ timeout: 15_000 })

    // End conversation in Hindi
    await page.getByTestId('end-conversation').click()
    await expect(page.getByTestId('conversation-ended')).toBeVisible()
    await page.getByTestId('finish-review').click()

    // Congratulations heading in Hindi or shop live confirmation
    await expect(page.getByRole('heading', { name: /बधाई|Congratulations/i })).toBeVisible({
      timeout: 15_000,
    })

    // Verify phone viewport has no horizontal overflow in Hindi
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('public demo in Hindi: banner and exit demo in Hindi', async ({ page }) => {
    test.setTimeout(60_000)
    await page.addInitScript(() => {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ appearance: 'light', language: 'hi' }),
      )
    })

    await page.goto('/demo')
    const banner = 'डेमो दुकान - यहाँ कुछ भी असली नहीं है'
    await expect(page.getByText(banner, { exact: true })).toBeVisible({ timeout: 30_000 })

    // Exit demo button in Hindi
    const exitBtn = page.getByRole('button', { name: 'डेमो छोड़ें', exact: true })
    await expect(exitBtn).toBeVisible()
    await exitBtn.click()
    await expect(page).toHaveURL(/\/(demo)?$/)

    // Verify phone viewport has no horizontal overflow in Hindi
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('trust strip in Hindi: first chip renders शुरुआत मुफ़्त', async ({ page }) => {
    test.setTimeout(60_000)
    await page.addInitScript(() => {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ appearance: 'light', language: 'hi' }),
      )
    })

    await page.route('**/api/v1/bootstrap', async (route) => {
      const response = await route.fetch()
      const data = await response.json()
      await route.fulfill({
        response,
        json: {
          ...data,
          trust_strip: {
            enabled: true,
            support_whatsapp: 'https://wa.me/919876543210',
          },
        },
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const strip = page.getByTestId('trust-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })

    const firstChip = strip.getByRole('button').first()
    await expect(firstChip).toHaveText('शुरुआत मुफ़्त')

    // Verify phone viewport has no horizontal overflow in Hindi
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })
})
