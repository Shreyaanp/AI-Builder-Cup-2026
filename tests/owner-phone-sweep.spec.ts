import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'

const widths = [360, 390, 412]
const languages = ['en', 'hi'] as const
const appearances = ['light', 'dark'] as const

async function assertPhoneLayout(page: Page, screen: string) {
  const result = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1
    const scope =
      document.querySelector<HTMLElement>('[role="dialog"]') ??
      document.querySelector<HTMLElement>('[role="article"]') ??
      document.querySelector<HTMLElement>('main') ??
      document.body
    const candidates = Array.from(
      scope.querySelectorAll<HTMLElement>(
        'h2,h3,p,button,[role="button"],[role="tab"],label,input,textarea',
      ),
    ).filter((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const inViewport =
        box.bottom > 0 &&
        box.top < window.innerHeight &&
        box.right > 0 &&
        box.left < window.innerWidth
      return (
        box.width > 2 &&
        box.height > 2 &&
        inViewport &&
        element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        !element.closest('[aria-hidden="true"]') &&
        style.clip !== 'rect(0px, 0px, 0px, 0px)' &&
        style.clipPath === 'none'
      )
    })
    const overlaps: string[] = []
    for (let i = 0; i < candidates.length; i += 1) {
      const a = candidates[i].getBoundingClientRect()
      for (let j = i + 1; j < candidates.length; j += 1) {
        const b = candidates[j].getBoundingClientRect()
        const contained =
          (a.left <= b.left + 1 &&
            a.top <= b.top + 1 &&
            a.right >= b.right - 1 &&
            a.bottom >= b.bottom - 1) ||
          (b.left <= a.left + 1 &&
            b.top <= a.top + 1 &&
            b.right >= a.right - 1 &&
            b.bottom >= a.bottom - 1)
        if (
          !contained &&
          a.left < b.right - 1 &&
          a.right > b.left + 1 &&
          a.top < b.bottom - 1 &&
          a.bottom > b.top + 1
        )
          overlaps.push(
            `${candidates[i].tagName} "${(candidates[i].textContent ?? '').trim().slice(0, 24)}" / ` +
              `${candidates[j].tagName} "${(candidates[j].textContent ?? '').trim().slice(0, 24)}"`,
          )
      }
    }
    return { overflow, overlaps }
  })
  expect(result.overflow, `${screen}: horizontal overflow`).toBe(false)
  expect(result.overlaps, `${screen}: visible content overlaps`).toEqual([])
}

for (const width of widths) {
  for (const language of languages) {
    for (const appearance of appearances) {
      test(`owner phone sweep ${width}px ${language} ${appearance}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'phone', 'phone project only')
        test.setTimeout(120_000)
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: appearance, reducedMotion: 'reduce' })
        await localOnly(page)
        await enter(page)
        await seedShop(page, false, `Phone sweep ${width} ${language} ${appearance}`)
        await page.evaluate(
          ({ language: chosenLanguage, appearance: chosenAppearance }) =>
            localStorage.setItem(
              'niva.starter.preferences',
              JSON.stringify({ appearance: chosenAppearance, language: chosenLanguage }),
            ),
          { language, appearance },
        )
        await page.reload()
        await page
          .getByRole('button', {
            name: /Continue local preview|\u0938\u094d\u0925\u093e\u0928\u0940\u092f/,
          })
          .first()
          .click()

        // Today
        await expect(page.getByTestId('today')).toBeVisible()
        await assertPhoneLayout(page, 'Today')

        // Shop menu and item details
        await page.locator('[data-tour="nav-shop"]').click()
        await page.locator('[data-tour="menu"]').click()
        const menu = page.getByRole('dialog')
        await expect(menu).toBeVisible()
        await assertPhoneLayout(page, 'Shop menu')
        await menu.locator('[data-menu-item="Kopi"]').click()
        await assertPhoneLayout(page, 'Shop item details')
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)

        // Supply orders and purchase orders
        await page.locator('[data-tour="nav-grow"]').click()
        await page.locator('[data-tour="supply"]').click()
        await page.getByRole('button', { name: /Try supply demo|डेमो/ }).click()
        await assertPhoneLayout(page, 'Supply orders')
        const supply = page.getByRole('region', { name: /Supply chain|आपूर्ति/ })
        await expect(supply).toBeVisible()
        await supply.getByRole('button', { name: /Reorder|फिर/ }).click()
        const order = page.getByRole('article')
        await expect(order).toBeVisible()
        await assertPhoneLayout(page, 'Purchase orders')
      })
    }
  }
}
