import { expect, type Page } from '@playwright/test'

/** Shop → More (simplify batch 3): the stamp card and the billing app open under this row. */
export async function shopMore(page: Page) {
  const more = page.locator('[aria-controls="shop-more"]').filter({ visible: true }).first()
  await expect(more).toBeVisible({ timeout: 15_000 })
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
}
