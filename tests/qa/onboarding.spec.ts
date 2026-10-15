import { test, expect, enter, confirm, audit, evidence, owner, tamil } from './support.js'

test('consent validates both choices and keyboard activation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const submit = page.getByRole('button', { name: 'Agree and continue' })
  await expect(submit).toBeDisabled()
  await page.getByLabel('I agree to the Terms').check()
  await expect(submit).toBeDisabled()
  await page.getByLabel('I have read the Privacy Notice').check()
  await audit(page)
  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
})

test('empty shop validates name, cancel writes nothing, review saves once and reloads', async ({
  page,
}) => {
  await enter(page)
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Shop name').fill('QA neighbourhood shop')
  await page.keyboard.press('Escape')
  // Existing unsaved-input protection must let the owner stay or discard.
  const discard = page.getByRole('button', { name: /Discard/ })
  if (await discard.isVisible()) await discard.click()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByLabel('Shop name').fill('QA neighbourhood shop')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toContainText(
    'Nothing is published to Google',
  )
  await audit(page)
  await confirm(page)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(
    page.getByRole('button', { name: 'Choose shop: QA neighbourhood shop' }),
  ).toBeVisible()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
})

test('missing shop name focuses the invalid field', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await evidence(page, 'Q7-name-focus')
  await expect(page.getByLabel('Shop name')).toBeFocused({ timeout: 1000 })
  await expect(page.getByLabel('Shop name')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Shop name')).toHaveAccessibleDescription('Enter a name.')
})

test('Tamil owner shell and settings wrap and return keyboard focus', async ({ page }) => {
  await owner(page)
  await tamil(page)
  await audit(page)
  await evidence(page, 'owner-tamil')
})

test('guided tour is private and offers a way to finish', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Take the tour' }).click()
  await expect(page.getByRole('dialog', { name: 'Your shop at a glance' })).toBeVisible()
  for (let step = 0; step < 8; step++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click()
  }
  await expect(page.getByRole('dialog', { name: 'You’re ready' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep exploring' }).click()
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  expect(shops).toHaveLength(1)
  expect(shops[0].public).toBeFalsy()
})
