import { expect, test, type Locator, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// Owner CSS fixes from the heatmap audit (#69): touch targets are at least 48px and nothing
// clips or overflows at 360, 390 and 412px, in English and Hindi. Phone project only.

const WIDTHS = [360, 390, 412]
const LANGS = ['en', 'hi'] as const
const MIN = 47.5
const START = /Continue local preview|स्थानीय/

async function enterAndSeed(page: Page, language: string) {
  await localOnly(page)
  await enter(page)
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      revision: 0,
      business: {
        name: 'Asha Bakery & Chai',
        category: 'Cafe',
        location: 'Indiranagar, Bengaluru',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      },
      products: [
        { name: 'Masala Chai', price: 2000, unit: 'cup', category: 'Beverages' },
        { name: 'Bun Maska', price: 3500, unit: 'piece', category: 'Bakery' },
        { name: 'Veg Puff', price: 3000, unit: 'piece', category: 'Bakery' },
      ],
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
  const { business_id: id } = await approved.json()
  // A few days of saved sales, so Your week has a chart to lay out.
  for (const back of [1, 2, 3]) {
    const date = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
    const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
      data: { date, sales: [{ item: 'Masala Chai', quantity: 20 + back, amount: 50000 }] },
    })
    const { sales } = await day.json()
    await page.request.post(`/api/v1/businesses/${id}/import/${sales.import_id}/approve`, {
      data: { digest: sales.digest },
    })
  }
  await page.evaluate(
    (appearance) =>
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ appearance: 'light', language: appearance }),
      ),
    language,
  )
  await page.reload()
  await page.getByRole('button', { name: START }).first().click()
  await expect(page.locator('[data-tour="nav-coach"]')).toBeVisible({ timeout: 15_000 })
}

/** Every visible control in `scope` smaller than 48px either way. */
async function smallTargets(scope: Locator): Promise<string[]> {
  return scope.evaluate((root, min) => {
    const selector = 'button, [role="button"], [role="tab"], a[href], select'
    return Array.from(root.querySelectorAll<HTMLElement>(selector))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.width < min || box.height < min)
      .map(
        ({ el, box }) =>
          `${el.tagName} "${(el.textContent || el.ariaLabel || '').trim().slice(0, 30)}" ` +
          `${Math.round(box.width)}x${Math.round(box.height)}`,
      )
  }, MIN)
}

/** Controls whose text is cut off, and anything poking past the viewport edge. */
async function clipped(page: Page, scope: Locator): Promise<string[]> {
  const inner = await scope.evaluate((root) => {
    const bad: string[] = []
    const found = root.querySelectorAll<HTMLElement>('button, [role="tab"], label')
    for (const el of Array.from(found)) {
      const box = el.getBoundingClientRect()
      if (!box.width) continue
      const name = (el.textContent || '').trim().slice(0, 30)
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible')
        bad.push(`text clipped: ${name}`)
      if (box.right > innerWidth + 1 || box.left < -1) bad.push(`outside viewport: ${name}`)
    }
    return bad
  })
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  return sideways ? [...inner, 'page scrolls sideways'] : inner
}

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`owner screens keep 48px targets and do not clip (${lang}, ${width}px)`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'phone', 'phone layout')
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 800 })
      await enterAndSeed(page, lang)

      // Coach: the suggestion chips and the "needs you" pill, whichever the shop has today.
      const coachChips = page.locator(
        'main .MuiChip-root[role="button"], [data-testid="today-pill"] button',
      )
      await coachChips
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => undefined)
      for (const chip of await coachChips.all()) {
        if (await chip.isVisible())
          expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(MIN)
      }

      // Shop → Link your billing app: system pills, tabs and the upload button.
      await page.locator('[data-tour="nav-shop"]').click()
      await page
        .locator(
          'button:has-text("Link your billing app"), button:has-text("बिक्री का हिसाब जोड़ें")',
        )
        .first()
        .click()
      const connect = page.getByRole('dialog')
      await expect(connect).toBeVisible()
      await expect(connect.getByRole('button', { name: 'Petpooja' })).toBeVisible()
      expect(await smallTargets(connect)).toEqual([])
      expect(await clipped(page, connect)).toEqual([])
      const upload = connect.locator('button:has(svg.lucide-upload)')
      await expect(upload).toBeVisible()
      expect(
        await upload.evaluate(
          (el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
        ),
      ).toBe(true)
      await page.keyboard.press('Escape')
      await expect(connect).toHaveCount(0)

      // Shop → Menu: one filled action. Add product: Save and Cancel stay on screen at 560px tall.
      await page.locator('[data-tour="menu"]').click()
      const menu = page.getByRole('dialog')
      await expect(menu).toBeVisible()
      expect(await menu.locator('.MuiButton-contained').count()).toBeLessThanOrEqual(1)
      await menu
        .getByRole('button', { name: /Add product|Add item|उत्पाद जोड़ें|सामान जोड़ें/ })
        .first()
        .click()
      const actions = page.getByTestId('product-actions')
      await expect(actions).toBeVisible()
      await page.setViewportSize({ width, height: 560 })
      const box = await actions.boundingBox()
      expect(box!.y + box!.height).toBeLessThanOrEqual(561)
      for (const button of await actions.getByRole('button').all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(MIN)
      expect(await clipped(page, page.getByRole('dialog'))).toEqual([])
      await page.setViewportSize({ width, height: 800 })
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')

      // Grow: carousel dots, Your week spacing and the Rescue discount chips.
      await page.locator('[data-tour="nav-grow"]').click()
      await expect(page.getByTestId('grow-tiles')).toBeVisible()
      const slides = await page.locator('[aria-roledescription="slide"]').count()
      if (slides) {
        const sizes = await page.evaluate(() => {
          const labels = new Set(
            Array.from(document.querySelectorAll('[aria-roledescription="slide"]')).map((s) =>
              s.getAttribute('aria-label'),
            ),
          )
          return Array.from(document.querySelectorAll<HTMLElement>('button[aria-label]'))
            .filter((b) => labels.has(b.getAttribute('aria-label')))
            .map((b) => Math.min(b.offsetWidth, b.offsetHeight))
        })
        expect(sizes.length).toBe(slides)
        for (const size of sizes) expect(size).toBeGreaterThanOrEqual(48)
      }

      await page
        .locator(
          'button:has-text("Your week"), button:has-text("Week pulse"), button:has-text("हफ़्ते"), button:has-text("हफ़्ता")',
        )
        .first()
        .click()
      const week = page.getByRole('dialog')
      await expect(week).toBeVisible()
      const gaps = await week.evaluate((root) =>
        Array.from(root.querySelectorAll<HTMLElement>('*'))
          .filter((el) => getComputedStyle(el).display === 'grid')
          .flatMap((el) => [getComputedStyle(el).columnGap, getComputedStyle(el).rowGap])
          .filter((gap) => gap.endsWith('px'))
          .map((gap) => parseFloat(gap)),
      )
      for (const gap of gaps) expect(gap % 4).toBe(0)
      expect(await clipped(page, week)).toEqual([])
      await page.keyboard.press('Escape')

      await page
        .locator('button:has-text("Rescue deals"), button:has-text("बचे माल")')
        .first()
        .click()
      const rescue = page.getByRole('dialog')
      await expect(rescue).toBeVisible()
      const chips = rescue.locator(
        '[role="group"][aria-labelledby="rescue-discount"] [role="button"]',
      )
      expect(await chips.count()).toBeGreaterThanOrEqual(3)
      for (const chip of await chips.all()) {
        const size = (await chip.boundingBox())!
        expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(MIN)
      }
      expect(await clipped(page, rescue)).toEqual([])
      await page.keyboard.press('Escape')

      // You → Verify (face check) and the playbook sheet.
      await page.locator('[data-tour="nav-you"]').click()
      await page
        .locator(
          'button:has(svg.lucide-scan-face), button:has-text("Verify"), button:has-text("पुष्टि")',
        )
        .first()
        .click()
      const face = page.getByRole('dialog')
      await expect(face).toBeVisible()
      const label = await face.getByRole('checkbox').locator('xpath=ancestor::label').boundingBox()
      expect(label!.height).toBeGreaterThanOrEqual(MIN)
      expect(await smallTargets(face)).toEqual([])
      expect(await clipped(page, face)).toEqual([])
      await page.keyboard.press('Escape')

      await page
        .locator(
          'button:has(svg.lucide-shield-check), button:has-text("Privacy"), button:has-text("गोपनीयता")',
        )
        .first()
        .click()
      await page.getByTestId('playbook-open').click()
      await expect(page.getByTestId('playbook')).toBeVisible({ timeout: 20_000 })
      const more = page.getByTestId('playbook-more')
      await expect(more).toBeVisible()
      expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(MIN)
      await expect(page.getByTestId('playbook-key_metrics')).toHaveCount(0)
      await more.click()
      expect(await clipped(page, page.getByRole('dialog'))).toEqual([])
    })
  }
}
