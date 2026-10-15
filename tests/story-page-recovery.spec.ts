import { expect, test } from '@playwright/test'
import { localOnly, phone, shot } from './stories/support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, '390×844 regression evidence')
test('an unavailable shared shop gives the customer a route back to nearby shops', async ({
  page,
}) => {
  await localOnly(page)
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.route('**/api/v1/public/shops/*', (route) => route.fulfill({ status: 404, json: {} }))
  await page.goto('/explore/s/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  await expect(page.getByRole('heading', { name: 'This shop page isn’t available.' })).toBeVisible()
  await shot(page, 3, '4-unavailable')
  const back = page.getByRole('link', { name: 'Back', exact: true })
  await expect(back).toHaveAttribute('href', '/explore/')
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible()
})
