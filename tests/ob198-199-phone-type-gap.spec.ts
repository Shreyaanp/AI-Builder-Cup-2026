import { expect, test, type Page } from '@playwright/test'
import { nivaTheme } from '../src/design/theme.js'

// OB-198 (owner, 24 Oct): text a little smaller on phones in both apps, through the shared type
// scale; desktop unchanged. OB-199: the owner coach composer sits directly on the bottom bar.

const px = (rem: unknown) => parseFloat(String(rem)) * 16
const PHONE = '@media (max-width:599px)'
type Style = { fontSize: string; [query: string]: unknown }

test('OB-198: every type role is smaller or equal on phones, owner body 16px, nothing under 12px', () => {
  // Each role reads its size from a :root variable set under the phone query, with the larger
  // size as the fallback (a component's own sx size still wins over it).
  const theme = nivaTheme('light')
  const type = theme.typography as unknown as Record<string, Style>
  const css = (theme.components!.MuiCssBaseline as { styleOverrides: Record<string, Style> })
    .styleOverrides[':root']!
  const vars = css[PHONE] as Record<string, string>
  const sizes = (key: string) => {
    const match = /^var\((--type-\w+-size), (.+)\)$/.exec(String(type[key]?.fontSize))
    return match ? { phone: px(vars[match[1]!]), desktop: px(match[2]) } : undefined
  }
  const roles = Object.keys(type).filter((key) => sizes(key))
  // All 13 M3 roles plus body1, body2, button and caption.
  expect(roles.length).toBeGreaterThanOrEqual(17)
  for (const key of roles) {
    const { phone, desktop } = sizes(key)!
    expect(phone, key).toBeLessThanOrEqual(desktop)
    expect(phone, key).toBeGreaterThanOrEqual(12)
  }
  const phone = (key: string) => sizes(key)!.phone
  const desktop = (key: string) => sizes(key)!.desktop
  // Simplify batch 1: the owner app reads at 16px body and 14px labels on phones.
  expect(phone('bodyLarge')).toBe(16)
  expect(phone('bodyMedium')).toBe(16)
  expect(phone('body1')).toBe(16)
  expect(phone('labelLarge')).toBe(14)
  expect(phone('bodySmall')).toBe(14)
  expect(desktop('body1')).toBe(16)
  expect(phone('headlineSmall')).toBeLessThan(desktop('headlineSmall'))
  expect(phone('titleLarge')).toBeLessThan(desktop('titleLarge'))
  // Fields stay 16px: iOS zooms into smaller inputs. A fixed size, not a phone variable.
  const c = theme.components!
  const root = (k: keyof typeof c) =>
    (c[k] as { styleOverrides: { root: Style } }).styleOverrides.root
  for (const k of ['MuiInputBase', 'MuiInputLabel'] as const) {
    expect(root(k).fontSize, k).toBe('1rem')
    expect(px(root(k).fontSize), k).toBe(16)
  }
})

test('OB-198: the customer app keeps body 15px and labels 13px on phones', () => {
  const theme = nivaTheme('light', undefined, 'customer')
  const css = (theme.components!.MuiCssBaseline as { styleOverrides: Record<string, Style> })
    .styleOverrides[':root']!
  const vars = css[PHONE] as Record<string, string>
  expect(px(vars['--type-bodyLarge-size'])).toBe(15)
  expect(px(vars['--type-labelLarge-size'])).toBe(13)
})

async function openDemo(page: Page, width: number, appearance: string) {
  await page.context().setExtraHTTPHeaders({ 'x-test-rate-limit-bypass': '1' })
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript((appearance) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
    sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
  }, appearance)
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Demo shop · sample data', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone first')

  for (const appearance of ['light', 'dark'])
    for (const width of [360, 390, 412])
      test(`OB-199: coach composer sits on the bottom bar at ${width}px ${appearance}`, async ({
        page,
      }) => {
        await openDemo(page, width, appearance)
        const composer = page.locator('form[data-tour="composer"]')
        await expect(composer).toBeVisible()
        const nav = page.getByRole('navigation', { name: 'Main' })
        const gap = async () => {
          const bar = await nav.boundingBox()
          const form = await composer.boundingBox()
          return bar!.y - (form!.y + form!.height)
        }
        await expect.poll(gap).toBeGreaterThanOrEqual(-1)
        expect(await gap()).toBeLessThanOrEqual(1)
        // Owner phone text is 16px (simplify batch 1); the composer's controls keep 48px targets.
        expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px')
        for (const button of await composer.getByRole('button').all()) {
          const box = await button.boundingBox()
          expect(box!.height).toBeGreaterThanOrEqual(48)
        }
        // The message field stays 16px so iOS does not zoom in.
        await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCSS('font-size', '16px')
      })

  test('OB-198: the customer app uses the smaller phone body text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').getByRole('textbox').first()).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('15px')
    // A field label stays 16px, so when it floats (75%) it is still 12px. Since #554 the area field lives in the
    // sheet the Area chip opens.
    await page.getByRole('button', { name: /^Area: / }).click()
    await expect(page.getByRole('dialog').locator('label', { hasText: 'City or area' })).toHaveCSS(
      'font-size',
      '16px',
    )
  })
})

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop only')

  test('OB-198: desktop text is unchanged', async ({ page }) => {
    await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').getByRole('textbox').first()).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px')
  })
})
