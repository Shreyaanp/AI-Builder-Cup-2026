import type { Page } from '@playwright/test'

/**
 * Opens the full-screen new-shop flow the way an owner does once the top bar has no "+"
 * (simplify batch 5, SIMPLIFY-owner.md §3.7): the shop switcher ▾ → "New shop".
 */
export async function startNewShop(page: Page) {
  await page
    .locator('header[data-app-header]')
    .getByRole('button', { name: /^Choose shop/ })
    .click()
  await page.getByRole('menuitem', { name: 'New shop', exact: true }).click()
}
