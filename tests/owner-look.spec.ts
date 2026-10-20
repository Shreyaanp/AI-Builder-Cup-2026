import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

async function savedAppearance(page: Page, appearance: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('chalkboard.owner.preferences') ?? '{}').appearance,
      ),
    )
    .toBe(appearance)
}

async function surface(page: Page) {
  return page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)
}

async function reloadOwner(page: Page) {
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'You', exact: true }).click()
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`OB-107: Look defaults to System and remembers it after reload (${colorScheme})`, async ({
        page,
      }, info) => {
        await localOnly(page)
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        // No appearance is seeded: exercise the same first-run default as a new owner.
        await enter(page)
        await page.getByRole('button', { name: 'You', exact: true }).click()
        const look = page.getByRole('group', { name: 'Look', exact: true })
        const system = look.getByRole('button', { name: 'System', exact: true })
        await expect(system).toHaveAttribute('aria-pressed', 'true')
        await savedAppearance(page, 'system')
        const firstRun = await surface(page)

        // Capture each explicit mode as an independent reference for the rendered theme.
        await look.getByRole('button', { name: 'Light', exact: true }).click()
        await savedAppearance(page, 'light')
        const light = await surface(page)
        await look.getByRole('button', { name: 'Dark', exact: true }).click()
        await savedAppearance(page, 'dark')
        const dark = await surface(page)
        expect(dark).not.toBe(light)
        expect(firstRun).toBe(colorScheme === 'dark' ? dark : light)

        await system.click()
        await savedAppearance(page, 'system')
        await expect.poll(() => surface(page)).toBe(colorScheme === 'dark' ? dark : light)
        await reloadOwner(page)
        await expect(system).toHaveAttribute('aria-pressed', 'true')
        await savedAppearance(page, 'system')
        await expect.poll(() => surface(page)).toBe(colorScheme === 'dark' ? dark : light)

        // System must keep following the device while the app is open, without another reload.
        await page.emulateMedia({ colorScheme: colorScheme === 'dark' ? 'light' : 'dark' })
        await expect.poll(() => surface(page)).toBe(colorScheme === 'dark' ? light : dark)
        await expect(system).toHaveAttribute('aria-pressed', 'true')
        await page.emulateMedia({ colorScheme })
        await expect.poll(() => surface(page)).toBe(colorScheme === 'dark' ? dark : light)
        await system.scrollIntoViewIfNeeded()
        await page.screenshot({ path: info.outputPath('look-system.png'), animations: 'disabled' })

        // Explicit choices remain pinned across reloads and changes to the device setting.
        for (const [label, expected] of [
          ['Light', light],
          ['Dark', dark],
        ] as const) {
          await look.getByRole('button', { name: label, exact: true }).click()
          await savedAppearance(page, label.toLowerCase())
          await reloadOwner(page)
          await expect(look.getByRole('button', { name: label, exact: true })).toHaveAttribute(
            'aria-pressed',
            'true',
          )
          await page.emulateMedia({ colorScheme: label === 'Dark' ? 'light' : 'dark' })
          await expect.poll(() => surface(page)).toBe(expected)
        }
      })
    }
  })
}
