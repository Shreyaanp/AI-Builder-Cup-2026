import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const banner = 'Simulated — no Google listing is created or changed'
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Google owner journey (simulation)' })

async function labelled(page: Page) {
  await expect(dialog(page).getByText(banner, { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
}

async function open(page: Page, scenario = 'new-store-success', type = 'Customers visit') {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.goto(`/?sim=${scenario}`)
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByLabel('Shop name').fill('Simulator Tea')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await page.getByRole('button', { name: 'Google', exact: true }).click()
  await page.getByRole('button', { name: 'Put my shop on Google (simulation)' }).click()
  await labelled(page)
  await dialog(page).getByRole('button', { name: 'Put my shop on Google (simulation)' }).click()
  await labelled(page)
  await dialog(page).getByRole('button', { name: type, exact: true }).click()
  await labelled(page)
  await expect(dialog(page).getByLabel('Shop name')).toHaveValue('Simulator Tea')
  await expect(dialog(page).getByLabel('Shop name')).toHaveAttribute('readonly', '')
  await dialog(page).getByLabel('Address', { exact: true }).fill('Demo Market Road')
  await dialog(page).getByLabel('Hours', { exact: true }).fill('09:00–18:00')
  await dialog(page).getByLabel('Contact', { exact: true }).fill('Fictional contact')
  if (type === 'I visit customers (service area)') {
    await dialog(page).getByLabel('Public service area').fill('Demo Pune area')
  }
  await dialog(page).getByLabel('Google category fixture').click()
  await page.getByRole('option', { name: 'Tea shop', exact: true }).click()
  await expect(page.locator('[role="listbox"]')).toHaveCount(0)
}

async function review(page: Page) {
  await dialog(page).getByRole('button', { name: 'Continue', exact: true }).click()
  await labelled(page)
  await dialog(page)
    .getByRole('button', { name: 'Demo owner account (fictional)', exact: true })
    .click()
  await labelled(page)
  await dialog(page).getByRole('button', { name: 'Create a new simulated listing' }).click()
  await labelled(page)
  await expect(dialog(page).getByText('Checked locally — not validated by Google')).toBeVisible()
}

async function submit(page: Page) {
  await dialog(page)
    .getByRole('button', { name: 'Approve this revision and simulate submission' })
    .click()
  await labelled(page)
}

async function code(page: Page) {
  await dialog(page).getByRole('button', { name: 'SMS (fictional)', exact: true }).click()
  await labelled(page)
  await dialog(page).getByLabel('Fictional code', { exact: true }).fill('123456')
  await dialog(page).getByRole('button', { name: 'Check fictional code', exact: true }).click()
  await labelled(page)
}

test('new-store-success: labelled journey, local validation, verified and publication separate; axe on facts/review', async ({
  page,
}) => {
  if (test.info().project.name === 'phone') await page.setViewportSize({ width: 412, height: 915 })
  await open(page)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await review(page)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await submit(page)
  await code(page)
  await expect(
    dialog(page).getByText('Verification (simulated): Verified (simulated)', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog(page).getByText('Publication (simulated): Pending (simulated)', { exact: true }),
  ).toBeVisible()
  await expect(dialog(page).getByText(/Fictional receipt: SIM-/)).toBeVisible()
})

test('claim rejected preserves draft and never claims ownership', async ({ page }) => {
  await open(page, 'claim-rejected')
  await dialog(page).getByRole('button', { name: 'Continue', exact: true }).click()
  await labelled(page)
  await dialog(page)
    .getByRole('button', { name: 'Demo owner account (fictional)', exact: true })
    .click()
  await labelled(page)
  await dialog(page)
    .getByRole('button', { name: 'Continue: Demo Market Road', exact: true })
    .click()
  await labelled(page)
  await dialog(page)
    .getByRole('button', { name: 'Request simulated ownership', exact: true })
    .click()
  await labelled(page)
  await expect(dialog(page).getByText('Rejected — draft preserved')).toBeVisible()
  await expect(
    dialog(page).getByRole('button', { name: 'Approve this revision and simulate submission' }),
  ).toHaveCount(0)
  await dialog(page).getByRole('button', { name: 'Close and keep progress' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Google', exact: true }).click()
  await page.getByRole('button', { name: 'Put my shop on Google (simulation)' }).click()
  await expect(dialog(page).getByText('Rejected — draft preserved')).toBeVisible()
})

test('expired code recovers with a new fictional attempt', async ({ page }) => {
  await open(page, 'code-expired')
  await review(page)
  await submit(page)
  await code(page)
  await expect(
    dialog(page).getByText('Fictional code expired. Start a new code attempt, then use 123456.'),
  ).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Start a new fictional code attempt' }).click()
  await labelled(page)
  await dialog(page).getByLabel('Fictional code', { exact: true }).fill('123456')
  await dialog(page).getByRole('button', { name: 'Check fictional code', exact: true }).click()
  await expect(
    dialog(page).getByText('Verification (simulated): Verified (simulated)', { exact: true }),
  ).toBeVisible()
})

test('unknown submission restores pending, reconciles once without duplicate creation', async ({
  page,
}) => {
  await open(page, 'submit-unknown')
  await review(page)
  await submit(page)
  await expect(dialog(page).getByText('Submission pending — outcome unknown')).toBeVisible()
  const receipt = await dialog(page)
    .getByText(/Fictional receipt: SIM-/)
    .textContent()
  await dialog(page).getByRole('button', { name: 'Close and keep progress' }).click()
  await page.getByRole('button', { name: 'Put my shop on Google (simulation)' }).click()
  await expect(dialog(page).getByText('Submission pending — outcome unknown')).toBeVisible()
  await labelled(page)
  await dialog(page).getByRole('button', { name: 'Reconcile and retry' }).click()
  await labelled(page)
  await expect(dialog(page).getByText(/Fictional receipt: SIM-/)).toHaveText(receipt!)
  await code(page)
  await expect(dialog(page).getByText(/Simulated submissions: 1/)).toBeVisible()
})

test('service-area preview hides private address and scenario reset preserves real shop', async ({
  page,
}) => {
  await open(page, 'service-area', 'I visit customers (service area)')
  await review(page)
  await expect(
    dialog(page).getByText('Public service area: Demo Pune area', { exact: true }),
  ).toBeVisible()
  await expect(dialog(page).getByText('Address: Demo Market Road', { exact: true })).toHaveCount(0)
  await expect(
    dialog(page).getByText(
      'Private address hidden — only the service area appears in the simulated public preview.',
    ),
  ).toBeVisible()
  const before = await (await page.request.get('/api/v1/businesses')).json()
  await dialog(page).getByText('Reviewer controls', { exact: true }).click()
  await dialog(page).getByLabel('Reviewer: scenario').click()
  await page.getByRole('option', { name: 'new-store-success', exact: true }).click()
  await expect(
    dialog(page).getByRole('button', { name: 'Put my shop on Google (simulation)' }),
  ).toBeVisible()
  await labelled(page)
  const after = await (await page.request.get('/api/v1/businesses')).json()
  expect(after).toEqual(before)
  await dialog(page).getByRole('button', { name: 'Close and keep progress' }).click()
  await page.getByRole('button', { name: 'Put my shop on Google (simulation)' }).click()
  await dialog(page).getByText('Reviewer controls', { exact: true }).click()
  await expect(dialog(page).getByLabel('Reviewer: scenario')).toContainText('new-store-success')
})

test('video checklist and cancellation never mark verified', async ({ page }) => {
  await open(page, 'video-required')
  await review(page)
  await submit(page)
  await dialog(page).getByRole('button', { name: 'Mark preparation checklist complete' }).click()
  await expect(
    dialog(page).getByText(
      'Preparation complete — verification still pending. Nothing was recorded or uploaded.',
    ),
  ).toBeVisible()
  await labelled(page)
  await expect(
    dialog(page).getByText('Verification (simulated): Pending (simulated)', { exact: true }),
  ).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Cancel preparation' }).click()
  await expect(
    dialog(page).getByText(
      'Preparation complete — verification still pending. Nothing was recorded or uploaded.',
    ),
  ).toHaveCount(0)
  await expect(
    dialog(page).getByRole('link', { name: 'Official Google owner handoff (separate)' }),
  ).toHaveAttribute('href', 'https://business.google.com/add')
})

test('rejected hours require a corrected revision and disconnect preserves ownership', async ({
  page,
}) => {
  await open(page)
  await review(page)
  await dialog(page).getByText('Reviewer controls', { exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Reviewer: reject hours on submission' }).click()
  await expect(
    dialog(page).getByText(
      'Hours rejected (simulated). Correct hours and review a new revision before submitting again.',
    ),
  ).toBeVisible()
  await expect(dialog(page).getByLabel('Shop name')).toHaveValue('Simulator Tea')
  await dialog(page).getByLabel('Hours', { exact: true }).fill('10:00–18:00')
  await dialog(page).getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(dialog(page).getByText('Preview revision: 3', { exact: true })).toBeVisible()
  await submit(page)
  await code(page)
  // The expander may stay open between wizard steps.
  const disconnect = dialog(page).getByRole('button', { name: 'Disconnect simulated management' })
  if (!(await disconnect.isVisible()))
    await dialog(page).getByText('Reviewer controls', { exact: true }).click()
  await disconnect.click()
  await expect(
    dialog(page).getByText('Removal pending — simulated queued changes stopped'),
  ).toBeVisible()
  await labelled(page)
  await expect(
    dialog(page).getByText(
      'The merchant keeps their listing. No real permission or ownership is removed.',
    ),
  ).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Reviewer: confirm removal' }).click()
  await expect(
    dialog(page).getByText('Removal confirmed (simulated)', { exact: true }),
  ).toBeVisible()
})
