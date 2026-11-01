import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

test.use({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function fits(page: Page) {
  await noOverflow(page)
  const dialog = page.getByRole('dialog')
  const info = ((await dialog.count()) ? dialog : page)
    .getByTestId('ai-info')
    .filter({ visible: true })
  await expect(info).toHaveCount(1)
  const bounds = await info.getByRole('button').boundingBox()
  expect(bounds!.height).toBeGreaterThanOrEqual(48)
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360)
}

async function explain(page: Page, feature: string, provider: string) {
  const info = page.locator(`[data-testid="ai-info"][data-feature="${feature}"]`)
  await fits(page)
  await info.getByRole('button').click()
  const sheet = page.getByRole('dialog', { name: 'How this works' })
  await expect(sheet).toContainText(provider)
  await noOverflow(page)
  const bounds = await sheet.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360)
  await page.screenshot({ path: test.info().outputPath(`${feature}-360.png`) })
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  )
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet).not.toBeVisible()
  await expect(info.getByRole('button')).toBeFocused()
  await fits(page)
}

test('360px: AI help stays contextual across setup, Today, chat and imports', async ({ page }) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await fits(page)
  await explain(page, 'voice', 'Gemini Live')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.route('**/api/v1/businesses/*/today', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      json: { ...(await response.json()), forecast: { item: 'Kopi', quantity: 30, unit: 'cup' } },
    })
  })
  await seedShop(page)
  await expect(page.getByTestId('today-pulse')).toBeVisible()
  await explain(page, 'forecast', 'based on how your shop sold in recent weeks')
  await page.getByTestId('today-pulse').click()
  await expect(page.getByRole('log')).toContainText('I received your note')
  await explain(page, 'coach', 'Gemini with ADK agents')
  await page.screenshot({ path: test.info().outputPath('coach-360.png') })

  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true })
  await menu.getByRole('button', { name: 'How this works' }).click()
  await expect(menu).toContainText('Gemini vision')
  await expect(menu).toContainText('Document AI')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await fits(page)
  await menu.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: /Link your billing app/i }).click()
  const connect = page.getByRole('dialog', { name: 'Link your billing app' })
  await connect.getByRole('button', { name: 'How this works' }).click()
  await expect(connect).toContainText('Gemini vision')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await fits(page)
})

test('360px: Ask explains Maps once across repeated place answers', async ({ page }) => {
  test.setTimeout(60_000)
  await localOnly(page)
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({
        place: { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' },
      }),
    )
  })
  await page.route('**/api/v1/discover/ask', (route) =>
    route.fulfill({
      json: {
        intent: { keywords: ['tea'], followups: [], sort: 'best' },
        mode: 'ai',
        groups: [],
        area: { status: 'ok', text: 'Sample nearby places.', sources: [] },
      },
    }),
  )
  await page.goto('/explore/')
  const composer = page.getByRole('textbox', { name: 'Ask about anything nearby' })
  await composer.fill('tea nearby')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await explain(page, 'places', 'Google Maps')
  await composer.fill('more tea')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await fits(page)
})

test('360px: Hindi help uses Hindi copy and closes with Escape', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await page.evaluate(() =>
    localStorage.setItem(
      'niva.starter.preferences',
      JSON.stringify({
        language: 'hi',
        appearance: 'dark',
      }),
    ),
  )
  await page.reload()
  await page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें' }).click()
  await page.getByRole('banner').getByRole('button', { name: 'दुकान की जानकारी जोड़ें' }).click()
  const info = page.getByTestId('ai-info')
  await fits(page)
  await info.getByRole('button', { name: 'यह कैसे काम करता है' }).click()
  const sheet = page.getByRole('dialog', { name: 'यह कैसे काम करता है' })
  await expect(sheet).toContainText('Gemini Live से आप कोच से बात कर सकते हैं')
  await noOverflow(page)
  await page.screenshot({ path: test.info().outputPath('hindi-dark-360.png') })
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(info.getByRole('button')).toBeFocused()
  for (const width of [390, 412, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await info.getByRole('button').click()
    await expect(sheet).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`hindi-dark-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(sheet).not.toBeVisible()
  }
})
