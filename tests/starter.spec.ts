import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'

async function settled(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    )
  })
}

test('coach, editing and independent review share state across destinations', async ({ page }) => {
  await page.goto('/?classic=1')
  await page.getByRole('button', { name: 'Try an example' }).click()
  await page.getByRole('button', { name: 'Tea & snacks', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Little Chai Corner' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Business', exact: true })
    .click()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByRole('textbox', { name: 'Business name' }).fill('The Quiet Chai Shop')
  await page.getByRole('button', { name: 'Apply corrections' }).click()
  await page.getByRole('button', { name: 'Review details' }).click()
  await expect(page.getByRole('dialog')).toContainText('The Quiet Chai Shop')
  await expect(page.getByRole('dialog')).toContainText('does not publish')
  await page.getByRole('button', { name: 'Confirm for this session' }).click()
  await expect(page.getByText('Reviewed in this session', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByRole('textbox', { name: 'Opening hours' }).fill('10 AM–4 PM')
  await page.getByRole('button', { name: 'Apply corrections' }).click()
  await expect(page.getByText('Private draft', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Coach', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'The Quiet Chai Shop' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Google publishing: not connected' })).toBeVisible()
})

test('large text and narrow viewport retain usable controls', async ({ page }) => {
  await page.goto('/?classic=1')
  await page.setViewportSize({ width: 320, height: 640 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await page
    .getByRole('textbox', { name: 'Your note', exact: true })
    .fill('We sell kopi and kaya toast.')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByText('We sell kopi and kaya toast.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
})

test('light, dark and editing dialog pass automated accessibility checks', async ({ page }) => {
  await page.goto('/?classic=1')
  await page.evaluate(() => document.fonts.ready)
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') await page.getByRole('button', { name: 'Use dark appearance' }).click()
    await settled(page)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
  await page.getByRole('button', { name: 'Edit details' }).click()
  await settled(page)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeFocused()
})

test('photos stay local, voice status is honest and no Google calls occur', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${process.env.WEB_PORT ?? 3200}`) &&
      !request.url().startsWith('blob:')
    )
      external.push(request.url())
  })
  await page.goto('/?classic=1')
  await page.locator('input[type=file]').setInputFiles({
    name: 'shop.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lxoAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByRole('img', { name: 'Add shop photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await expect(page.getByRole('img', { name: 'Add shop photo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Speak', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('connected separately')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Google publishing: not connected' }).click()
  await expect(page.getByRole('dialog')).toContainText('not connected')
  expect(external).toEqual([])
})

test('appearance persists while private business data does not', async ({ page }) => {
  await page.goto('/?classic=1')
  await page.getByRole('button', { name: 'Try an example' }).click()
  await page.getByRole('button', { name: 'Bakery', exact: true }).click()
  await page.getByRole('button', { name: 'Use dark appearance' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Use light appearance' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your business, coming together.' })).toBeVisible()
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(storage).not.toContain('Morning Crumb')
  expect(storage).not.toContain('Pune')
})

test('adaptive layout keeps navigation and content at boundary widths', async ({
  page,
}, testInfo) => {
  await page.goto('/?classic=1')
  for (const width of [360, 599, 600, 899, 900, 1200]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(page.getByRole('textbox', { name: 'Your note', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize(
    testInfo.project.name === 'phone' ? { width: 393, height: 851 } : { width: 1440, height: 1000 },
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('niva-starter.png'), fullPage: true })
})
