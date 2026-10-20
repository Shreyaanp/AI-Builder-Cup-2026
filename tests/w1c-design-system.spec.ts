import { expect, test } from '@playwright/test'
import { nivaTheme } from '../src/design/theme.js'

// Wave 1c: design system part 2. Theme-level checks run without a browser; the page checks are phone only.

const px = (rem: unknown) => parseFloat(String(rem)) * 16

test('OB-116 and OB-103: one type scale, body 16px, nothing under 12px', () => {
  const { typography: type } = nivaTheme('light')
  const sizes = (key: string) =>
    px((type as unknown as Record<string, { fontSize: string }>)[key].fontSize)
  expect(sizes('bodyLarge')).toBe(16)
  expect(sizes('bodyMedium')).toBe(16)
  expect(sizes('bodySmall')).toBeGreaterThanOrEqual(14)
  expect(sizes('labelMedium')).toBeGreaterThanOrEqual(14)
  expect(sizes('labelSmall')).toBeGreaterThanOrEqual(12)
  expect(px(type.body2.fontSize)).toBe(16)
  expect(px(type.caption.fontSize)).toBeGreaterThanOrEqual(14)
})

test('OB-115: switches, checkboxes, radios, toggles, labels and tappable chips are 48px', () => {
  const c = nivaTheme('light').components!
  const styles = (k: keyof typeof c) =>
    (c[k] as { styleOverrides: { root: Record<string, unknown> } }).styleOverrides.root
  expect(styles('MuiSwitch').height).toBe(48)
  expect(styles('MuiFormControlLabel').minHeight).toBe(48)
  expect(styles('MuiToggleButton').minHeight).toBe(48)
  // A 24px icon plus 12px padding each side.
  expect(styles('MuiCheckbox').padding).toBe(12)
  expect(styles('MuiRadio').padding).toBe(12)
  expect(styles('MuiChip')['&.MuiChip-clickable, &.MuiChip-deletable']).toEqual({ minHeight: 48 })
})

test('OB-100: dark mode tones illustrations down through one token', () => {
  const token = (mode: 'light' | 'dark') =>
    (
      nivaTheme(mode).components!.MuiCssBaseline!.styleOverrides as Record<
        string,
        Record<string, string>
      >
    )[':root']['--art-filter']
  expect(token('light')).toBe('none')
  expect(token('dark')).toContain('brightness(')
})

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone first')

  test('OB-100: illustrations are dimmed in dark and untouched in light', async ({ page }) => {
    for (const [scheme, dimmed] of [
      ['dark', true],
      ['light', false],
    ] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/explore/')
      const filter = await page.evaluate(async () => {
        const img = document.createElement('img')
        img.src = '/art/category-kopi.svg'
        document.body.append(img)
        return getComputedStyle(img).filter
      })
      expect(filter !== 'none').toBe(dimmed)
    }
  })

  // OB-126 (#423): the landing follows the phone's dark setting and offers a theme switch.
  for (const path of ['/?app=landing', '/?app=landing&landing=new']) {
    test(`OB-126: landing ${path} follows dark mode and has a theme switch`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
      await page.goto(path)
      const toLight = page.getByRole('button', { name: 'Switch to light mode' })
      await expect(toLight).toBeVisible()
      const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const dark = await bg()
      await toLight.click()
      await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
      expect(await bg()).not.toBe(dark)
    })
  }
})
