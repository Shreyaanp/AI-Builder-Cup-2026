import { expect, test } from '@playwright/test'
import { closeSheet, enter, localOnly, phone, seedShop, share, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
for (const hasPhone of [false, true]) {
  test(`A11 · preview labels are inert and Call ${hasPhone ? 'is shown' : 'is absent'}`, async ({
    page,
  }) => {
    await localOnly(page)
    await enter(page)
    await seedShop(page)
    if (hasPhone) {
      const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
      const edit = await (
        await page.request.post('/api/v1/proposals', {
          data: {
            kind: 'business',
            business_id: shop.id,
            revision: shop.revision,
            business: { ...shop.fields, phone: '+919876543210' },
          },
        })
      ).json()
      expect(
        (
          await page.request.post(`/api/v1/proposals/${edit.id}/approve`, {
            data: { digest: edit.digest },
          })
        ).ok(),
      ).toBe(true)
      await page.reload()
      await page.getByRole('button', { name: 'Continue local preview' }).click()
    }
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Get on Google/ }).click()
    await page.getByRole('button', { name: 'Step 3 of 4: Preview' }).click()
    const preview = page.getByRole('list', { name: 'Preview', exact: true })
    await expect(preview).toContainText('Directions · Preview')
    await expect(preview.getByRole('button')).toHaveCount(0)
    await expect(preview.locator('[tabindex]')).toHaveCount(0)
    await expect(preview.getByText('Call · Preview')).toHaveCount(hasPhone ? 1 : 0)
    await shot(page, 5, `A11-preview-${hasPhone ? 'phone' : 'no-phone'}`)
  })
}
test('A11 · Tamil composer and navigation have room for script metrics', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: /தமிழ்/ }).click()
  await closeSheet(page)
  await page.locator('[data-tour="nav-coach"]').click()
  await page.evaluate(() => document.fonts.ready)
  const field = page.locator('textarea[name="message"]')
  expect(
    await field.evaluate((node) => Number.parseFloat(getComputedStyle(node).lineHeight)),
  ).toBeGreaterThanOrEqual(32)
  expect(await field.evaluate((node) => node.clientHeight >= node.scrollHeight)).toBe(true)
  await shot(page, 7, 'A11-tamil-placeholder')
  await field.fill('வணக்கம் கடையின் விலைப்பட்டியல்')
  const labels = page
    // The tab bar's landmark name is in the app language too.
    .getByRole('navigation', { name: 'முதன்மை வழிசெலுத்தல்' })
    .locator('button p, button span.MuiTypography-root')
  expect(await labels.count()).toBeGreaterThan(0)
  for (const label of await labels.all()) {
    expect(await label.evaluate((node) => node.clientHeight >= node.scrollHeight)).toBe(true)
  }
  await shot(page, 7, 'A11-tamil-input')
})
test('A11 · customer light mode separates menu and background surfaces', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  const url = await share(page)
  await page.goto(url)
  await page.emulateMedia({ colorScheme: 'light' })
  const menu = page.getByRole('listitem').filter({ hasText: 'Kopi' }).locator('..')
  const background = await page
    .locator('body')
    .evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(await menu.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(background)
  await shot(page, 3, 'A11-light-surfaces')
})
