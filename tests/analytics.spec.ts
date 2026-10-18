import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** ISO date `back` days ago in UTC: a shop made through page.request sends no timezone, so its day is UTC's. */
function shopDay(back: number) {
  return new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
}

async function shopWithTwoWeeksOfSales(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: { name: 'Tiong Bahru Kopi', location: 'Tiong Bahru, Singapore' },
      products: [{ name: 'Kopi', price: 180, unit: 'cup' }],
    },
  })
  const proposal = await prepared.json()
  const saved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  const { business_id: id } = await saved.json()
  // This week sells a little more than last week.
  for (let back = 14; back >= 1; back--) {
    const cups = back <= 7 ? 40 + back : 25 + back
    const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
      data: { date: shopDay(back), sales: [{ item: 'Kopi', quantity: cups, amount: cups * 1.8 }] },
    })
    expect(day.ok()).toBeTruthy()
    const { sales } = await day.json()
    const approved = await page.request.post(
      `/api/v1/businesses/${id}/import/${sales.import_id}/approve`,
      { data: { digest: sales.digest } },
    )
    expect(approved.ok()).toBeTruthy()
  }
  return id as string
}

test('Your week: yesterday and this week against last week, from saved sales', async ({
  page,
}, info) => {
  // Seeds two weeks of sales through the API (28 requests) before the UI checks.
  test.setTimeout(60_000)
  const id = await shopWithTwoWeeksOfSales(page)
  const analytics = await (await page.request.get(`/api/v1/businesses/${id}/analytics`)).json()
  expect(analytics.source).toBe('live')
  expect(analytics.week.sales).toBeGreaterThan(analytics.last_week.sales)

  // Back into the workspace so it loads the shop and its saved sales.
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  // Insights live on Grow.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const tile = page.getByRole('button', { name: /^Your week/ })
  await expect(tile).toContainText(/\+\d+% vs last week/)
  await tile.click()
  const sheet = page.getByRole('dialog', { name: 'Your week' })
  await expect(sheet.getByText('Yesterday')).toBeVisible()
  await expect(sheet.getByRole('definition').first()).toHaveText(/73.80/)
  await expect(sheet.getByText('This week', { exact: true }).first()).toBeVisible()
  await expect(sheet.getByText('From your saved sales')).toBeVisible()
  // The same numbers for screen readers.
  await expect(sheet.locator('table caption')).toHaveText('Daily sales')
  await page.waitForTimeout(700) // the sheet has finished sliding in
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role=dialog]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({ path: `docs/stories/analytics-week-${info.project.name}.png` })
})
