import { expect, test, type Page } from '@playwright/test'

// OB-51: the guided tour lights real elements on real screens. No preview copy of a card floats
// over the page, every step's spotlight is on screen, and the tour card never covers it.
// Set TOUR_SHOTS=<folder> to also save a screenshot of every step (<size>-step<n>.png).
test.setTimeout(180_000)

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

// The anchor each step lights, in order.
const TARGETS = ['today', 'today-supply', 'reorder', 'forecast', 'menu', 'closeday', 'composer']

interface Rect {
  top: number
  left: number
  right: number
  bottom: number
}

async function box(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }
  }, selector)
}

const overlap = (a: Rect, b: Rect) =>
  a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1

for (const [size, viewport] of Object.entries(SIZES)) {
  test(`OB-51 tour shows only real elements at every step (${size})`, async ({ page }, info) => {
    test.skip(
      info.project.name !== (size === 'phone' ? 'phone' : 'desktop'),
      `${size} project only`,
    )
    await page.setViewportSize(viewport)
    await page.goto('/demo')
    await expect(page.getByText('Demo shop · sample data', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()
    const card = page.getByTestId('tour-card')
    const shots = process.env.TOUR_SHOTS

    for (const [index, target] of TARGETS.entries()) {
      await expect(card.getByText(`${index + 1} of ${TARGETS.length}`)).toBeVisible({
        timeout: 30_000,
      })
      // Wait for the spotlight to land on its element (the card slides in, the page scrolls).
      await expect
        .poll(async () => (await box(page, '[data-testid="tour-spot"]'))?.top ?? -1, {
          timeout: 15_000,
        })
        .toBeGreaterThanOrEqual(0)
      await page.waitForTimeout(700)

      // No preview copy of any screen.
      await expect(page.locator('[data-tour="feature"]')).toHaveCount(0)

      // The lit element is a real one: visible, and on screen.
      const real = page.locator(`[data-tour="${target}"]`).filter({ visible: true }).first()
      await expect(real).toBeVisible()
      const lit = (await box(page, '[data-testid="tour-spot"]'))!
      const element = (await real.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }
      })) as Rect
      expect(element.top, `step ${index + 1}: target above the screen`).toBeGreaterThanOrEqual(-1)
      expect(element.bottom, `step ${index + 1}: target below the screen`).toBeLessThanOrEqual(
        viewport.height + 1,
      )
      expect(element.right).toBeGreaterThan(0)
      expect(element.left).toBeLessThan(viewport.width)
      // The spotlight sits on that element.
      expect(Math.abs(lit.left - (element.left - 8))).toBeLessThanOrEqual(2)

      // The card never covers its own spotlight, and stays on screen.
      const cardBox = (await box(page, '[data-testid="tour-card"]'))!
      expect(overlap(cardBox, lit), `step ${index + 1}: card covers the spotlight`).toBe(false)
      expect(cardBox.left).toBeGreaterThanOrEqual(0)
      expect(cardBox.right).toBeLessThanOrEqual(viewport.width)
      expect(cardBox.top).toBeGreaterThanOrEqual(0)
      expect(cardBox.bottom).toBeLessThanOrEqual(viewport.height)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBeTruthy()

      if (index === 1)
        // Real seeded numbers, not example data.
        await expect(card).toContainText(/runs out .*\n?.*left, about \d/s)
      if (index === 2) await expect(card).toContainText(/WhatsApp to .*: \d+ items/)
      if (shots) await page.screenshot({ path: `${shots}/${size}-step${index + 1}.png` })

      if (index < TARGETS.length - 1) await card.getByRole('button', { name: 'Next' }).click()
    }

    // Back, then forward again, works from the middle of the tour.
    await card.getByRole('button', { name: 'Back' }).click()
    await expect(card.getByText(`${TARGETS.length - 1} of ${TARGETS.length}`)).toBeVisible()
    await card.getByRole('button', { name: 'Next' }).click()
    await expect(card.getByText(`${TARGETS.length} of ${TARGETS.length}`)).toBeVisible()

    // The last step ends cleanly on the Coach home.
    await card.getByRole('button', { name: 'Next' }).click()
    const done = page.getByRole('dialog', { name: 'You’re ready' })
    await expect(done).toBeVisible()
    await page.waitForTimeout(700)
    if (shots) await page.screenshot({ path: `${shots}/${size}-step${TARGETS.length + 1}.png` })
    await done.getByRole('button', { name: 'Keep exploring' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('today')).toBeVisible()
  })

  for (const button of ['Skip', 'Close tour']) {
    test(`OB-51 ${button} ends the tour at any step (${size})`, async ({ page }, info) => {
      test.skip(
        info.project.name !== (size === 'phone' ? 'phone' : 'desktop'),
        `${size} project only`,
      )
      await page.setViewportSize(viewport)
      await page.goto('/demo')
      await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()
      const card = page.getByTestId('tour-card')
      await expect(card.getByText(`1 of ${TARGETS.length}`)).toBeVisible({ timeout: 30_000 })
      await card.getByRole('button', { name: 'Next' }).click()
      await card.getByRole('button', { name: button, exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  }
}
