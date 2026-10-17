import { AxeBuilder } from '@axe-core/playwright'
import { expect, test as base, type Page, type APIRequestContext } from '@playwright/test'
import { enter, localOnly, seedShop } from '../stories/support.js'

export { enter, confirm, closeSheet, image, voiceFixture } from '../stories/support.js'
export const test = base.extend({
  page: async ({ page, context }, use) => {
    await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    await context.route('**/*', (route) =>
      ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
        ? route.fallback()
        : route.abort(),
    )
    await localOnly(page)
    await use(page)
  },
})
export { expect }

export async function owner(page: Page) {
  await enter(page)
  await seedShop(page)
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  return shops[0].id as string
}
export async function publish(page: Page, id: string) {
  expect(
    (
      await page.request.post(`/api/v1/businesses/${id}/share`, {
        data: { public: true },
      })
    ).ok(),
  ).toBe(true)
  return `/s/${id}`
}
export async function say(page: Page, message: string) {
  await expect(page.getByRole('button', { name: 'Stop reply', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(message)
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}
export async function audit(page: Page, layoutBug?: 'Q14') {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 12)
      .map((el) => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        text: el.textContent?.slice(0, 80),
        right: el.getBoundingClientRect().right,
      })),
  }))
  await test
    .info()
    .attach('layout', { body: JSON.stringify(bounds), contentType: 'application/json' })
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  await test.info().attach('axe', {
    body: JSON.stringify(result.violations),
    contentType: 'application/json',
  })
  expect(result.violations).toEqual([])
  if (test.info().project.name === 'desktop' && layoutBug && bounds.scroll > bounds.width + 1) {
    await page.screenshot({
      path: `docs/qa/${layoutBug}-desktop-crop.png`,
      clip: { x: bounds.width - 390, y: 0, width: 390, height: 844 },
      animations: 'disabled',
    })
  }
  expect(bounds.scroll <= bounds.width + 1).toBe(true)
}
export async function evidence(page: Page, name: string) {
  if (test.info().project.name !== 'phone') return
  await page.screenshot({ path: `docs/qa/${name}.png`, animations: 'disabled' })
}
export async function prepare(api: APIRequestContext, data: object) {
  const result = await api.post('/api/v1/proposals', { data })
  expect(result.ok()).toBe(true)
  return result.json() as Promise<{ id: string; digest: string }>
}
export async function approve(api: APIRequestContext, proposal: { id: string; digest: string }) {
  return api.post(`/api/v1/proposals/${proposal.id}/approve`, { data: { digest: proposal.digest } })
}
/** Switch to Tamil on the You tab, then return to the tab the test was on. */
export async function tamil(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Main' }).getByRole('button')
  const current = await nav.evaluateAll((items) =>
    items.findIndex((item) => item.getAttribute('aria-current') === 'page'),
  )
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: /தமிழ்/ }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', /^ta/)
  // The tab bar's own label is localised too (#61).
  const tamilNav = page
    .getByRole('navigation', { name: 'முதன்மை வழிசெலுத்தல்' })
    .getByRole('button')
  if (current >= 0) await tamilNav.nth(current).click()
}
