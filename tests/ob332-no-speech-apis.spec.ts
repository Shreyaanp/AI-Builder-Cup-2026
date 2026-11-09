import { expect, test, type Page } from '@playwright/test'

// OB-332: some in-app browsers and older Android WebViews have no speech or audio APIs. Calling
// one bare blanked the whole app (agent lab, 8 Nov). Voice hides or explains itself; the rest works.
test.setTimeout(120_000)
test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob332-${info.testId}-${Math.random()}` })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.addInitScript(() => {
    for (const name of [
      'speechSynthesis',
      'SpeechSynthesisUtterance',
      'SpeechRecognition',
      'webkitSpeechRecognition',
      'AudioContext',
      'webkitAudioContext',
      'AudioWorkletNode',
    ]) {
      delete (window as never as Record<string, unknown>)[name]
      delete (Window.prototype as never as Record<string, unknown>)[name]
    }
  })
})
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

function pageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('OB-332: the APIs really are gone in this test', async ({ page }) => {
  await page.goto('/demo')
  expect(
    await page.evaluate(() => [
      typeof (window as never as Record<string, unknown>).speechSynthesis,
      typeof (window as never as Record<string, unknown>).AudioContext,
      typeof (window as never as Record<string, unknown>).webkitSpeechRecognition,
    ]),
  ).toEqual(['undefined', 'undefined', 'undefined'])
})

test('OB-332: demo Today, Shop, Grow and You all work with no speech or audio', async ({
  page,
}) => {
  const errors = pageErrors(page)
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click({ timeout: 60_000 })
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })

  await page.locator('[data-tour="nav-shop"]').click()
  await expect(page.getByTestId('shop-tiles')).toBeVisible()

  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect(page.locator('body')).toContainText(/\S{20}/)
  await expect(page.getByRole('button', { name: 'Grow', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'You', exact: true }).click()
  await expect(page.getByRole('button', { name: 'You', exact: true })).toBeVisible()
  await expect(page.locator('body')).toContainText(/\S{20}/)

  // Back to the coach and away again: leaving it ran the call that blanked the app.
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await expect(page.getByRole('textbox').first()).toBeVisible()
  // Voice hides itself; typing stays.
  await expect(page.getByRole('button', { name: 'Press to talk' })).toHaveCount(0)
  await page.getByRole('button', { name: /^(Mute|Unmute)/ }).click()
  await page.getByRole('button', { name: /^(Mute|Unmute)/ }).click()
  await page.locator('[data-tour="nav-shop"]').click()
  await expect(page.getByTestId('shop-tiles')).toBeVisible()

  expect(errors).toEqual([])
})

test('OB-332: a normal browser still offers voice', async ({ browser }) => {
  // A fresh context without the init script above.
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    extraHTTPHeaders: { 'x-forwarded-for': `ob332-normal-${Math.random()}` },
    baseURL: new URL(test.info().project.use.baseURL!).origin,
    storageState: test.info().project.use.storageState as never,
  })
  const normal = await context.newPage()
  await normal.goto('/demo')
  await normal.getByRole('dialog').getByRole('button', { name: 'Skip' }).click({ timeout: 60_000 })
  await expect(normal.getByTestId('today')).toBeVisible({ timeout: 15_000 })
  await expect(normal.getByRole('button', { name: 'Press to talk' })).toBeVisible()
  await context.close()
})

test('OB-332: the customer demo works with no speech or audio', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/explore/demo')
  await expect(page.locator('body')).toContainText(/\S{20}/, { timeout: 60_000 })
  expect(errors).toEqual([])
})

test('OB-332: a new shop opens by typing with no speech or audio', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click({ timeout: 60_000 })
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Let’s put your shop online' })).toBeVisible()
  expect(errors).toEqual([])
})
