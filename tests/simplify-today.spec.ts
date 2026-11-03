import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// Simplify batch 5 (owner app, SIMPLIFY-owner.md §3.3, §3.6, §3.7, §3.14, §7): Coach Today answers
// "what do I do now?" in one screenful with one filled button; what needs the owner shows once in
// the app; the top bar is the shop and (on Coach) one ⋯; first run is one card with the demo one
// link away; the demo banner is one 40 px line; the tour ends teaching both paths.

test.setTimeout(150_000)

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `simplify-today-${info.testId}-${Math.random()}`,
  })
})

/** Today at hh:mm in the demo shop's time (India), never ahead of the server's clock. */
function shopTime(hh: number, mm = 0) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const pad = (n: number) => String(n).padStart(2, '0')
  const at = new Date(`${day}T${pad(hh)}:${pad(mm)}:00+05:30`)
  return at.getTime() <= Date.now() ? at : new Date(at.getTime() - 24 * 3600_000)
}

async function openDemo(page: Page, hh: number, mm = 0, width = 390, height = 844) {
  await page.setViewportSize({ width, height })
  await page.clock.setFixedTime(shopTime(hh, mm))
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Skip', exact: true })
    .click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today-needs')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('today-pulse')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('today-chips')).toBeVisible()
  // Late rows (supply, the menu question) settle before measuring.
  await page.waitForTimeout(1500)
}

/** What Coach Today shows in its first screenful (no top bar, no composer, no tab bar). */
function todayView(page: Page) {
  return page.evaluate(() => {
    const today = document.querySelector<HTMLElement>('[data-testid="today"]')!
    let scroller: HTMLElement | null = today.parentElement
    while (scroller && getComputedStyle(scroller).overflowY !== 'auto')
      scroller = scroller.parentElement
    const bottom = scroller!.getBoundingClientRect().bottom
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect()
      return (
        box.width > 1 &&
        box.height > 1 &&
        box.top < bottom &&
        box.bottom > 0 &&
        (el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
    }
    const tappable = Array.from(
      today.querySelectorAll('button,a[href],[role="button"],[role="switch"],input,select'),
    ).filter(shown)
    const filled = Array.from(today.querySelectorAll('.MuiButton-contained')).filter(shown)
    const close = today.querySelector('[data-need="closeDay"] .MuiButton-contained')
    const box = close?.getBoundingClientRect()
    return {
      tappable: tappable.length,
      filled: filled.map((el) => el.textContent ?? ''),
      // How far Today runs past its screen (0 when it fits).
      overflow: scroller!.scrollHeight - scroller!.clientHeight,
      lead: today
        .querySelector('[data-testid="today-needs"] [data-need]')
        ?.getAttribute('data-need'),
      closeMiddle: box ? (box.top + box.bottom) / 2 : null,
      height: innerHeight,
    }
  })
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)

for (const [hh, mm] of [
  [8, 0],
  [10, 0],
  [20, 30],
] as const) {
  test(`Coach Today in the demo at ${hh}:${String(mm).padStart(2, '0')}: one screenful, ≤ 12 taps, one filled button`, async ({
    page,
  }) => {
    await openDemo(page, hh, mm)
    const view = await todayView(page)
    expect(view.overflow, 'Today scrolls past one screenful').toBeLessThanOrEqual(1)
    expect(view.tappable, 'tappable in the first view').toBeLessThanOrEqual(12)
    expect(view.filled, 'filled buttons in the content').toHaveLength(1)
    // A waiting customer's Reply stays visible at every hour (habit slice 2).
    await expect(
      page.locator('[data-need="reply"]').getByRole('button', { name: 'Reply', exact: true }),
    ).toBeInViewport()
    if (hh === 20) {
      // Evening: Close the day leads the card, and its one filled button is in the thumb zone.
      expect(view.lead).toBe('closeDay')
      expect(view.filled).toEqual(['Close the day'])
      expect(view.closeMiddle!, 'Close the day in the bottom half').toBeGreaterThan(view.height / 2)
      await expect(page.getByTestId('today')).toHaveAttribute('data-layout', 'evening')
    } else expect(view.lead).not.toBe('closeDay')
    // Two chips that fit the hour, then every example one tap away.
    const chips = page.getByTestId('today-chips')
    await expect(chips.getByRole('button')).toHaveCount(3)
    await expect(chips.getByRole('button', { name: 'How much to make?' })).toBeVisible()
    await expect(chips.getByRole('button', { name: 'What can I ask?' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveAttribute(
      'placeholder',
      'Ask anything…',
    )
    expect(await fitsWidth(page)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`today-${hh}${mm}-390.png`) })
  })
}

for (const [width, height] of [
  [360, 800],
  [412, 915],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Coach Today at ${width} ${scheme}: one filled button, ≤ 12 taps, no sideways scroll`, async ({
      page,
    }) => {
      await page.addInitScript(
        (appearance) =>
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance })),
        scheme,
      )
      await openDemo(page, 10, 0, width, height)
      const view = await todayView(page)
      expect(view.filled).toHaveLength(1)
      expect(view.tappable).toBeLessThanOrEqual(12)
      expect(await fitsWidth(page)).toBe(true)
      // At most 3 text sizes on Today, none under 14 px (PHONE-UX rule 5).
      const sizes = await page.evaluate(() => {
        const found = new Set<number>()
        const root = document.querySelector('[data-testid="today"]')!
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const el = node.parentElement
          if (!node.textContent?.trim() || !el || !el.checkVisibility()) continue
          found.add(Math.round(parseFloat(getComputedStyle(el).fontSize)))
        }
        return [...found].sort((a, b) => a - b)
      })
      expect(sizes.length, `text sizes ${sizes.join(', ')}`).toBeLessThanOrEqual(3)
      expect(sizes[0]).toBeGreaterThanOrEqual(14)
      const axe = await new AxeBuilder({ page })
        .include('[data-testid="today"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(axe.violations).toEqual([])
      await page.screenshot({ path: test.info().outputPath(`today-${width}-${scheme}.png`) })
    })
  }
}

test('desktop 1280: Coach Today and the top bar keep their one ⋯ and fit', async ({ page }) => {
  await openDemo(page, 20, 30, 1280, 800)
  const view = await todayView(page)
  expect(view.filled).toEqual(['Close the day'])
  await expect(
    page.locator('header[data-app-header]').getByRole('button', { name: 'More options' }),
  ).toBeVisible()
  expect(await fitsWidth(page)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('today-1280.png') })
})

test('a chip sends its sentence; What can I ask? opens every example', async ({ page }) => {
  await openDemo(page, 10)
  await page.getByTestId('today-chips').getByRole('button', { name: 'How much to make?' }).click()
  await expect(page.getByRole('log')).toContainText(/Forecast demand for/, { timeout: 30_000 })
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Start again' })
  await sheet.getByRole('button', { name: 'New conversation', exact: true }).click()
  await expect(page.getByTestId('today-chips')).toBeVisible()
  await page.getByTestId('today-chips').getByRole('button', { name: 'What can I ask?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Talk to your coach' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Forecast demand for/ })).toBeVisible()
})

test('what needs the owner shows once: on Coach, not again on Shop or Grow', async ({ page }) => {
  await openDemo(page, 10)
  const needs = page.getByTestId('today-needs')
  await expect(needs).toContainText('1 customer is waiting')
  for (const tab of ['shop', 'grow'] as const) {
    await page.locator(`[data-tour="nav-${tab}"]`).click()
    const screen = page.locator('main')
    await expect(page.locator(`[data-tour="nav-${tab}"]`)).toHaveAttribute('aria-current', 'page')
    await page.waitForTimeout(1500)
    for (const text of [/customers? (is|are) waiting/, /Still the same menu/, 'Needs you now'])
      await expect(screen.getByText(text).filter({ visible: true })).toHaveCount(0)
  }
})

test('top bar: the shop and one ⋯ on Coach; at most 2 buttons elsewhere; Browse shops in the switcher', async ({
  page,
}) => {
  await openDemo(page, 10)
  const bar = page.locator('header[data-app-header]')
  const taps = bar.locator('a:visible, button:visible')
  await expect(bar.getByRole('button', { name: 'Add shop details' })).toHaveCount(0)
  await expect(bar.getByRole('button', { name: 'More options', exact: true })).toBeVisible()
  await expect(taps).toHaveCount(3)
  for (const tab of ['shop', 'grow', 'you'] as const) {
    await page.locator(`[data-tour="nav-${tab}"]`).click()
    await expect(bar.getByRole('button', { name: 'More options' })).toHaveCount(0)
    expect(await taps.count(), `${tab}: top-bar buttons`).toBeLessThanOrEqual(2)
  }
  // Adding a shop and the demo's customer side live in the switcher.
  await bar.getByRole('button', { name: /^Choose shop/ }).click()
  await expect(page.getByRole('menuitem', { name: 'New shop', exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Browse shops', exact: true }).click()
  await expect(page).toHaveURL(/\/explore\/demo/)
  await expect(page.getByRole('heading', { name: 'Browse shops' })).toBeVisible({ timeout: 30_000 })

  // Coach's ⋯: start again, past chats, how it works. Add shop / Add product are not here.
  await page.goto('/demo')
  await page.locator('[data-tour="nav-coach"]').click()
  await bar.getByRole('button', { name: 'More options', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Start again' })
  await expect(sheet.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'How this works' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Add shop details' })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Add product' })).toHaveCount(0)
})

test('demo banner: one line as tall as its 48 px Exit demo target, at every phone width', async ({
  page,
}) => {
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/demo')
    const banner = page.getByTestId('demo-banner')
    await expect(banner).toContainText('Demo shop · sample data', { timeout: 60_000 })
    const box = (await banner.boundingBox())!
    // One line (it wrapped to two at 360 with Browse shops in it); 40 px would push the 48 px
    // target into the top bar, which the UX gate rejects.
    expect(box.height, `${width}: banner height`).toBeLessThanOrEqual(48.5)
    const exit = (await banner.getByRole('button', { name: 'Exit demo' }).boundingBox())!
    expect(exit.height).toBeGreaterThanOrEqual(48)
    expect(exit.width).toBeGreaterThanOrEqual(48)
    await expect(banner.getByRole('link')).toHaveCount(0)
  }
})

test('first run: one card, "Take a photo" filled, the demo one link away, no top-bar extras', async ({
  page,
}) => {
  await localOnly(page)
  await enter(page)
  const main = page.locator('main')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Let’s put your shop online' }),
  ).toBeVisible()
  const card = page.getByRole('region', { name: 'Take a photo of your shop board or menu.' })
  await expect(card).toBeVisible()
  await expect(main.locator('section')).toHaveCount(2) // the coach and its one card
  await expect(main.locator('.MuiButton-contained').filter({ visible: true })).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Take a photo' })).toHaveClass(
    /MuiButton-contained/,
  )
  await expect(card.getByRole('button', { name: 'Type your shop name' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Or see a demo shop first' })).toBeVisible()
  await expect(page.getByText('Or just say: “Sharma Tea, Indiranagar”')).toBeVisible()
  await expect(page.getByText(/Step \d of \d/)).toHaveCount(0)
  const bar = page.locator('header[data-app-header]')
  await expect(bar.locator('a:visible, button:visible')).toHaveCount(2)
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveAttribute(
    'placeholder',
    'Your shop…',
  )
  await page.screenshot({ path: test.info().outputPath('first-run-390.png') })
  await card.getByRole('button', { name: 'Type your shop name' }).click()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
})

test('tour: 7 steps, prep on Grow’s How much to make, ends on You’re ready with the tip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()
  const card = page.locator('#tour-title').locator('..')
  await expect(card).toContainText('Your shop at a glance', { timeout: 30_000 })
  await expect(page.getByText('1 of 7')).toBeVisible()
  for (let step = 2; step <= 7; step++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText(`${step} of 7`)).toBeVisible()
    if (step === 5) {
      await expect(page.locator('#tour-title')).toHaveText('Tomorrow’s prep plan')
      await expect(page.locator('[data-tour="nav-grow"]')).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('[data-tour="prep"]').filter({ visible: true })).toContainText(
        'How much to make',
      )
    }
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('#tour-title')).toHaveText('You’re ready')
  await expect(page.getByTestId('tour-tip')).toHaveText('Tip: you can also just ask the coach.')
  await page.waitForTimeout(800) // the card settles before the picture
  await page.screenshot({ path: test.info().outputPath('tour-end-390.png') })
})

test('Hindi: Today’s chips, placeholder and ⋯ are fully Hindi', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(shopTime(10))
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button').last().click({ timeout: 60_000 })
  await expect(page.getByTestId('today-chips')).toBeVisible({ timeout: 30_000 })
  const chips = page.getByTestId('today-chips')
  await expect(chips.getByRole('button', { name: 'कितना बनाना है?' })).toBeVisible()
  await expect(chips.getByRole('button', { name: 'मेन्यू बदलें' })).toBeVisible()
  await expect(chips.getByRole('button', { name: 'क्या-क्या पूछ सकते हैं?' })).toBeVisible()
  await expect(page.locator('#coach textarea:not([aria-hidden])')).toHaveAttribute(
    'placeholder',
    'कुछ भी पूछें…',
  )
  await expect(page.getByRole('button', { name: 'और विकल्प', exact: true })).toBeVisible()
  await expect(page.getByTestId('today')).not.toContainText(/[A-Za-z]{4,} [a-z]{3,} [a-z]{3,}/)
  await page.screenshot({ path: test.info().outputPath('today-hi-390.png') })
})
