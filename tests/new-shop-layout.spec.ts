import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

/**
 * #83: the create-shop flow on a phone. At 360, 390 and 412 px, in English and Hindi, light
 * and dark: no horizontal scroll, every control at least 48 px, no text cut off, nothing off
 * screen (except inside a row that scrolls), and the header, card, conversation, stage and
 * controls never overlap. The mic is blocked so its alert, the longest state, is on screen.
 */
test.use({ reducedMotion: 'reduce' })

const HEIGHTS = { 360: 640, 390: 844, 412: 915 } as const

/** Every layout problem on screen, as readable lines (empty when the screen is right). */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const width = innerWidth
    const problems: string[] = []
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()} "${(
        el.getAttribute('aria-label') ||
        (el as HTMLElement).innerText ||
        el.getAttribute('placeholder') ||
        ''
      )
        .replace(/\s+/g, ' ')
        .slice(0, 40)}"`
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden'
    }
    // A chip row that scrolls sideways may hold controls past the edge; the page may not.
    const inScroller = (el: Element) => {
      for (let up = el.parentElement; up; up = up.parentElement) {
        const style = getComputedStyle(up)
        if (['auto', 'scroll'].includes(style.overflowX) && up.scrollWidth > up.clientWidth)
          return true
      }
      return false
    }
    const offScreen = (box: DOMRect) => box.left < -1 || box.right > width + 1

    if (document.documentElement.scrollWidth > width + 1)
      problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${width}`)

    const controls = document.querySelectorAll(
      'button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio]',
    )
    for (const control of Array.from(controls)) {
      if (!shown(control)) continue
      const box = control.getBoundingClientRect()
      if (box.width < 47.5 || box.height < 47.5)
        problems.push(`target ${Math.round(box.width)}x${Math.round(box.height)}: ${name(control)}`)
      if (offScreen(box) && !inScroller(control)) problems.push(`off screen: ${name(control)}`)
    }

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.children.length || !shown(el)) continue
      const text = el as HTMLElement
      // Visually hidden labels (1 px boxes) are for screen readers.
      if (!text.innerText?.trim() || text.getBoundingClientRect().width <= 2) continue
      const style = getComputedStyle(text)
      if (text.scrollWidth > text.clientWidth + 1 && ['hidden', 'clip'].includes(style.overflowX))
        problems.push(`text cut sideways: ${name(text)}`)
      if (text.scrollHeight > text.clientHeight + 1 && ['hidden', 'clip'].includes(style.overflowY))
        problems.push(`text cut at the bottom: ${name(text)}`)
      if (offScreen(text.getBoundingClientRect()) && !inScroller(text))
        problems.push(`text off screen: ${name(text)}`)
    }

    // The flow's grid areas: stacked top to bottom, inside the screen, never on top of each other.
    const grid = document.querySelector('header')?.parentElement
    if (grid && getComputedStyle(grid).display === 'grid') {
      const areas = Array.from(grid.children)
        .filter(
          (child) =>
            shown(child) && !['absolute', 'fixed'].includes(getComputedStyle(child).position),
        )
        .map((child) => ({ child, box: child.getBoundingClientRect() }))
        .sort((a, b) => a.box.top - b.box.top)
      areas.forEach(({ child, box }, i) => {
        const above = areas[i - 1]
        if (above && box.top < above.box.bottom - 1)
          problems.push(`${name(child)} overlaps ${name(above.child)}`)
        if (box.bottom > innerHeight + 1) problems.push(`below the screen: ${name(child)}`)
      })
      const card = document.querySelector<HTMLElement>('[data-testid="shop-so-far"]')
      // A tall card scrolls on a phone; it may never hide its content.
      if (
        card &&
        card.scrollHeight > card.clientHeight + 1 &&
        !['auto', 'scroll'].includes(getComputedStyle(card).overflowY)
      )
        problems.push('the shop card is cut')
      const conversation = document.querySelector('[role="region"]')
      if (conversation && conversation.getBoundingClientRect().height < 48)
        problems.push('the conversation has no room')
    }
    return [...new Set(problems)]
  })
}

for (const width of [360, 390, 412] as const)
  for (const language of ['en', 'hi'] as const)
    for (const appearance of ['light', 'dark'] as const)
      test(`create-shop flow fits ${width} px (${language}, ${appearance})`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'phone', 'A phone layout pass')
        test.setTimeout(90_000)
        await localOnly(page)
        await page.setViewportSize({ width, height: HEIGHTS[width] })
        await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
        await enter(page)
        const copy = await page.evaluate(async (language) => {
          // Through Vite, so the browser modules stay out of the Node test compilation.
          const flow = (await import('/src/features/v1/newShopCopy.ts' as string)) as {
            newShopCopyFor: (l: string) => { begin: string; review: string }
          }
          const app = (await import('/src/features/v1/strings.ts' as string)) as {
            en: { addShop: string; continuePreview: string; send: string }
          }
          const locales = (await import('/src/features/v1/locales/index.ts' as string)) as {
            translations: Record<string, { addShop: string; continuePreview: string; send: string }>
          }
          const { addShop, continuePreview, send } =
            language === 'en' ? app.en : locales.translations[language]!
          const { begin, review } = flow.newShopCopyFor(language)
          return { addShop, continuePreview, send, begin, review }
        }, language)
        await page.evaluate(
          ([language, appearance]) =>
            localStorage.setItem(
              'niva.starter.preferences',
              JSON.stringify({ language, appearance }),
            ),
          [language, appearance],
        )
        await page.reload()
        await page.getByRole('button', { name: copy.continuePreview }).click()
        await page.getByRole('banner').getByRole('button', { name: copy.addShop }).click()
        const shot = (step: string) =>
          page.screenshot({
            path: info.outputPath(`${width}-${language}-${appearance}-${step}.png`),
          })

        await expect(page.getByRole('button', { name: copy.begin })).toBeVisible()
        expect(await layoutProblems(page), 'the welcome').toEqual([])
        await shot('1-welcome')

        await page.getByRole('button', { name: copy.begin }).click()
        await expect(page.getByTestId('voice-alert')).toBeVisible()
        await expect(page.getByRole('log')).not.toBeEmpty({ timeout: 20_000 })
        await expect(async () => expect(await layoutProblems(page)).toEqual([])).toPass({
          timeout: 10_000,
        })
        await shot('2-conversation')

        await page
          .getByRole('textbox')
          .last()
          .fill(
            'name: Shree Ganesh Chai and Snacks Corner; category: Tea stall; location: Indiranagar',
          )
        await page.getByRole('button', { name: copy.send, exact: true }).click()
        await expect(page.getByTestId('shop-so-far')).toContainText('Shree Ganesh', {
          timeout: 20_000,
        })
        await expect(async () => expect(await layoutProblems(page)).toEqual([])).toPass({
          timeout: 10_000,
        })
        await shot('3-filled')

        await page.getByTestId('review-my-shop').click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(async () => expect(await layoutProblems(page)).toEqual([])).toPass({
          timeout: 10_000,
        })
        await shot('4-review')
      })
