import { expect, test } from '@playwright/test'
import { enter, localOnly, phone, seedShop, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`A12 · coach scroll and Google waiting motion: ${reducedMotion}`, async ({ page }) => {
    await localOnly(page)
    await page.emulateMedia({ reducedMotion })
    await page.addInitScript(() => {
      const scrolls: string[] = []
      Object.defineProperty(window, '__storyScrolls', { value: scrolls })
      const original = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) {
        if (typeof options === 'object' && options.block === 'end')
          scrolls.push(options.behavior ?? 'auto')
        original.call(this, options)
      }
    })
    await enter(page)
    await seedShop(page)
    await page.getByLabel('Message', { exact: true }).fill('Hello')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('This is a scripted reply')
    const scrolls = await page.evaluate(
      () => (window as typeof window & { __storyScrolls: string[] }).__storyScrolls,
    )
    expect(scrolls.length).toBeGreaterThan(0)
    if (reducedMotion === 'reduce') expect(scrolls).not.toContain('smooth')
    else expect(scrolls).toContain('smooth')
    await shot(page, 2, `A12-scroll-${reducedMotion}`)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Get on Google/ }).click()
    await page.getByRole('button', { name: 'Step 3 of 4: Preview' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const heading = page.getByRole('heading', { name: 'Verified by Google', exact: true })
    await expect(heading).toBeFocused()
    expect(await heading.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid')
    expect(
      await heading.evaluate((node) => Number.parseFloat(getComputedStyle(node).outlineWidth)),
    ).toBeGreaterThanOrEqual(2)
    const pending = page.locator('[data-google-waiting]')
    const cue = await pending.evaluate((node) => {
      const style = getComputedStyle(node, '::after')
      return { name: style.animationName, count: style.animationIterationCount }
    })
    if (reducedMotion === 'reduce') expect(cue.name).toBe('none')
    else expect(Number(cue.count)).toBe(3)
    await shot(page, 5, `A12-focus-${reducedMotion}`)
  })
}
