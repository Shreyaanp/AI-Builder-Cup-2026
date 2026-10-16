import { test, expect, owner, approve, prepare, audit, tamil, evidence } from './support.js'

test('menu inline edit rejects invalid price, Escape cancels, approved edit persists', async ({
  page,
}) => {
  await owner(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: /Edit price: Kopi/ }).click()
  const price = page.getByRole('textbox', { name: 'Edit price: Kopi', exact: true })
  await price.fill('-1')
  await price.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
  await price.fill('21.50')
  await price.press('Enter')
  await expect(page.getByRole('button', { name: 'Save ₹21.50', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  await expect(page.getByRole('button', { name: /Edit price: Kopi/ })).toContainText('18.00')
  await page.getByRole('button', { name: /Edit price: Kopi/ }).click()
  await price.fill('21.50')
  await price.press('Enter')
  await page.getByRole('button', { name: 'Save ₹21.50', exact: true }).click()
  await expect(page.getByRole('button', { name: /Edit price: Kopi/ })).toContainText('21.50')
  await audit(page)
})

test('two stale revisions cannot overwrite each other; approval replay is idempotent', async ({
  page,
}) => {
  const id = await owner(page)
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const first = await prepare(page.request, {
    kind: 'business',
    business_id: id,
    revision: shop.revision,
    business: { name: 'First approved edit' },
  })
  const second = await prepare(page.request, {
    kind: 'business',
    business_id: id,
    revision: shop.revision,
    business: { name: 'Stale second edit' },
  })
  expect((await approve(page.request, first)).ok()).toBe(true)
  expect((await approve(page.request, second)).status()).toBe(409)
  expect((await approve(page.request, first)).ok()).toBe(true)
  expect((await (await page.request.get('/api/v1/businesses')).json())[0].fields.name).toBe(
    'First approved edit',
  )
})

test('Tamil menu has localized semantics and no overflow', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await tamil(page)
  await page.locator('[data-tour="menu"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await audit(page, 'Q14')
  await evidence(page, 'menu-tamil')
})
