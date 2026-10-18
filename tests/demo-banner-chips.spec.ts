import { expect, test } from '@playwright/test'

for (const width of [360, 412]) {
  test(`${width}px: slim demo banner; Prep plan opens the real forecast`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 844 })
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `banner-${info.testId}` })
    await page
      .context()
      .route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      )
    await page.goto('/demo', { waitUntil: 'domcontentloaded' })
    const banner = page.getByText('Demo shop - nothing here is real')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    const box = await banner.boundingBox()
    expect(box!.height).toBeLessThanOrEqual(36)
    expect(box!.y).toBeLessThan(40)
    await page.getByRole('dialog').getByRole('button', { name: 'Skip', exact: true }).click()
    await page.locator('[data-tour="nav-grow"]').click()
    await page.getByText('Prep plan').first().click({ timeout: 60_000 })
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).not.toHaveValue('')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('log')).toContainText(/weekday average/i, { timeout: 30_000 })
  })

  test(`${width}px: how-it-works shop buttons are equal and side by side`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/how-it-works', { waitUntil: 'domcontentloaded' })
    const demo = page.getByRole('link', { name: 'Try the demo shop' }).first()
    const business = page.getByRole('link', { name: 'For business' }).first()
    await expect(demo).toBeVisible({ timeout: 60_000 })
    const [a, b] = [await demo.boundingBox(), await business.boundingBox()]
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2)
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(2)
    expect(Math.abs(a!.height - b!.height)).toBeLessThan(2)
    expect(a!.x + a!.width).toBeLessThanOrEqual(width)
    expect(b!.x + b!.width).toBeLessThanOrEqual(width)
  })
}
