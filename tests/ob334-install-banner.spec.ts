import { expect, test, type Page } from '@playwright/test'

// OB-334: "Install Chalkboard" sat on top of "Check before saving" and hid the list of changes. An
// optional offer waits until every sheet has closed, and a dismissal is final.
test.setTimeout(120_000)
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob334-${info.testId}-${Math.random()}` })
})
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

const BANNER = 'Install Chalkboard for one-tap access'

async function installable(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(event)
  })
}

async function openDemo(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 360 ? 800 : 844 })
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click({ timeout: 60_000 })
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
  await installable(page)
  await page.locator('[data-tour="nav-shop"]').click()
}

async function changePrice(page: Page, item: string, price: string) {
  await page.getByTestId('shop-tiles').getByRole('button', { name: /^Menu/ }).click()
  await page.locator(`[data-menu-item="${item}"]`).click()
  const form = page.getByRole('dialog', { name: `Edit ${item}` })
  await form.getByRole('textbox', { name: 'Price' }).fill(price)
  await form.getByRole('button', { name: /^Review/ }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible()
  return review
}

for (const width of [360, 390, 412])
  test(`OB-334: the offer waits behind every sheet and comes back after (${width})`, async ({
    page,
  }) => {
    await openDemo(page, width)
    let review = await changePrice(page, 'Ginger chai', '26')
    await review.getByRole('button', { name: 'Confirm and save' }).click()
    await expect(review).toHaveCount(0)
    // Useful progress on the plain page: the offer appears.
    await expect(page.getByText(BANNER)).toBeVisible()

    // The Menu sheet opens: the offer steps aside, so nothing of the sheet is covered.
    await page.getByTestId('shop-tiles').getByRole('button', { name: /^Menu/ }).click()
    await expect(page.getByText(BANNER)).toHaveCount(0)
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText(BANNER)).toBeVisible()

    // "Check before saving": the list of changes and both actions are all in the clear.
    review = await changePrice(page, 'Bun maska', '36')
    await expect(page.getByText(BANNER)).toHaveCount(0)
    await expect(review.getByText('Bun maska')).toBeInViewport()
    await expect(review.getByRole('button', { name: 'Confirm and save' })).toBeInViewport()
    await page.screenshot({ path: test.info().outputPath(`check-before-saving-${width}.png`) })
    await review.getByRole('button', { name: 'Cancel' }).click()
    await expect(review).toHaveCount(0)
  })

test('OB-334: dismissing stays dismissed across saves, sheets and a reload', async ({ page }) => {
  await openDemo(page, 390)
  let review = await changePrice(page, 'Ginger chai', '26')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  const banner = page.getByRole('alert').filter({ hasText: BANNER })
  await banner.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText(BANNER)).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem('chalkboard.business.installDismissed')),
  ).toBe('1')

  // Another save in the same visit does not bring it back.
  review = await changePrice(page, 'Bun maska', '36')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  await expect(page.getByText('Saved')).toBeVisible()
  await expect(page.getByText(BANNER)).toHaveCount(0)

  // Nor does a new visit: the browser offers again, the owner already said no.
  await page.reload()
  await expect(page.locator('[data-tour="nav-shop"]')).toBeVisible({ timeout: 60_000 })
  expect(
    await page.evaluate(() => localStorage.getItem('chalkboard.business.installDismissed')),
  ).toBe('1')
  await installable(page)
  await page.waitForTimeout(500)
  await expect(page.getByText(BANNER)).toHaveCount(0)
})
