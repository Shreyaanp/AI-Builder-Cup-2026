import { test, expect, owner, audit, tamil } from './support.js'

test('CSV sales total is exact, approval is required, saved history feeds forecast', async ({
  page,
}) => {
  const id = await owner(page)
  const freshness = await (await page.request.get(`/api/v1/businesses/${id}/freshness`)).json()
  const today = new Date(`${freshness.today}T12:00:00Z`)
  const rows = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(today)
    date.setUTCDate(date.getUTCDate() - i)
    return `${date.toISOString().slice(0, 10)},Kopi,30,540`
  })
  const proposal = await (
    await page.request.post(`/api/v1/businesses/${id}/import`, {
      headers: { 'Content-Type': 'text/csv' },
      data: `Date,Item,Qty,Revenue\n${rows.join('\n')}`,
    })
  ).json()
  expect(await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()).toEqual([])
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Prep plan/ })).toContainText(
    'Import and save at least 4 weeks',
  )
  expect(
    (
      await page.request.post(`/api/v1/businesses/${id}/import/${proposal.import_id}/approve`, {
        data: { digest: proposal.digest },
      })
    ).ok(),
  ).toBe(true)
  const saved = (await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()) as {
    quantity: number
    revenue: number
  }[]
  expect(saved).toHaveLength(28)
  expect(saved.reduce((sum, row) => sum + row.quantity, 0)).toBe(840)
  expect(saved.reduce((sum, row) => sum + row.revenue, 0)).toBe(1_512_000)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Prep plan/ })).toContainText('Kopi · 30')
  await audit(page)
})

test('menu CSV imports through UI and never saves on cancel', async ({ page }) => {
  const id = await owner(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
  const file = page.locator('input[type=file][accept*=".xlsx"]')
  await file.setInputFiles({
    name: 'menu.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Item Name,Price\nQA tea,19.25\n'),
  })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('₹19.25')
  await page.keyboard.press('Escape')
  const products = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  expect(products.some((p: { name: string }) => p.name === 'QA tea')).toBe(false)
})

test('planning empty state, validation and outage preserve typed counts', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Plan tomorrow/ }).click()
  const plan = page.getByRole('region', { name: 'Plan tomorrow' })
  await plan.getByLabel('Ready stock').fill('20')
  await plan.getByLabel('Additional capacity').fill('60')
  await plan.getByRole('button', { name: 'Calculate suggestion' }).click()
  await expect(plan).toContainText('Not enough history')
  await page.route('**/planning/*/forecast', (r) => r.fulfill({ status: 503, json: {} }))
  await plan.getByRole('button', { name: 'Calculate suggestion' }).click()
  await expect(plan.getByRole('alert')).toContainText('Could not load or save planning')
  await expect(plan.getByLabel('Ready stock')).toHaveValue('20')
  await audit(page)
})

test('Tamil forecast tiles remain readable', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await tamil(page)
  await expect(page.locator('[data-tour="prep"]')).toBeVisible()
  await audit(page)
})
