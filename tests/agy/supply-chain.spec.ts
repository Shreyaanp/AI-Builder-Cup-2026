import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from '../stories/support.js'
import { openBuyStock } from '../support/grow.js'

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test.describe('Supply chain flows on phone (390px)', () => {
  test('Today supply card → reorder → order timeline → goods arrived → restocked', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await enter(page)
    await seedShop(page)
    await page.keyboard.press('Escape')

    // Navigate to Grow → Buy stock → Try supply demo
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await openBuyStock(page)
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()

    // 1. Today view displays supply chain warning card
    const todaySupply = page.getByRole('region', { name: 'Supply chain' })
    await expect(todaySupply).toBeVisible({ timeout: 15_000 })
    // The demo's earlier 12 l is on its way and counted, and nothing runs out before it lands
    // (OB-263): the row is news only, with no button.
    await expect(todaySupply).toContainText(/Milk: 12 l arriving .+✓/)
    await expect(todaySupply.getByRole('button')).toHaveCount(0)

    // 2. Ordering more is Buy stock → Draft a reorder
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const stock = await openBuyStock(page)
    await stock.getByRole('button', { name: 'Draft a reorder' }).click()
    const orderCard = page.getByRole('article')
    await expect(orderCard).toBeVisible()
    await expect(orderCard).toContainText('Drafted for you')
    await expect(orderCard).toContainText(/Minimum order/i)

    // 3. Outbound PO: Approve and send
    await orderCard.getByRole('button', { name: 'Approve and send', exact: true }).click()

    // View as Supplier’s format
    await orderCard.getByRole('button', { name: 'See the supplier’s copy', exact: true }).click()
    const sapDialog = page.getByRole('dialog', { name: 'See the supplier’s copy' })
    await expect(sapDialog.getByLabel('Supplier’s format')).toContainText(
      '<IDOCTYP>ORDERS05</IDOCTYP>',
    )
    await expect(sapDialog).toContainText('In plain words')
    await page.keyboard.press('Escape')

    // 4. Inbound simulation: simulate supplier replies across the timeline
    for (const step of ['Confirmed', 'On its way', 'Invoice']) {
      await orderCard.getByRole('button', { name: 'See the supplier’s reply', exact: true }).click()
      const row = orderCard.getByRole('listitem').filter({ hasText: step }).first()
      await expect(row).not.toContainText('Waiting')
    }

    // 5. Goods arrived: the stock is saved at once, said plainly with Undo (OB-263)
    await orderCard.getByRole('button', { name: 'Goods arrived', exact: true }).click()
    await expect(page.locator('.MuiSnackbar-root')).toContainText(
      /\d+ l Milk received\. Stock is now \d+ l\./,
    )
    await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)

    // Orders dialog confirms received
    await expect(stock).toContainText('Received')
    await stock.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Coach', exact: true }).click()

    // Verify Today view says the stock was topped up, with nothing to reorder
    await expect(todaySupply).toContainText(/Milk stock topped up: \d+ l/)
    await expect(todaySupply.getByRole('button')).toHaveCount(0)

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('Purchase orders inbound and outbound flow in Supply hub', async ({ page }) => {
    test.setTimeout(180_000)
    await enter(page)
    await seedShop(page)
    await page.keyboard.press('Escape')

    // Enable demo supply
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await openBuyStock(page)
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()

    // Open Buy stock → On the way (what was the Supply chain hub, batch 4b)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    const hub = await openBuyStock(page, 'On the way')

    // INBOUND: Partner sends next document (forecast, order, order changed)
    const nextDocBtn = hub.getByRole('button', { name: 'Show next step (demo)' })
    await expect(nextDocBtn).toBeVisible()
    await nextDocBtn.click()
    await expect(hub).toContainText('Forecast')

    await nextDocBtn.click()
    await expect(hub).toContainText('New order')

    await nextDocBtn.click()
    await expect(hub).toContainText('Order changed')

    // OUTBOUND: Accept order change and check shipping notice
    await hub.getByRole('button', { name: /^To do/ }).click()
    await hub.getByRole('button', { name: /Harbour Café \(Demo\) changed an order/ }).click()
    const cafeDialog = page.getByRole('dialog', { name: 'Harbour Café (Demo)' })
    await expect(cafeDialog).toBeVisible()
    await cafeDialog.getByRole('button', { name: 'Accept change', exact: true }).click()
    await expect(cafeDialog.getByRole('button', { name: 'Send shipping notice' })).toBeVisible()
    await cafeDialog.getByRole('button', { name: 'Close', exact: true }).click()

    // Verify phone viewport has no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })
})
