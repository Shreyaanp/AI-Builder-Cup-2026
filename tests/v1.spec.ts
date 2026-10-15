import { createShop, openNewShopReview, createShopFromReview } from './stories/support.js'
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
  await openNewShopReview(page, `name: ${name}`)
  await expect(page.getByTestId('new-shop-review')).toContainText('Nothing is published to Google')
  await createShopFromReview(page)
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
  // The top bar names the shop; My shop starts with its tiles (B26).
  await expect(page.getByRole('button', { name: /^Shop details/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose shop: Ram Tea Stall' })).toBeVisible()
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
  // My shop is tiles; the menu and its Add product live in the Menu sheet.
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByLabel('Product name').fill('Alpha Chai')
  await page.getByLabel(/^Price/).fill('15')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Check before saving' })
    .getByRole('button', { name: 'Confirm and save' })
    .click()
  // The saved row in the Menu sheet (the closing review sheet can also show the name).
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /^Menu/ }).click()
  await expect(page.getByRole('button', { name: /^Edit Alpha Chai/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Coach' }).click()
  await page.getByLabel('Message').fill('Hello from Alpha')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Hello from Alpha')
  // Second shop via the shop switcher.
  await page.getByRole('button', { name: /Choose shop/ }).click()
  await page.getByRole('menuitem', { name: 'New shop' }).click()
  await createShop(page, 'name: Beta Bakery')
  await expect(page.getByRole('button', { name: 'Choose shop: Beta Bakery' })).toBeVisible()
  await expect(page.getByText('Hello from Alpha')).toHaveCount(0)
  await page.getByRole('button', { name: 'My shop' }).click()
  await expect(page.getByText('Alpha Chai')).toHaveCount(0)
})

test('Google flow: details, photos, preview, then official links', async ({ page }) => {
  await open(page)
  await addShop(page, 'Morning Crumb')
  await page.getByRole('button', { name: 'Google' }).click()
  const flow = page.getByRole('region', { name: 'Google' })
  await expect(flow.getByRole('heading', { name: 'Check your details' })).toBeVisible()
  await expect(flow.getByText('Missing').first()).toBeVisible()
  await flow.getByRole('button', { name: 'Next' }).click()
  await expect(flow.getByRole('heading', { name: 'Add photos' })).toBeVisible()
  await flow.getByRole('button', { name: 'Skip for now' }).click()
  await expect(flow.getByRole('heading', { name: 'Your profile' })).toBeVisible()
  await expect(flow.getByRole('heading', { name: 'Morning Crumb' })).toBeVisible()
  await flow.getByRole('button', { name: 'Next' }).click()
  await expect(flow.getByText('Waiting for Google API access')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add on Google' })).toHaveAttribute(
    'href',
    'https://business.google.com/add',
  )
  await expect(page.getByRole('link', { name: 'Find & claim on Maps' })).toHaveAttribute(
    'href',
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Morning%20Crumb/,
  )
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

test('customer facts: the card starts the chat, the owner confirms, customers see a chip', async ({
  page,
  isMobile,
}) => {
  // Outside busy hours, so the facts card (not the sold-out sweep) is the pending item.
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00+08:00'))
  await open(page)
  await addShop(page, 'Halal Corner')
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  // Phones show one coach card at a time; today's menu check comes first.
  if (isMobile) await page.getByRole('button', { name: 'Yes, all good' }).click()
  const card = page.getByRole('region', { name: 'Customers ask: halal? payment?' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Answer' }).click()
  const message = page.getByLabel('Message', { exact: true })
  await expect(message).toHaveValue('Halal: ')
  await expect(message).toBeFocused()
  await message.pressSequentially('yes')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review.getByRole('region', { name: 'What customers ask' })).toContainText('Halal')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Next unanswered fact moves up; halal is no longer asked.
  await expect(page.getByRole('button', { name: /^Customers ask: payment\?/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  const details = page.getByRole('dialog', { name: 'Halal Corner' })
  await expect(details.getByRole('region', { name: 'What customers ask' })).toContainText('Halal')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: /^Customer page/ }).click()
  await page.getByRole('switch', { name: 'Share customer page' }).click()
  await expect(
    page.getByRole('img', { name: 'QR code for Halal Corner’s customer page' }),
  ).toBeVisible()
  await expect(page.getByText('Scan for today’s menu')).toBeVisible()
  const url = await page.getByRole('link', { name: 'Open page' }).getAttribute('href')
  await page.goto(url!)
  await expect(page.getByRole('list', { name: 'Good to know' })).toContainText('Halal')
})

test('busy-hours sweep asks about top items; Sold out uses the owner switch', async ({
  page,
  isMobile,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:30:00+08:00'))
  await open(page)
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: { name: 'Sweep Kopitiam' },
        products: [
          { name: 'Kopi', unit: 'cup', price: 180 },
          { name: 'Teh', unit: 'cup', price: 170 },
        ],
      },
    })
  ).json()
  const { business_id: id } = await (
    await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
  ).json()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  // Phones show one coach card at a time; today's menu check comes first.
  if (isMobile) await page.getByRole('button', { name: 'Yes, all good' }).click()
  const kopi = page.getByRole('region', { name: 'Still have Kopi?' })
  await expect(kopi).toBeVisible()
  await kopi.getByRole('button', { name: 'Sold out' }).click()
  const teh = page.getByRole('region', { name: 'Still have Teh?' })
  await expect(teh).toBeVisible()
  await expect
    .poll(async () => {
      const items = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
      return items.find((item: { name: string }) => item.name === 'Kopi').available
    })
    .toBe(false)
  // "Yes" hides that item until the next busy window; nothing else is left to sweep.
  await teh.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByRole('region', { name: /^Still have/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^Customers ask:/ })).toBeVisible()
  // Remembered for this shop today.
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('region', { name: /^Customers ask:/ })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Still have/ })).toHaveCount(0)
})
