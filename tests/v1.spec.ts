import { expect, test, type Page } from '@playwright/test'

/** Builds a real PNG in the browser so the backend's decoder and fixture moderation see an image. */
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

async function addShop(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByLabel('Shop name').fill(name)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Nothing is published to Google')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

test('declining consent returns to the welcome screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(
    page.getByRole('heading', { name: 'Your shop, online in one conversation' }),
  ).toBeVisible()
})

test('a shop is saved only after reviewing the exact proposal, and persists', async ({ page }) => {
  await open(page)
  await addShop(page, 'Ram Tea Stall')
  await page.getByRole('button', { name: 'My shop' }).click()
  await expect(page.getByRole('heading', { name: 'Ram Tea Stall' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  // Consent is remembered for this workspace; the shop is restored.
  await expect(page.getByRole('button', { name: 'Choose shop: Ram Tea Stall' })).toBeVisible()
})

test('a shop photo becomes a reviewable draft; an explicit photo is refused', async ({ page }) => {
  await open(page)
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({
    name: 'blocked.png',
    mimeType: 'image/png',
    buffer: await png(page, 13),
  })
  await expect(page.getByRole('alert')).toContainText('This photo can’t be used')
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
  await input.setInputFiles({
    name: 'sign.png',
    mimeType: 'image/png',
    buffer: await png(page, 64),
  })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Offline Fixture Tea Stall')
  // The modal hides the page from assistive tech; check the coach note once it closes.
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('log')).toContainText('I read your photo')
})

test('the coach turns a typed description into a proposal, never a save', async ({ page }) => {
  await open(page)
  await page.getByLabel('Message').fill('name: Sharma Bakery; category: Bakery; location: Pune')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Sharma Bakery')
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Sharma Bakery' })).toHaveCount(0)
  // Chat content must never widen the page (it zooms phones out and hides the nav bar).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeInViewport()
})

test('switching shops never shows the other shop’s products or conversation', async ({ page }) => {
  await open(page)
  await addShop(page, 'Alpha Tea')
  await page.getByRole('button', { name: 'My shop' }).click()
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByLabel('Product name').fill('Alpha Chai')
  await page.getByLabel(/^Price/).fill('15')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Check before saving' })
    .getByRole('button', { name: 'Confirm and save' })
    .click()
  // The saved row (the closing review sheet and desktop panes can also show the name).
  await expect(page.getByRole('button', { name: /^Edit Alpha Chai/ })).toBeVisible()
  await page.getByRole('button', { name: 'Coach' }).click()
  await page.getByLabel('Message').fill('Hello from Alpha')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Hello from Alpha')
  // Second shop via the shop switcher.
  await page.getByRole('button', { name: /Choose shop/ }).click()
  await page.getByRole('menuitem', { name: 'New shop' }).click()
  await page.getByLabel('Shop name').fill('Beta Bakery')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Check before saving' })
    .getByRole('button', { name: 'Confirm and save' })
    .click()
  await expect(page.getByRole('button', { name: 'Choose shop: Beta Bakery' })).toBeVisible()
  await expect(page.getByText('Hello from Alpha')).toHaveCount(0)
  await page.getByRole('button', { name: 'My shop' }).click()
  await expect(page.getByText('Alpha Chai')).toHaveCount(0)
})

test('Google handoff shows readiness and only official Google links', async ({ page }) => {
  await open(page)
  await addShop(page, 'Morning Crumb')
  await page.getByRole('button', { name: 'Google' }).click()
  await expect(page.getByText('1 of 6 ready')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add on Google' })).toHaveAttribute(
    'href',
    'https://business.google.com/add',
  )
  await expect(page.getByRole('link', { name: 'Find & claim on Maps' })).toHaveAttribute(
    'href',
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Morning%20Crumb/,
  )
  await expect(page.getByText('Chalkboard never publishes to Google for you.')).toBeVisible()
})

test('delete all my data erases shops and asks for consent again', async ({ page }) => {
  await open(page)
  await addShop(page, 'Gone Soon Kirana')
  await page.getByRole('button', { name: 'Privacy' }).click()
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete everything?' })
  await confirm.getByRole('button', { name: 'Delete permanently' }).click()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
})
