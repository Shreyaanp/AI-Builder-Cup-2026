import { expect, type Page } from '@playwright/test'

/**
 * Grow is a short list (simplify batch 4a): How much to make, Buy stock and My sales open on the
 * same screen to the tools they hold (Prep plan, Plan tomorrow, Orders, Purchase orders, Supply
 * chain, Your week, Weekly recap), and Morning brief to its slides. Opens every such row, so a
 * test can tap a tool by its own name. Call it on the Grow tab.
 */
export async function openGrowRows(page: Page) {
  await expect(page.getByTestId('grow-tiles')).toBeVisible({ timeout: 15_000 })
  const closed = page.locator('[data-grow-group][aria-expanded="false"]').filter({ visible: true })
  for (let tries = 0; tries < 8 && (await closed.count()) > 0; tries++) {
    await closed.first().click()
  }
}
