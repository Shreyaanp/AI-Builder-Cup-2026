import { test, expect, owner, image, audit, tamil, evidence } from './support.js'

test('Google details → gallery → INR preview → honest waiting state, reload keeps gallery', async ({
  page,
}) => {
  await owner(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Get on Google/ }).click()
  const flow = page.getByRole('region', { name: 'Google', exact: true })
  await page.getByRole('button', { name: 'Step 1 of 4: Details' }).click()
  await flow.getByRole('button', { name: 'Next', exact: true }).click()
  await flow.locator('input[type=file]:not([capture])').setInputFiles(await image(page))
  await expect(flow.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
  await flow.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(flow).toContainText(/₹18(?![.d])/)
  await expect(flow.getByRole('link', { name: 'Call', exact: true })).toHaveCount(0)
  await flow.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(flow.getByText('Waiting for Google API access')).toBeVisible()
  await expect(flow.getByRole('link', { name: 'Add on Google' })).toHaveAttribute(
    'href',
    'https://business.google.com/add',
  )
  await audit(page)
  await evidence(page, 'google-waiting')
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Get on Google/ }).click()
  await page.getByRole('button', { name: 'Step 2 of 4: Photos' }).click()
  await expect(flow.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
})

test('Google gallery error is recoverable without claiming successful upload', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Get on Google/ }).click()
  await page.getByRole('button', { name: 'Step 2 of 4: Photos' }).click()
  await page.route('**/gallery*', (r) =>
    r.request().method() === 'POST' ? r.fulfill({ status: 503, json: {} }) : r.fallback(),
  )
  await page
    .getByRole('region', { name: 'Google', exact: true })
    .locator('input[type=file]:not([capture])')
    .setInputFiles(await image(page))
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove photo 1' })).toHaveCount(0)
})

test('Tamil Google guide has local labels and supports keyboard navigation', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await tamil(page)
  await page.locator('[data-tour="google"]').click()
  await audit(page)
})
