import { expect, test } from '@playwright/test'
import { enter, localOnly, phone, seedShop, shot } from './stories/support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, '390×844 regression evidence')
test('Google handoff copies structured hours, not just the free-text note', async ({
  page,
  context,
}) => {
  await localOnly(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Get on Google/ }).click()
  await page.getByRole('button', { name: 'Step 4 of 4: Google' }).click()
  await page.getByRole('button', { name: 'Copy listing details' }).click()
  await expect(page.getByText('Listing details copied', { exact: true })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('Thursday: 07:00–20:00')
  expect(copied).toContain('Kopi ₹18/cup')
  await shot(page, 5, '4-copy-hours')
})
