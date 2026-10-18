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

test.describe('Trust strip on phone (390px)', () => {
  test('displays all trust chips, opens informative modal sheets, and links to support', async ({
    page,
  }) => {
    let supportUrl = 'https://wa.me/919876543210'
    let stripEnabled = true

    await page.route('**/api/v1/bootstrap', async (route) => {
      try {
        const response = await route.fetch()
        const data = await response.json()
        await route.fulfill({
          response,
          json: {
            ...data,
            trust_strip: {
              enabled: stripEnabled,
              support_whatsapp: supportUrl,
            },
          },
        })
      } catch {
        // Request aborted during reload
      }
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const strip = page.getByTestId('trust-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })

    // Verify 4 chips
    const chips = strip.getByRole('button')
    await expect(chips).toHaveCount(4)
    await expect(chips.first()).toHaveText('Free to start')

    // Tap each chip to verify its dialog sheet opens and closes
    for (let i = 0; i < 4; i++) {
      const chip = chips.nth(i)
      const bounds = await chip.boundingBox()
      expect(bounds?.height).toBeGreaterThanOrEqual(48)

      await chip.click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()

      if (i === 2) {
        await expect(sheet).toContainText('encrypted')
      }
      if (i === 3) {
        await expect(sheet.getByRole('link')).toHaveAttribute('href', supportUrl)
      }

      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
    }

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )

    // Verify strip drops 4th chip when support_whatsapp is empty
    supportUrl = ''
    await page.reload()
    await expect(strip.getByRole('button')).toHaveCount(3)

    // Verify strip is hidden when disabled
    stripEnabled = false
    await page.reload()
    await expect(page.getByTestId('trust-strip')).toHaveCount(0)
  })
})
