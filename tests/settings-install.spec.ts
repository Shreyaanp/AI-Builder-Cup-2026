import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.ts'

async function openOwner(page: Page) {
  await page.goto('/?app=business')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('button', { name: 'You', exact: true })).toBeVisible()
}

async function installPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'dismissed') {
  await page.evaluate((choice) => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, {
      prompt: async () => {
        document.documentElement.dataset.prompted = 'yes'
      },
      userChoice: Promise.resolve({ outcome: choice }),
    })
    window.dispatchEvent(event)
    document.documentElement.dataset.prevented = String(event.defaultPrevented)
  }, outcome)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('B36 You reuses the deferred prompt even after dismissing the banner', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chalkboard.business.installDismissed', '1'))
  await openOwner(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await installPrompt(page)
  const item = page.getByRole('button', { name: 'Install app', exact: true })
  await expect(item).toBeVisible()
  await expect(item).toBeEnabled()
  await page.screenshot({ path: 'docs/bugs/B36.png' })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await item.click()
  await expect(page.locator('html')).toHaveAttribute('data-prompted', 'yes')
  await expect(page.locator('html')).toHaveAttribute('data-prevented', 'true')
  await item.click()
  await expect(page.getByRole('dialog', { name: 'Install app' })).toContainText(
    'Installation is not available yet',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(item).toBeFocused()
  await installPrompt(page, 'accepted')
  await item.click()
  await expect(item).toHaveCount(0)
})

for (const installed of ['standalone', 'ios-standalone', 'appinstalled'] as const) {
  test(`B36 hides Install app when ${installed}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === 'ios-standalone') Object.defineProperty(navigator, 'standalone', { value: true })
      if (mode === 'standalone') {
        const original = window.matchMedia.bind(window)
        window.matchMedia = (query) => {
          const media = original(query)
          if (query === '(display-mode: standalone)')
            Object.defineProperty(media, 'matches', { value: true })
          return media
        }
      }
    }, installed)
    await openOwner(page)
    await page.getByRole('button', { name: 'You', exact: true }).click()
    await installPrompt(page)
    if (installed === 'appinstalled')
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')))
    await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0)
  })
}

test('B36 iOS Safari shows instructions and supports Back, Escape and focus return', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    }),
  )
  await openOwner(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  const install = page.getByRole('button', { name: 'Install app', exact: true })
  await install.click()
  const sheet = page.getByRole('dialog', { name: 'Install app' })
  await expect(sheet).toContainText('Share → Add to Home Screen')
  await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.screenshot({ path: 'docs/bugs/B36-ios.png' })
  await page.goBack()
  await expect(sheet).toHaveCount(0)
  await expect(install).toBeFocused()
  await install.click()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})

test('B36 install strings exist in all ten locales', async ({ page }) => {
  await page.goto('/?app=landing')
  const dictionaries = await page.evaluate(async () => {
    const source = '/src/features/v1/strings.ts'
    const registry = '/src/features/v1/locales/index.ts'
    const { en } = await import(source)
    const { loaders } = await import(registry)
    const translations = Object.fromEntries(
      await Promise.all(
        Object.entries(loaders).map(async ([locale, load]) => [
          locale,
          await (load as () => Promise<Record<string, string>>)(),
        ]),
      ),
    )
    return { en, ...translations } as Record<string, Record<string, string>>
  })
  for (const locale of LOCALES)
    for (const key of ['installApp', 'installIos', 'installUnavailable'])
      expect(dictionaries[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String))
})
