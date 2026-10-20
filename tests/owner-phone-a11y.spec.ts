import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, image, localOnly, seedShop } from './stories/support.js'

test.use({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })

async function audit(page: Page, screen: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect
    .soft(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      `${screen}: axe`,
    )
    .toEqual([])
  const issues = await page.evaluate(() => {
    const targets: string[] = []
    const clipped: string[] = []
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"], [role="tab"], [role="combobox"], input:not([type="hidden"]), textarea',
      ),
    )) {
      if (!el.checkVisibility() || el.closest('[inert], [aria-hidden="true"]')) continue
      // Checkbox/switch inputs use the enclosing label or MUI switch as their hit area.
      const target =
        el.closest('label') ??
        (el.matches('input[type="checkbox"]') ? el.closest('.MuiSwitch-root') : null) ??
        el
      const box = target.getBoundingClientRect()
      const name =
        el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 70) || el.tagName
      if (box.width < 48 || box.height < 48)
        targets.push(`${name}: ${box.width.toFixed(1)}x${box.height.toFixed(1)}`)
    }
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('button, label, .MuiTypography-root, .MuiChip-label'),
    )) {
      if (!el.checkVisibility() || el.closest('[inert], [aria-hidden="true"]')) continue
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      // Visually hidden screen-reader labels deliberately occupy a 1px clipped box.
      if (box.width <= 1 && box.height <= 1) continue
      // A deliberate one-line ellipsis that carries the full text in its title is not lost text (OB-117).
      if (style.textOverflow === 'ellipsis' && el.title.trim() === el.textContent?.trim()) continue
      if (
        (el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(style.overflowX)) ||
        (el.scrollHeight > el.clientHeight + 1 && ['hidden', 'clip'].includes(style.overflowY))
      )
        clipped.push(el.textContent?.trim().slice(0, 80) || el.tagName)
      // Carousel slides are intentionally outside the viewport until their dot is selected.
      if (
        !el.closest('[aria-roledescription="slide"]') &&
        (box.left < -1 || box.right > innerWidth + 1)
      )
        clipped.push(`outside viewport: ${el.textContent?.trim().slice(0, 60)}`)
    }
    return { targets, clipped, overflow: document.documentElement.scrollWidth > innerWidth }
  })
  expect.soft(issues.targets, `${screen}: 48px targets`).toEqual([])
  expect.soft(issues.clipped, `${screen}: clipped text`).toEqual([])
  expect.soft(issues.overflow, `${screen}: horizontal overflow`).toBe(false)
  if (screen === 'coach-chat') {
    const composer = await page.getByRole('textbox', { name: 'Message', exact: true }).boundingBox()
    const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox()
    expect
      .soft(composer!.y + composer!.height, 'Composer clears the phone navigation')
      .toBeLessThanOrEqual(nav!.y)
  }
  await page.screenshot({ path: test.info().outputPath(`${screen}.png`), fullPage: true })
}

for (const appearance of ['light', 'dark'] as const) {
  test(`owner screens at 360px: names, contrast, text and 48px targets (${appearance})`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone accessibility pass')
    test.setTimeout(120_000)
    await localOnly(page)
    await page.addInitScript(
      (appearance) =>
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ appearance, language: 'en' }),
        ),
      appearance,
    )
    await enter(page)
    await seedShop(page, false, 'Courtyard Chai with a very long neighbourhood shop name')
    await expect(page.getByTestId('today')).toBeVisible()
    await audit(page, 'today')
    for (const tab of ['Shop', 'Grow', 'You', 'Coach']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await audit(page, tab.toLowerCase())
      if (tab === 'Grow') {
        for (const [index, slide] of (
          await page.locator('[aria-roledescription="slide"]').all()
        ).entries()) {
          await page
            .getByRole('button', { name: (await slide.getAttribute('aria-label'))!, exact: true })
            .click()
          await audit(page, `grow-slide-${index + 1}`)
        }
      }
    }
    await page.route('**/api/v1/coach/stream', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: ['ready', 'reply', 'turn_complete']
          .map(
            (kind) =>
              `data: ${JSON.stringify({ kind, mode: 'offline', ...(kind === 'reply' ? { text: 'Your menu is ready. Check the long item names before saving.' } : {}) })}\n\n`,
          )
          .join(''),
      }),
    )
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Help with my menu')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('Your menu is ready.')
    await audit(page, 'coach-chat')
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(await image(page))
    const photoChoices = page.getByRole('group', { name: 'What is this photo?' })
    await expect(photoChoices).toBeVisible()
    await audit(page, 'coach-photo-choices')
    await photoChoices.getByRole('button', { name: 'Not now' }).click()
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Close the day/ }).click()
    const day = page.getByRole('dialog', { name: 'Close the day' })
    await expect(day).toBeVisible()
    await audit(page, 'close-day')
    await day.getByRole('button', { name: 'Type the numbers instead' }).click()
    await day
      .getByLabel('Item', { exact: true })
      .fill('Filter coffee with extra decoction, jaggery and a second refill')
    await day.getByLabel('Quantity sold').fill('30')
    await day.getByLabel(/^Amount/).fill('1200')
    await day.getByRole('button', { name: 'Add line' }).click()
    await audit(page, 'close-day-typed')
    await day.getByRole('button', { name: /^Review \(1/ }).click()
    await expect(day.getByText('Today’s sales')).toBeVisible()
    await audit(page, 'close-day-review')
    await day.getByRole('button', { name: 'Close', exact: true }).click()
    // A populated local fixture exercises order navigation without contacting a supplier.
    const order = {
      id: 'phone-po',
      number: 'PO-2026-0042',
      version: 1,
      status: 'confirmed',
      sent: true,
      auto_sent: false,
      created: 1760000000,
      currency: 'INR',
      buyer: { id: 'b', name: 'Shop', system: 'json' },
      supplier: {
        id: 's',
        name: 'Fresh Farms with a long neighbourhood supplier name',
        demo: false,
        system: 'json',
      },
      terms_days: 7,
      lines: [
        {
          line: 1,
          item: 'Filter coffee with extra decoction, jaggery and a second refill',
          quantity: 2,
          unit: 'kg',
          price: 5000,
          total: 10000,
        },
      ],
      total: 10000,
      need_by: '2026-10-20',
      delivery: '2026-10-20',
      reason: null,
      alternatives: [],
      checks: [],
      approval_required: false,
      blocked: false,
      documents: [],
      received: false,
      simulated: false,
    }
    await page.route('**/api/v1/businesses/*/supply', (route) =>
      route.fulfill({ json: { suppliers: [], orders: [order] } }),
    )
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await expect(page.getByRole('dialog', { name: 'Purchase orders' })).toBeVisible()
    await audit(page, 'purchase-orders')
    await page.getByRole('button', { name: /PO 2026-0042/ }).click()
    await expect(page.getByRole('article', { name: /^PO / })).toBeVisible()
    await audit(page, 'purchase-order-detail')
  })
}
