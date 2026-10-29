import { expect, test } from '@playwright/test'
import { enter, image, liveOnly, localOnly, phone, seedShop, shopName, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S5 · shop details to Google preview and truthful handoff', async ({ page }) => {
  test.setTimeout(60_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Get on Google/ }).click()
  const flow = page.getByRole('region', { name: 'Google', exact: true })
  await test.step('1 · details reuse the owner shop', async () => {
    await page.getByRole('button', { name: 'Step 1 of 4: Details' }).click()
    await expect(flow.getByRole('heading', { name: 'Check your details' })).toBeVisible()
    await expect(flow.getByText('Missing', { exact: true })).toHaveCount(1) // phone intentionally absent
    await shot(page, 5, 1)
    await flow.getByRole('button', { name: 'Next', exact: true }).click()
  })
  await test.step('2 · photo upload persists for the profile', async () => {
    await expect(flow.getByRole('heading', { name: 'Add photos' })).toBeVisible()
    await flow.locator('input[type="file"]:not([capture])').setInputFiles(await image(page))
    await expect(flow.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
    await expect(flow.getByText('1 of 12 photos')).toBeVisible()
    await shot(page, 5, 2)
    await flow.getByRole('button', { name: 'Next', exact: true }).click()
  })
  await test.step('3 · profile preview shows local prices and saved details', async () => {
    await expect(flow.getByRole('heading', { name: shopName })).toBeVisible()
    await expect(flow).toContainText(/₹18(?![.\d])/)
    await expect(flow).toContainText('Indiranagar, Bengaluru')
    await expect(flow).toContainText('07:00')
    await shot(page, 5, 3)
    await flow.getByRole('button', { name: 'Next', exact: true }).click()
  })
  await test.step('4 · waiting state and official links', async () => {
    await expect(flow.getByText('Waiting for Google API access')).toBeVisible()
    await expect(flow.getByRole('link', { name: 'Add on Google' })).toHaveAttribute(
      'href',
      'https://business.google.com/add',
    )
    await expect(flow.getByRole('link', { name: 'Find & claim on Maps' })).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\/search\//,
    )
    await shot(page, 5, 4)
    liveOnly(
      'Google API access, business verification and publication; official links are inspected without opening them',
    )
  })
})
