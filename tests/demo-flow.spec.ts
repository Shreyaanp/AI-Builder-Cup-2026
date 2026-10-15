import { expect, test, type Page } from '@playwright/test'

async function png(page: Page, width: number): Promise<Buffer> {
  const url = await page.evaluate((size) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = 40
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f0c878'
    context.fillRect(0, 0, size, 40)
    return canvas.toDataURL('image/png')
  }, width)
  return Buffer.from(url.split(',')[1], 'base64')
}

async function open(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
  const agree = page.getByRole('button', { name: 'Agree and continue' })
  await expect(agree).toBeDisabled()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await agree.click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
}

test('demo: photo, price correction, customer page and availability', async ({
  page,
  context,
  baseURL,
}) => {
  // Allow cold local-server startup plus the complete two-page journey.
  test.setTimeout(60_000)
  await open(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'tea-menu.png',
    mimeType: 'image/png',
    buffer: await png(page, 64),
  })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible()
  await expect(review).toContainText('Offline Fixture Tea Stall')
  await expect(review).toContainText('Chai')
  await expect(review).toContainText('$15.00 / cup')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).not.toBeVisible()

  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  // My shop is tiles; the menu, sold-out switches and customer page each open a sheet.
  const menu = page.getByRole('button', { name: /^Menu/ })
  const sheet = (name: string) => page.getByRole('dialog', { name })
  const closeSheet = async () => {
    await page.bringToFront()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await menu.click()
  const chai = page.getByRole('button', { name: /^Edit Chai/ })
  await expect(chai).toContainText('Chai')
  await chai.click()
  await page.getByLabel(/^Price/).fill('12')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(review).toContainText('$12.00 / cup')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await menu.click()
  // B28: the price is its own button on the item card.
  await expect(page.getByRole('button', { name: 'Edit price: Chai, $12.00' })).toBeVisible()
  await closeSheet()

  await page.getByRole('button', { name: /^Customer page/ }).click()
  const sharing = page.getByRole('switch', { name: 'Share customer page' })
  await sharing.click()
  await expect(sharing).toBeChecked()
  const section = sheet('Customer page')
  const origin = baseURL!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const shownLink = section.getByText(new RegExp(`^${origin}/(explore/)?s/`))
  await expect(shownLink).toBeVisible()
  const url = (await shownLink.innerText()).trim()
  expect(url).toContain('/s/')
  const customer = await context.newPage()
  try {
    await customer.goto(url)
    await expect(customer.getByRole('heading', { name: 'Offline Fixture Tea Stall' })).toBeVisible()
    const product = customer.getByRole('listitem').filter({ hasText: 'Chai' })
    await expect(product).toContainText('Chai')
    await expect(product).toContainText('$12.00')
    await expect(customer.getByText('Sold out', { exact: true })).toHaveCount(0)

    await closeSheet()
    await page.getByRole('button', { name: /^Sold out today/ }).click()
    const available = page.getByRole('switch', { name: 'Available: Chai' })
    await available.click()
    await expect(available).not.toBeChecked()
    await closeSheet()
    // The saved owner row establishes that the availability request has completed.
    await menu.click()
    // B28: the sold-out mark is on the item card.
    await expect(sheet('Menu').getByRole('listitem').filter({ hasText: 'Chai' })).toContainText(
      'Sold out',
    )
    await closeSheet()
    await customer.reload()
    await expect(product).toContainText('Sold out')

    await page.bringToFront()
    await page.getByRole('button', { name: /^Customer page/ }).click()
    await sharing.click()
    await expect(sharing).not.toBeChecked()
    await expect(section.getByRole('link', { name: 'Open page' })).toHaveCount(0)
    await customer.reload()
    await expect(
      customer.getByRole('heading', { name: 'This shop page isn’t available.' }),
    ).toBeVisible()
  } finally {
    await customer.close()
  }
})
