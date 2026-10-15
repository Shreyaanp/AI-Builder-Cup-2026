import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openShop(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'New shop', exact: true })).toBeVisible()
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: { name: 'Planning Kopitiam' },
        products: [
          { name: 'Kopi', unit: 'cup', price: 180, stock: 20 },
          { name: 'Packets', unit: 'packet', price: 2000, stock: 10 },
        ],
      },
    })
  ).json()
  const receipt = await (
    await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
  ).json()
  await page.request.post(`/api/v1/businesses/${receipt.business_id}/share`, {
    data: { public: true },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  // Planning lives in the Plan tomorrow tile's sheet.
  await page.getByRole('button', { name: /^Plan tomorrow/ }).click()
  return receipt.business_id as string
}

test('I01-I12 demo planning is labelled, bounded, private, accessible and isolated', async ({
  page,
}) => {
  const bid = await openShop(page)
  const inventoryPath = `/api/v1/businesses/${bid}/inventory`
  const publicPath = `/api/v1/public/shops/${bid}`
  const before = await (await page.request.get(inventoryPath)).json()
  const publicBefore = await (await page.request.get(publicPath)).json()
  const card = page.getByRole('region', { name: 'Plan tomorrow' })
  await card.getByLabel('Ready stock').fill('20')
  await card.getByLabel('Additional capacity').fill('60')
  await card.getByRole('button', { name: 'Calculate suggestion' }).click()
  await expect(card).toContainText('Not enough history')
  await card.getByLabel('History source').click()
  await page.getByRole('option', { name: 'Demo data' }).click()
  await card.getByRole('button', { name: 'Review demo history' }).click()
  await expect(card).toContainText('Check before saving')
  await expect(card).toContainText('Closed')
  await expect(card).toContainText('Missing')
  await expect(card).toContainText('Stockout')
  await card.getByRole('button', { name: 'Confirm and save exact proposal' }).click()
  await card.getByRole('button', { name: 'Calculate suggestion' }).click()
  await expect(card).toContainText('Mean baseline: 95 cup')
  await expect(card).toContainText('Additional preparation: 60 cup')
  await expect(card).toContainText('capacity: 15 cup')
  await expect(card).toContainText('Demo data')
  await card.getByRole('button', { name: 'Method and history' }).click()
  await expect(card).toContainText('not a prediction interval')
  await expect(card).toContainText('daily-v1')
  expect(
    (await new AxeBuilder({ page }).include('section[aria-label="Plan tomorrow"]').analyze())
      .violations,
  ).toEqual([])
  await card.getByLabel('Your preparation quantity').fill('30')
  await card.getByRole('button', { name: 'Review accepted plan' }).click()
  await expect(card).toContainText('Edited')
  await card.getByRole('button', { name: 'Confirm and save exact proposal' }).click()
  await expect(card).toContainText('Saved private plan')
  await card.getByRole('button', { name: 'Calculate suggestion' }).click()
  await card.getByRole('button', { name: 'Review declined plan' }).click()
  await card.getByRole('button', { name: 'Confirm and save exact proposal' }).click()
  await expect(card).toContainText('Declined')
  expect(await (await page.request.get(inventoryPath)).json()).toEqual(before)
  expect(await (await page.request.get(publicPath)).json()).toEqual(publicBefore)
  await page.getByLabel('Product', { exact: true }).click()
  await page.getByRole('option', { name: 'Packets (packet)' }).click()
  await card.getByRole('button', { name: 'Calculate suggestion' }).click()
  await expect(card).toContainText('Not enough history')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('owner entries require confirmation; outage clears forecast and preserves inputs', async ({
  page,
}) => {
  const historyRoute = '**/api/v1/businesses/*/planning/*'
  await page.route(historyRoute, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      : route.fallback(),
  )
  await openShop(page)
  // A different browser calendar date must not reject the server's today entry.
  await page.clock.setFixedTime(new Date('2000-01-01T12:00:00Z'))
  const card = page.getByRole('region', { name: 'Plan tomorrow' })
  await expect(card.getByRole('alert')).toContainText('Could not load or save planning')
  await page.unroute(historyRoute)
  await card.getByRole('button', { name: 'Reload planning history' }).click()
  await expect(card.getByRole('alert')).toHaveCount(0)
  await card.getByLabel("Today's sold count").fill('12')
  await card.getByRole('button', { name: 'Review sales entry' }).click()
  await card.getByRole('button', { name: 'Cancel review' }).click()
  await card.getByRole('button', { name: 'Method and history' }).click()
  await expect(card).not.toContainText('Complete 12')
  await card.getByRole('button', { name: 'Review sales entry' }).click()
  await card.getByRole('button', { name: 'Confirm and save exact proposal' }).click()
  await expect(card).toContainText('Complete')
  await page.route('**/planning/*/forecast', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  )
  await card.getByRole('button', { name: 'Calculate suggestion' }).click()
  await expect(card.getByRole('alert')).toContainText('Could not load or save planning')
  await expect(card.getByLabel("Today's sold count")).toHaveValue('12')
  await expect(card).not.toContainText('Mean baseline:')
})
