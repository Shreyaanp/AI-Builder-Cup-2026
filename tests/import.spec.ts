import { expect, test, type Page } from '@playwright/test'

async function shopWithoutMenu(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByLabel('Shop name').fill('Ah Seng Kopi')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Check before saving' })
    .getByRole('button', { name: 'Confirm and save' })
    .click()
  await page.getByRole('button', { name: 'My shop' }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  // The sheet's compact "Import" action opens its choices in the sheet (B28).
  await page.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
}

const csv = (text: string) => ({
  name: 'pos-export.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(text),
})

test('a POS menu export becomes a proposal the owner reviews', async ({ page }) => {
  await shopWithoutMenu(page)
  await page
    .locator('input[type="file"][accept*=".xlsx"]')
    .setInputFiles(csv('Item Name,Price\nKopi,1.80\nKaya toast,2.50\n'))
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Kopi')
  await expect(review).toContainText('Kaya toast')
  await expect(review).toContainText('$2.50')
})

test('a POS sales export waits for confirmation then appears in the weekly recap', async ({
  page,
}) => {
  await shopWithoutMenu(page)
  const businesses = await page.request.get('/api/v1/businesses').then((r) => r.json())
  const bid = businesses[0].id as string
  const freshness = await page.request
    .get(`/api/v1/businesses/${bid}/freshness`)
    .then((r) => r.json())
  const [year, week] = (freshness.recap_week as string).split('-W').map(Number)
  const fourth = new Date(Date.UTC(year!, 0, 4))
  const day = fourth.getUTCDay() || 7
  fourth.setUTCDate(fourth.getUTCDate() - day + 1 + (week! - 1) * 7)
  const saleDate = fourth.toISOString().slice(0, 10)
  await page
    .locator('input[type="file"][accept*=".xlsx"]')
    .setInputFiles(csv(`Date,Item,Qty,Net Sales\n${saleDate},Kopi,30,54\n${saleDate},Kopi,25,45\n`))
  const summary = page.getByRole('dialog', { name: 'Sales summary' })
  await expect(summary).toContainText('Nothing was saved')
  await expect(summary).toContainText('$99.00')
  await expect(summary).toContainText('Kopi')
  await expect(summary).toContainText('Saving replaces all sales on these dates')
  expect(await page.request.get(`/api/v1/businesses/${bid}/sales`).then((r) => r.json())).toEqual(
    [],
  )
  await summary.getByRole('button', { name: 'Save these sales' }).click()
  await expect(summary).not.toBeVisible()
  await page.getByRole('button', { name: /^Weekly recap/ }).click()
  const recap = page.getByRole('dialog', { name: 'Weekly recap' })
  await expect(recap.getByText('Written by AI', { exact: true })).toHaveCount(0)
  await expect(recap).toContainText('Offline template')
  await expect(recap).toContainText('$99.00')
  await expect(recap).toContainText('1 sales days saved')
  await recap.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'My shop' }).click()
  await page.getByRole('button', { name: /^Weekly recap/ }).click()
  await expect(page.getByRole('dialog', { name: 'Weekly recap' })).toContainText('$99.00')
})

test('daily menu confirmation is an owner switch and changes the customer freshness label', async ({
  page,
}) => {
  await shopWithoutMenu(page)
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Something changed' }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Today: ')
  const coach = page.getByRole('region', { name: 'Coach', exact: true })
  await coach.getByRole('button', { name: 'Yes, all good' }).click()
  await expect(coach.getByText('Still the same menu today?')).not.toBeVisible()
  const businesses = await page.request.get('/api/v1/businesses').then((r) => r.json())
  const bid = businesses[0].id as string
  await page.request.post(`/api/v1/businesses/${bid}/share`, { data: { public: true } })
  await page.goto(`/s/${bid}`)
  await expect(page.getByText('Updated today', { exact: true })).toBeVisible()
})
