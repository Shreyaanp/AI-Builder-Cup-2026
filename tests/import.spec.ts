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

test('a POS sales export shows a summary that is not saved', async ({ page }) => {
  await shopWithoutMenu(page)
  await page
    .locator('input[type="file"][accept*=".xlsx"]')
    .setInputFiles(csv('Date,Item,Qty,Net Sales\n2026-10-12,Kopi,30,54\n2026-10-13,Kopi,25,45\n'))
  const summary = page.getByRole('dialog', { name: 'Sales summary' })
  await expect(summary).toContainText('Nothing was saved')
  await expect(summary).toContainText('$99.00')
  await expect(summary).toContainText('Kopi')
})
