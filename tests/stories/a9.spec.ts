import { expect, test } from '@playwright/test'
import { enter, localOnly, phone, seedShop, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
test('A9 · daily check survives conversation and dismisses per shop and day', async ({ page }) => {
  await localOnly(page)
  let today = '2026-10-15'
  // The shop's day comes from the Today facts; the test moves it forward.
  await page.route(/\/api\/v1\/businesses\/[^/]+\/today$/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), date: today } })
  })
  await enter(page)
  await seedShop(page)
  await page.getByLabel('Message', { exact: true }).fill('Hello')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('This is a scripted reply')
  const title = page.getByText('Still the same menu today?', { exact: true })
  // While chatting the check waits in the pill; opening it shows the question.
  const pill = page.locator('[aria-controls="today-pill-panel"]')
  await pill.click()
  await expect(title).toBeVisible()
  await page.getByLabel('Message', { exact: true }).fill('A continuing conversation. '.repeat(50))
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await page.getByRole('log').locator('li').last().scrollIntoViewIfNeeded()
  await expect(title).toBeInViewport()
  await shot(page, 2, 'A9-continuing')
  await page.getByTestId('today-pill').getByRole('button', { name: 'Changed', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).not.toBeEmpty()
  await page.getByLabel('Message', { exact: true }).fill('')
  await expect(title).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('log')).toContainText('This is a scripted reply')
  await expect(title).toHaveCount(0)
  const original = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const next = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: { ...original.fields, name: 'Second shop' },
        // The daily menu question needs a menu to ask about.
        products: [{ name: 'Kopi', price: 180, unit: 'cup' }],
      },
    })
  ).json()
  expect(
    (
      await page.request.post(`/api/v1/proposals/${next.id}/approve`, {
        data: { digest: next.digest },
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: /^Choose shop:/ }).click()
  await page.getByRole('menuitem', { name: /Second shop/ }).click()
  await expect(title).toBeVisible()
  await page.getByRole('button', { name: /^Choose shop:/ }).click()
  await page.getByRole('menuitem', { name: /Courtyard Chai/ }).click()
  await expect(title).toHaveCount(0)
  today = '2026-10-16'
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('log')).toContainText('This is a scripted reply')
  await pill.click()
  await expect(title).toBeVisible()
  await shot(page, 2, 'A9-next-day')
})
