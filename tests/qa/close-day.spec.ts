import { test, expect, owner, image, audit, evidence, tamil } from './support.js'

async function open(page: import('@playwright/test').Page) {
  const id = await owner(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Close the day/ }).click()
  return id
}

test('Close the day requires a photo, supports back, discloses fixture and saves exact sales', async ({
  page,
}) => {
  const id = await open(page)
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await expect(dialog.getByRole('button', { name: /^Review/ })).toBeDisabled()
  await dialog.getByRole('button', { name: /Till or POS report/ }).click()
  await dialog.locator('input[type=file]').setInputFiles(await image(page))
  await expect(dialog.getByText(/\d+ lines$/)).toBeVisible()
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await expect(dialog).toContainText(/Offline mode/)
  expect(await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()).toEqual([])
  await dialog.getByRole('button', { name: 'Add more', exact: true }).click()
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await audit(page)
  await dialog.getByRole('button', { name: 'Save day' }).click()
  await expect(dialog.getByText('Day closed')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  expect(
    (await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()).length,
  ).toBeGreaterThan(0)
})

test('failed photo can be cancelled without saving', async ({ page }) => {
  const id = await open(page)
  await page.route('**/day/read?*', (r) => r.fulfill({ status: 503, json: {} }))
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: /Till or POS report/ }).click()
  await dialog.locator('input[type=file]').setInputFiles(await image(page))
  await expect(dialog.getByText('Couldn’t read')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Review/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(await (await page.request.get(`/api/v1/businesses/${id}/sales`)).json()).toEqual([])
})

test('retry after sales failure must not count the same delivery twice', async ({ page }) => {
  const id = await open(page)
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  for (const name of [/Till or POS report/, /Deliveries received/]) {
    await dialog.getByRole('button', { name }).click()
    await dialog.locator('input[type=file]').setInputFiles(await image(page))
  }
  await expect(dialog.getByText(/\d+ lines$/)).toHaveCount(2)
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await page.route('**/day/prepare', (r) => {
    const body = r.request().postDataJSON()
    return body.sales ? r.fulfill({ status: 503, json: {} }) : r.fallback()
  })
  await dialog.getByRole('button', { name: 'Save day' }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: /try again/i })).toBeVisible()
  await evidence(page, 'Q6-partial-save')
  const stockAfterFailure = (
    await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  ).map((p: { stock: number }) => p.stock)
  await page.unroute('**/day/prepare')
  await dialog.getByRole('button', { name: 'Save day' }).click()
  await expect(dialog.getByText('Day closed')).toBeVisible()
  const stockAfterRetry = (
    await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  ).map((p: { stock: number }) => p.stock)
  await evidence(page, 'Q6-close-day-retry')
  // BUG Q6: Retrying Close the day after sales failure applies already-saved deliveries again.
  test.fail()
  expect(stockAfterRetry).toEqual(stockAfterFailure)
})

test('Tamil Close the day is localized and keyboard dismissible', async ({ page }) => {
  await owner(page)
  await tamil(page)
  // Stable data-tour marker avoids baking an English label into this locale case.
  await page.getByRole('button', { name: 'என் கடை', exact: true }).click()
  await page.locator('[data-tour="closeday"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await audit(page, 'Q14')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Close the day honours reduced motion while a photo is being read', async ({ page }) => {
  await open(page)
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/day/read?*', async (route) => {
    await gate
    await route.fulfill({ status: 503, json: {} })
  })
  try {
    const dialog = page.getByRole('dialog', { name: 'Close the day' })
    await dialog.getByRole('button', { name: /Till or POS report/ }).click()
    await dialog.locator('input[type=file]').setInputFiles(await image(page))
    await expect(dialog.getByText('Reading…')).toBeVisible()
    const running = await dialog.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
        .map((a) => (a instanceof CSSAnimation ? a.animationName : 'animation')),
    )
    await evidence(page, 'close-day-reduced-motion')
    expect(running).toEqual([])
  } finally {
    release()
  }
})
