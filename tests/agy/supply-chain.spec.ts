import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from '../stories/support.js'

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

    // Navigate to Grow → Purchase orders → Try supply demo
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()

    // 1. Today view displays supply chain warning card
    const todaySupply = page.getByRole('region', { name: 'Supply chain' })
    await expect(todaySupply).toBeVisible({ timeout: 15_000 })
    await expect(todaySupply).toContainText(/Milk runs out/i)

    // 2. Click Reorder on the supply card
    await todaySupply.getByRole('button', { name: 'Reorder', exact: true }).click()
    const orderCard = page.getByRole('article')
    await expect(orderCard).toBeVisible()
    await expect(orderCard).toContainText('AI draft · offline rules')
    await expect(orderCard).toContainText(/Minimum order/i)

    // 3. Outbound PO: Approve and send
    await orderCard.getByRole('button', { name: 'Approve and send', exact: true }).click()

    // View as SAP IDoc
    await orderCard.getByRole('button', { name: 'View as SAP (IDoc)', exact: true }).click()
    const sapDialog = page.getByRole('dialog', { name: 'View as SAP (IDoc)' })
    await expect(sapDialog.getByLabel('SAP IDoc')).toContainText('<IDOCTYP>ORDERS05</IDOCTYP>')
    await expect(sapDialog).toContainText('In plain words')
    await page.keyboard.press('Escape')

    // 4. Inbound simulation: simulate supplier replies across the timeline
    for (const step of ['Confirmed (ORDRSP)', 'Shipping notice (DESADV)', 'Invoice']) {
      await orderCard.getByRole('button', { name: 'Simulate supplier reply', exact: true }).click()
      const row = orderCard.getByRole('listitem').filter({ hasText: step }).first()
      await expect(row).not.toContainText('Waiting')
    }

    // 5. Goods arrived: mark received and save stock
    await orderCard.getByRole('button', { name: 'Goods arrived', exact: true }).click()
    const reviewDialog = page.getByRole('dialog', { name: 'Check before saving' })
    await expect(reviewDialog).toContainText('Milk')
    await reviewDialog.getByRole('button', { name: 'Confirm and save', exact: true }).click()
    await expect(reviewDialog).toHaveCount(0)

    // Orders dialog confirms received
    const ordersDialog = page.getByRole('dialog', { name: 'Purchase orders', exact: true })
    await expect(ordersDialog).toContainText('Received')
    await ordersDialog.getByRole('button', { name: 'Close', exact: true }).click()

    // Verify Today view updates to show Milk restocked
    await expect(todaySupply).toContainText('Milk restocked')
    await expect(todaySupply.getByRole('button', { name: 'Reorder', exact: true })).toHaveCount(0)

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
    await page.getByRole('button', { name: /^Purchase orders/ }).click()
    await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()

    // Open Supply chain hub
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await page.getByRole('button', { name: /^Supply chain/ }).click()
    const hub = page.getByRole('dialog', { name: 'Supply chain' })
    await expect(hub).toBeVisible()

    // INBOUND: Partner sends next document (forecast, order, order changed)
    await hub.getByRole('button', { name: /^Coming in/ }).click()
    const nextDocBtn = hub.getByRole('button', { name: 'Partner sends next document (demo)' })
    await expect(nextDocBtn).toBeVisible()
    await nextDocBtn.click()
    await expect(hub).toContainText('Forecast')

    await nextDocBtn.click()
    await expect(hub).toContainText('New order')

    await nextDocBtn.click()
    await expect(hub).toContainText('Order changed')

    // OUTBOUND: Accept order change and check shipping notice
    await hub.getByRole('button', { name: /^Needs me now/ }).click()
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
