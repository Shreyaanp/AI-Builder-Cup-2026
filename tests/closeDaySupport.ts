import { expect, type Locator } from '@playwright/test'

/** Existing save stories also work before 4 PM; the early-close decision has its own OB-267 test. */
export async function saveCloseDay(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click()
  const early = dialog.getByRole('button', { name: 'Close anyway', exact: true })
  await expect(
    early
      .or(dialog.getByRole('button', { name: 'Done', exact: true }))
      .or(dialog.getByRole('alert').filter({ hasText: 'Couldn’t finish saving' }))
      .first(),
  ).toBeVisible({ timeout: 20_000 })
  if (await early.isVisible()) await early.click()
}
