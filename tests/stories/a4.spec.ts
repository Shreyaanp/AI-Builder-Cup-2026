import { expect, test } from '@playwright/test'
import { enter, localOnly, phone, seedShop, share, shot } from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone evidence')
for (const [state, chip, answer] of [
  ['yes', 'Halal', 'Halal, according to the owner.'],
  ['no', 'Not halal', 'Not halal, according to the owner.'],
  [
    'muslim_owned',
    'Muslim-owned',
    'Muslim-owned, according to the owner. Halal status is not stated.',
  ],
  ['not_stated', '', 'Halal status is not listed.'],
]) {
  test(`A4 · ${state} fact chip and offline answer agree`, async ({ page }) => {
    await localOnly(page)
    await enter(page)
    await seedShop(page)
    const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
    const proposal = await (
      await page.request.post('/api/v1/proposals', {
        data: {
          kind: 'business',
          business_id: shop.id,
          revision: shop.revision,
          business: { ...shop.fields, halal: state },
        },
      })
    ).json()
    expect(
      (
        await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
          data: { digest: proposal.digest },
        })
      ).ok(),
    ).toBe(true)
    const url = await share(page)
    await page.goto(url)
    if (chip) await expect(page.getByText(chip, { exact: true })).toBeVisible()
    else await expect(page.getByText('Halal', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Chat with the shop' }).click()
    await page.getByLabel('Your question').fill('halal?')
    await page.getByLabel('Your question').press('Enter')
    await expect(page.getByRole('status').filter({ hasText: answer })).toContainText(
      'Not certified or verified by Chalkboard',
    )
    await shot(page, 3, `A4-${state}`)
  })
}
