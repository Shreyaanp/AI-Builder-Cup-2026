import {
  createShop,
  openNewShopReview,
  createShopFromReview,
  editShopDetails,
} from '../stories/support.js'
import { FIRST_QUESTION } from '../newShopTopics.js'
import { test, expect, enter, audit, evidence, owner, tamil } from './support.js'

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

test('new shop: cancel writes nothing, review saves once and reloads', async ({ page }) => {
  await enter(page)
  // "Add my shop" opens the full-screen new-shop flow, never a form dialog.
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
  await page.getByLabel('Message', { exact: true }).fill('name: QA neighbourhood shop')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-so-far')).toContainText('QA neighbourhood shop')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  await openNewShopReview(page, 'name: QA neighbourhood shop')
  await expect(page.getByTestId('draft-summary')).toContainText('QA neighbourhood shop')
  await audit(page)
  await createShopFromReview(page)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(
    page.getByRole('button', { name: 'Choose shop: QA neighbourhood shop' }),
  ).toBeVisible()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
})

test('missing shop name focuses the invalid field', async ({ page }) => {
  await enter(page)
  await createShop(page, 'name: QA name check')
  await editShopDetails(page)
  await page.getByLabel('Shop name').fill('')
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
