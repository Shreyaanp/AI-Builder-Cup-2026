import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// Bug hunt on main (16 Oct): console errors and copy found
// while running the browser suite and clicking through at 360px.

function consoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** A saved shop with the same item in two sizes, then the app reloaded on it. */
async function seedChai(page: Page) {
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: { name: 'Dakshin Sagar', category: 'Restaurant', location: 'Jayanagar' },
        products: [
          { name: 'Special Chai', unit: 'cup', price: 1500 },
          { name: 'Special Chai', unit: 'pot', price: 4000 },
          { name: 'Masala Dosa', unit: 'plate', price: 6000 },
        ],
      },
    })
  ).json()
  await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Dakshin Sagar' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test('one item in two sizes: the menu preview tells them apart, typed sales have no key clash', async ({
  page,
}) => {
  const errors = consoleErrors(page)
  await enter(page)
  await seedChai(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  const tiles = page.getByTestId('shop-tiles')
  await expect(tiles.getByText('Special Chai / cup')).toBeVisible()
  await expect(tiles.getByText('Special Chai / pot')).toBeVisible()
  // A name that appears once keeps its short form.
  await expect(tiles.getByText('Masala Dosa', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Close the day/ }).click()
  const day = page.getByRole('dialog', { name: 'Close the day' })
  await day.getByRole('button', { name: 'Type the numbers instead' }).click()
  await expect(day.getByTestId('close-day-typed')).toBeVisible()
  // The item suggestions list each name once.
  await expect(day.locator('#close-day-items option[value="Special Chai"]')).toHaveCount(1)
  expect(errors.filter((text) => text.includes('same key'))).toEqual([])
})

test('a listing notice from several shops reads each reason once, without a key clash', async ({
  page,
}) => {
  const errors = consoleErrors(page)
  await page.route('**/api/v1/trust', (route) =>
    route.fulfill({
      json: {
        face: 'not_started',
        reviewer: true,
        notices: [
          {
            id: 'n1',
            kind: 'listing',
            shop: 'Tiong Bahru Kopi',
            reasons: [
              { rule: 'shared_phone', detail: 'Same phone as Tiong Bahru Kopi' },
              { rule: 'shared_phone', detail: 'Same phone as Tiong Bahru Kopi' },
              { rule: 'shared_phone', detail: 'Same phone as Kopi Corner' },
            ],
          },
        ],
        queue: [
          {
            id: 'r1',
            kind: 'listing',
            status: 'open',
            reasons: [
              { rule: 'shared_phone', detail: 'Same phone as Tiong Bahru Kopi', source: 'rules' },
              { rule: 'shared_phone', detail: 'Same phone as Tiong Bahru Kopi', source: 'rules' },
            ],
          },
        ],
      },
    }),
  )
  await enter(page)
  await seedChai(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('button', { name: /^Privacy & your data/ }).click()
  await expect(page.getByRole('heading', { name: 'Privacy & data' })).toBeVisible()
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'This phone number is also on another shop’s page.' }),
  ).toHaveCount(1)
  // The reviewer still sees every flagged shop, even when two share a name.
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Same phone as Tiong Bahru Kopi', hasNot: page.getByRole('listitem') }),
  ).toHaveCount(2)
  expect(errors.filter((text) => text.includes('same key'))).toEqual([])
})

test('a second tap during a page transition is not an unhandled error', async ({ page }) => {
  test.skip(
    !(await page.evaluate(() => 'startViewTransition' in document)),
    'No view transitions in this browser',
  )
  const errors = consoleErrors(page)
  await page.goto('/explore/')
  await page.evaluate(async () => {
    // The dev server serves the app's own module; a variable keeps tsc from resolving it.
    const module = '/src/features/customer/paths.ts'
    const { go } = (await import(/* @vite-ignore */ module)) as { go: (path: string) => void }
    // The first transition is skipped when the second one starts.
    go('/explore/chats')
    go('/explore/saved')
    await new Promise((resolve) => setTimeout(resolve, 1500))
  })
  await expect(page).toHaveURL(/\/explore\/saved/)
  expect(errors.filter((text) => /Transition was (aborted|skipped)/.test(text))).toEqual([])
})
