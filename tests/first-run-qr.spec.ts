import { expect, test } from '@playwright/test'
import { enter, localOnly, shareSigned } from './stories/support.js'

// OB-65: a first-time customer who scans a shop's QR lands on the shop and its stamp, not on the
// 3-screen introduction, and (OB-208) the scan counts as engagement: it is not shown later either.
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
    // OB-20 (#360): the scan arms 'Collect your stamp' in the thumb zone; the moment opens on the tap.
    const collect = customer.getByRole('button', { name: 'Collect your stamp' })
    await expect(collect).toBeVisible({ timeout: 30_000 })
    await expect(customer.getByText('Find local shops near you')).toHaveCount(0)
    await collect.click()
    const done = customer.getByRole('dialog').getByRole('button', { name: 'Keep browsing' })
    await expect(done).toBeVisible({ timeout: 30_000 })
    await done.click()
    await expect(customer.getByRole('link', { name: /^Stamp card · / })).toBeVisible()
    // The next plain visit does not get the introduction: the QR scan already engaged them.
    await customer.goto('/explore')
    await expect(customer.getByRole('link', { name: /Passport$/ })).toBeVisible()
    await expect(customer.getByText('Find local shops near you')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
