import { expect, test } from '@playwright/test'
import { enter, localOnly, shareSigned } from './stories/support.js'

// OB-65: a first-time customer who scans a shop's QR lands on the shop and its stamp, not on the
// 3-screen introduction; the introduction waits for their next visit.
test('OB-65: a first QR scan skips the intro and opens the shop and its stamp', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  const name = `Qr First ${Date.now().toString().slice(-5)}`
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      revision: 0,
      geocode_confirmed: true,
      business: {
        name,
        category: 'Bakery',
        location: 'Tiong Bahru, Singapore',
        reward_text: 'A free kaya bun',
        stamps_needed: 8,
      },
      products: [],
    },
  })
  expect(prepared.ok(), await prepared.text()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok(), await approved.text()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
  const { qr } = await shareSigned(page)

  // A device that has never seen the intro.
  const viewport = page.viewportSize()!
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    storageState: { cookies: [], origins: [] },
  })
  const customer = await context.newPage()
  try {
    await localOnly(customer)
    await customer.goto(qr)
    await expect(customer.getByRole('dialog').getByRole('button', { name: 'Done' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(customer.getByText('Find local shops near you')).toHaveCount(0)
    await customer.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
    await expect(customer.getByRole('link', { name: /^Stamp card · / })).toBeVisible()
    // The next plain visit still gets the introduction once.
    await customer.goto('/explore')
    await expect(customer.getByText('Find local shops near you')).toBeVisible()
  } finally {
    await context.close()
  }
})
