import { expect, test } from '@playwright/test'
import { closeSheet, confirm, enter, localOnly, phone, seedShop, share, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
test('A3 · independent customer context polls visible prices and availability', async ({
  page,
  browser,
}) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  const url = await share(page)
  await closeSheet(page)
  const customerContext = await browser.newContext(phone)
  const customer = await customerContext.newPage()
  try {
    await localOnly(customer)
    await customer.goto(url)
    const kopi = customer.getByRole('listitem').filter({ hasText: 'Kopi' })
    await expect(kopi).toContainText('₹18.00')
    await page.getByRole('button', { name: /^Menu/ }).click()
    await page.getByRole('button', { name: /^Edit Kopi/ }).click()
    await page.getByLabel(/^Price/).fill('20')
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await confirm(page)
    await expect(kopi).toContainText('₹20.00', { timeout: 5200 })
    await expect(kopi.locator('[data-price-changed]')).toBeVisible()
    await customer.screenshot({ path: 'docs/stories/S2-A3-price.png', animations: 'allow' })
    await expect(kopi.locator('[data-price-changed]')).toHaveCount(0)
    await page.getByRole('button', { name: /^Sold out today/ }).click()
    await page.getByRole('switch', { name: 'Available: Kaya toast' }).click()
    await expect(customer.getByRole('listitem').filter({ hasText: 'Kaya toast' })).toContainText(
      'Sold out',
      { timeout: 5200 },
    )
    await shot(customer, 2, 'A3-sold-out')
    let reads = 0
    customer.on('request', (request) => {
      if (
        request.url() ===
        new URL(url).origin + '/api/v1/public/shops/' + url.split('/').filter(Boolean).at(-1)
      )
        reads++
    })
    await customer.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await customer.waitForTimeout(4300)
    expect(reads).toBe(0)
    await customer.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => reads).toBe(1)
  } finally {
    await customerContext.close()
  }
})
