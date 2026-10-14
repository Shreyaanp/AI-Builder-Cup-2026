import { expect, test } from '@playwright/test'
import { enter, localOnly, phone, seedShop, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
test('A9 · daily check survives conversation and dismisses per shop and day', async ({ page }) => {
  await localOnly(page)
  let today = '2026-10-15'
  await page.route(/\/api\/v1\/businesses\/[^/]+\/freshness$/, (route) =>
    route.fulfill({
      json: {
        today,
        last_confirmed: null,
        monday: false,
        recap_week: '2026-W42',
      },
    }),
  )
  await enter(page)
  await seedShop(page)
  await page.getByLabel('Message', { exact: true }).fill('Hello')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('This is a scripted reply')
  const title = page.getByText('Still the same menu today?', { exact: true })
  await expect(title).toBeVisible()
  await page.getByLabel('Message', { exact: true }).fill('A continuing conversation. '.repeat(50))
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await page.getByRole('log').locator('li').last().scrollIntoViewIfNeeded()
  await expect(title).toBeInViewport()
  await shot(page, 2, 'A9-continuing')
  await page.getByRole('button', { name: 'Something changed' }).click()
  await expect(page.getByLabel('Message', { exact: true })).not.toBeEmpty()
  await page.getByLabel('Message', { exact: true }).fill('')
  await title.locator('..').getByRole('button', { name: 'Dismiss', exact: true }).click()
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
  await expect(title).toBeVisible()
  await shot(page, 2, 'A9-next-day')
})
