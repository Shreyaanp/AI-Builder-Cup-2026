import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Grow is a short list (simplify batch 4a): How much to make, Buy stock and My sales open on the
 * same screen to the tools they hold (Prep plan, Plan tomorrow, Orders, Purchase orders, Supply
 * chain, Your week, Weekly recap), and Morning brief to its slides. These helpers open the rows
 * on the Grow tab, so a test can still reach a tool by its own name.
 */
export async function openGrowRows(page: Page) {
  await expect(page.getByTestId('grow-tiles')).toBeVisible({ timeout: 15_000 })
  const closed = page.locator('[data-grow-group][aria-expanded="false"]').filter({ visible: true })
  for (let tries = 0; tries < 8 && (await closed.count()) > 0; tries++) {
    await closed.first().click()
  }
}

/** `target` on Grow, visible: opens the rows (as they load) until it shows. */
export async function showInGrow(page: Page, target: Locator, timeout = 30_000) {
  await expect(async () => {
    if (!(await target.first().isVisible())) await openGrowRows(page)
    await expect(target.first()).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout })
  return target
}

/** The Grow tool named `name` (a tile's accessible name starts with its label), made visible. */
export function growTool(page: Page, name: RegExp | string) {
  return showInGrow(page, page.getByRole('button', { name }))
}

/** Taps the Grow tool named `name`, opening its row first when it sits in one. */
export async function openGrowTool(page: Page, name: RegExp | string) {
  await (await growTool(page, name)).click()
}
