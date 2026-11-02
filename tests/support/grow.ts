import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Grow is a short list (simplify batch 4a). How much to make, Buy stock and My sales each open
 * one sheet (batch 4b): How much to make holds the prep list and "Change the numbers" (what was
 * Plan tomorrow); Buy stock holds the tabs To do · On the way · My suppliers · Find a supplier
 * (what were Orders, Purchase orders, Supply chain and the runs-out card); My sales holds the
 * week and its "Week summary" (what were Your week and Weekly recap). Morning brief still opens
 * on the same screen to its slides.
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

export type StockTab = 'To do' | 'On the way' | 'My suppliers' | 'Find a supplier'

/** Grow → Buy stock, on `tab` (To do first). Returns the sheet. */
export async function openBuyStock(page: Page, tab: StockTab = 'To do') {
  await openGrowTool(page, /^Buy stock/)
  const sheet = page.getByRole('dialog', { name: /^Buy stock/ })
  await expect(sheet).toBeVisible()
  // The tabs lead the sheet (a form below may have a button of the same name).
  const button = sheet.getByRole('button', { name: new RegExp(`^${tab}`) }).first()
  if (tab !== 'To do') await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  return sheet
}

/** Grow → How much to make; with `numbers`, "Change the numbers" open too. Returns the sheet. */
export async function openMake(page: Page, numbers = false) {
  await openGrowTool(page, /^How much to make/)
  const sheet = page.getByRole('dialog', { name: 'How much to make' })
  await expect(sheet).toBeVisible()
  if (numbers) await sheet.getByRole('button', { name: 'Change the numbers' }).click()
  return sheet
}

/** Grow → My sales; with `summary`, the Week summary open too. Returns the sheet. */
export async function openMySales(page: Page, summary = false) {
  await openGrowTool(page, /^My sales/)
  const sheet = page.getByRole('dialog', { name: 'My sales' })
  await expect(sheet).toBeVisible()
  const button = sheet.getByRole('button', { name: /^Week summary/ })
  if (summary && (await button.getAttribute('aria-expanded')) === 'false') await button.click()
  return sheet
}
