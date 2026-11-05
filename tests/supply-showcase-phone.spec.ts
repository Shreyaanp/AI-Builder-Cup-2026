import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from './stories/support.js'
import { openBuyStock } from './support/grow.js'

test('Today → forecast reorder → SAP → replies → reviewed stock → Today', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await openBuyStock(page)
  await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
  const today = page.getByRole('region', { name: 'Supply chain' })
  // The demo's earlier 12 l is on its way and nothing runs out before it lands (OB-263): the row
  // is news with no button; ordering more is Buy stock → Draft a reorder.
  await expect(today).toContainText(/Milk: 12 l arriving .+✓/)
  await expect(today.getByRole('button')).toHaveCount(0)
  const overflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await overflow()
  await page.screenshot({ path: 'output/playwright/supply-today.png' })
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const buyStock = await openBuyStock(page)
  await buyStock.getByRole('button', { name: 'Draft a reorder' }).click()
  const card = page.getByRole('article')
  await expect(card).toContainText('Drafted for you')
  await expect(card).toContainText('Minimum order: 12 l')
  await expect(card).toContainText('12 l price tier')
  await expect(card).toContainText('Demo supplier')
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await card.getByRole('button', { name: 'See the supplier’s copy', exact: true }).click()
  const sap = page.getByRole('dialog', { name: 'See the supplier’s copy' })
  await expect(sap.getByLabel('Supplier’s format')).toContainText('<IDOCTYP>ORDERS05</IDOCTYP>')
  await expect(sap).toContainText('In plain words')
  await expect(sap).toContainText('12 l Milk')
  await overflow()
  await page.screenshot({ path: 'output/playwright/supply-sap.png' })
  await page.keyboard.press('Escape')
  for (const step of ['Confirmed', 'On its way', 'Invoice']) {
    await card.getByRole('button', { name: 'See the supplier’s reply', exact: true }).click()
    const row = card.getByRole('listitem').filter({ hasText: step }).first()
    await expect(row).not.toContainText('Waiting')
    await expect(row).toContainText(/\d{1,2}:\d{2}/)
  }
  await overflow()
  await page.screenshot({ path: 'output/playwright/supply-timeline.png' })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await card.getByRole('button', { name: 'Goods arrived', exact: true }).click()
  // Saved at once with a plain note and Undo; no review sheet (OB-263).
  await expect(page.locator('.MuiSnackbar-root')).toContainText(
    /\d+ l Milk received\. Stock is now 27 l\./,
  )
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
  await expect(buyStock).toContainText('Received')
  await buyStock.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(buyStock).toHaveCount(0)
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await expect(today).toContainText('Milk stock topped up: 27 l')
  await expect(today.getByRole('button')).toHaveCount(0)
  const businesses = await (await page.request.get('/api/v1/businesses')).json()
  const shop = businesses.find(
    (b: { fields: { name: string } }) => b.fields.name === 'Milk shop (Supply demo)',
  )
  const stock = await (await page.request.get(`/api/v1/businesses/${shop.id}/inventory`)).json()
  expect(stock.find((p: { name: string }) => p.name === 'Milk').stock).toBe(27)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  // The workspace starts on its first shop after reload; the demo entry resumes its own shop.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await openBuyStock(page)
  await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
  // Said once: after the reload Today no longer repeats it, and asks for no reorder.
  const again = page.getByRole('region', { name: 'Supply chain' })
  await expect(page.getByTestId('today-needs')).toBeVisible()
  await expect(page.getByText('Milk stock topped up')).toHaveCount(0)
  await expect(again.getByRole('button', { name: 'Reorder', exact: true })).toHaveCount(0)
  await overflow()
  await page.screenshot({ path: 'output/playwright/supply-restocked.png' })
})
