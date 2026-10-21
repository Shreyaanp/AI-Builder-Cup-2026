import { expect, test, type Locator } from '@playwright/test'
import { THEMES, VIEWPORTS } from './rules.js'

async function expectTarget(control: Locator) {
  await expect(control).toBeVisible()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(48)
  expect(box!.height).toBeGreaterThanOrEqual(48)
  return box!
}

for (const theme of THEMES) {
  for (const size of VIEWPORTS) {
    test(`OB-83: brand and legal targets ${size.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.addInitScript((appearance) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
      }, theme)
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )

      await page.goto('/?app=landing')
      const logo = page.locator('header').getByRole('link', { name: 'Chalkboard', exact: true })
      await expectTarget(logo)
      await expect(logo).toHaveAttribute('href', '/')

      await page.goto('/?app=business')
      for (const name of ['Terms', 'Privacy Notice']) {
        const control = page.getByRole('button', { name, exact: true })
        await control.scrollIntoViewIfNeeded()
        const box = await expectTarget(control)
        // The padded edge must activate the intended document, not just the text.
        await control.click({ position: { x: box.width / 2, y: 4 } })
        const dialog = page.getByRole('dialog', { name, exact: true })
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await control.focus()
        await expect(control).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(dialog).toHaveCount(0)
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true)
      await page.screenshot({
        path: test.info().outputPath('business-sign-in.png'),
        fullPage: true,
      })
    })
  }
}
