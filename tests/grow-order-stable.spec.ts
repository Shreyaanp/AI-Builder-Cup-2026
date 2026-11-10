import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, phone, seedShop } from './stories/support.js'

// Grow's rows follow the shop's playbook. A playbook that answered after the rows were on screen
// used to reorder them: "Get on Google" jumped from last to third between the press and the
// release, so the tap opened nothing (main CI, a8.spec.ts, 9 Nov). One order per visit now.
test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'phone')

const order = (page: Page) =>
  page
    .getByTestId('grow-tiles')
    .evaluate((grid) =>
      Array.from(grid.querySelectorAll('[data-tour]'), (tile) => tile.getAttribute('data-tour')),
    )

const grow = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Grow', exact: true })
    .click()

test('a slow playbook never moves Grow rows on screen; its order applies on the next visit', async ({
  page,
}) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  let delay = 2_500
  // The playbook answers late and puts Get on Google first.
  await page.route('**/playbook?**', async (route) => {
    const response = await route.fetch()
    const view = await response.json()
    await new Promise((resolve) => setTimeout(resolve, delay))
    await route.fulfill({ response, json: { ...view, grow: ['google'] } })
  })
  await grow(page)
  const google = page.getByRole('button', { name: /^Get on Google/ })
  await expect(google).toBeVisible()
  const first = await order(page)
  expect(first.at(-1)).toBe('google')
  // Well after the playbook answered: the same order, and the tap opens Get on Google.
  await page.waitForResponse('**/playbook?**')
  await page.waitForTimeout(500)
  expect(await order(page)).toEqual(first)
  await google.click()
  await expect(page.getByRole('button', { name: 'Step 2 of 4: Photos' })).toBeVisible()

  // Next visit: the playbook's order, shown at once and kept.
  delay = 0
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await grow(page)
  await expect(google).toBeVisible()
  const next = await order(page)
  expect(next[0]).toBe('google')
  await page.waitForTimeout(500)
  expect(await order(page)).toEqual(next)
})
