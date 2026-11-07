import { expect, type Page } from '@playwright/test'

/** OB-168 / OB-188: public-shop setup includes the owner's explicit pin confirmation. */
export async function confirmShopPin(page: Page, name = 'This is my shop') {
  const map = page.getByTestId('map-card')
  await expect(map).toHaveAttribute('data-state', 'open')
  await expect(page.getByRole('progressbar', { name: 'Replying…', exact: true })).toHaveCount(0)
  await map.getByRole('button', { name, exact: true }).click()
  await expect(map).toHaveAttribute('data-state', 'done')
}

/** Fictional Singapore shop point, preserving the existing SGD test market. */
export async function suggestShopPin(
  page: Page,
  point = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru, Singapore' },
) {
  await page.route('**/api/v1/places/pin?*', (route) => route.fulfill({ json: point }))
}
