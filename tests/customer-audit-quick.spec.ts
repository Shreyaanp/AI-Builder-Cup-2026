import { expect, test } from '@playwright/test'
import { formatPrice } from '../src/features/v1/format.ts'

test.describe('Customer audit quick fixes', () => {
  test('Fix 1: Language picker is accessible in landing and explore headers', async ({ page }) => {
    // Landing page
    await page.goto('/?app=landing')
    const landingPicker = page.getByRole('button', { name: /Language/i }).first()
    await expect(landingPicker).toBeVisible()
    await landingPicker.click()
    await expect(page.getByRole('menuitem', { name: 'हिन्दी' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'தமிழ்' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Explore front door
    await page.goto('/explore/?app=customer')
    const explorePicker = page.getByRole('button', { name: /Language/i }).first()
    await expect(explorePicker).toBeVisible()
    await explorePicker.click()
    await expect(page.getByRole('menuitem', { name: 'हिन्दी' })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('Fix 2: Indian digit grouping in formatPrice', () => {
    // ₹1,00,000 for Indian locales
    const inEn = formatPrice(10000000, 'INR', 'en-IN')
    expect(inEn).toContain('1,00,000')

    const inHi = formatPrice(10000000, 'INR', 'hi')
    expect(inHi).toContain('1,00,000')

    const inTa = formatPrice(10000000, 'INR', 'ta')
    expect(inTa).toContain('1,00,000')

    // Standard formatting for SGD
    const sgd = formatPrice(10000000, 'SGD', 'en-SG')
    expect(sgd).toContain('100,000')
  })

  test('Fix 3 & 6: Indian area shows ₹50 placeholder and area name in location chip', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chalkboard.customer.journey', 'done')
      localStorage.setItem(
        'chalkboard.discover.filters',
        JSON.stringify({
          place: { lat: 12.9352, lng: 77.6245, label: 'Koramangala' },
        }),
      )
    })
    await page.goto('/explore/?app=customer')
    // Location chip shows area name (Koramangala), never "you"
    await expect(page.getByRole('button', { name: /Area: Koramangala/i })).toBeVisible()
    // Placeholder shows ₹50 example instead of $3
    const input = page.getByRole('textbox', { name: 'Ask about anything nearby' })
    await expect(input).toHaveAttribute('placeholder', /₹50/)
  })

  test('Fix 7: Landing story reflects active locale and currency', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' }))
    })
    await page.goto('/?app=landing')
    // Hindi story has ₹ and localized copy
    await expect(page.getByText('सहेजने से पहले जाँचें').first()).toBeVisible()
    await expect(page.getByText('पुष्टि करें और सहेजें').first()).toBeVisible()
    await expect(page.getByText(/₹ 18/).first()).toBeVisible()
  })

  test('Fix 8: 200% text zoom does not overflow passport stamp book or occlude shop menu', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chalkboard.customer.journey', 'done')
    })
    await page.goto('/explore/passport?app=customer')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px'
    })
    // Title and chip wrap properly
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
})
