import { expect, test, type Page } from '@playwright/test'

// Everything by voice or text: common requests come back from the instant path (no model)
// and coach actions open the right screen without hunting for buttons.

async function enter(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

async function seedShop(page: Page) {
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        // OB-168: "share my page" shares this shop, so it has the owner's pin.
        owner_location: { lat: 1.3052, lng: 103.9045, accuracy_m: 0, source: 'pin' },
        business: {
          name: 'Katong Kopi',
          category: 'Kopitiam',
          location: 'Katong',
          hours: '7am–3pm',
        },
        products: [
          { name: 'Kopi', unit: 'cup', price: 180 },
          { name: 'Kaya toast', unit: 'set', price: 250 },
        ],
      },
    })
  ).json()
  await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Katong Kopi' })).toBeVisible()
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

test('a sold-out note becomes a review at once, without the model', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await say(page, 'Kaya toast is sold out')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Kaya toast')
  await expect(dialog).toContainText('Sold out')
  // Nothing is saved until the owner confirms; cancelling leaves the menu as it was.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('log')).toContainText('prepared this for you to check')
  const latency = await (await page.request.get('/api/v1/latency')).json()
  expect(latency.flows.text_instant.n).toBeGreaterThan(0)
})

test('"share my page" opens the customer page sheet and leaves a chip to reopen it', async ({
  page,
}) => {
  await enter(page)
  await seedShop(page)
  await say(page, 'Share my page')
  // The sheet opens by itself; nothing is shared until the owner switches the page on.
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('log')).toContainText('Share the link or show the QR code')
  const chip = page.getByRole('button', { name: 'Open Customer page and QR code' })
  await chip.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('"how do I…" questions are answered from the app guide', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await say(page, 'How do I rescue leftovers?')
  await expect(page.getByRole('log')).toContainText('Rescue leftovers')
  await expect(page.getByRole('log')).toContainText('30% off')
})

test('voice actions reach Today, the owner tabs, trust and games', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await say(page, 'Show Today')
  await expect(page.getByTestId('today')).toBeVisible()
  // Opening Today preserves the conversation; another request can navigate from it.
  for (const [request, tab] of [
    ['Open shop', 'Shop'],
    ['Open grow', 'Grow'],
    ['Open settings', 'You'],
    ['Show trust', 'You'],
    ['Show games', 'Grow'],
  ]) {
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await say(page, request!)
    if (request === 'Show games') {
      await expect(page.getByRole('region', { name: 'Thank-you perks' })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await expect(page.getByRole('button', { name: tab!, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    if (request === 'Show trust')
      await expect(page.getByRole('region', { name: 'Verify it’s you' })).toBeVisible()
    if (request === 'Show games') {
      await expect(page.getByRole('button', { name: /^Stamps & perks/ })).toBeVisible()
    }
  }
})

test('customer commands preserve the conversation when returning from the passport', async ({
  page,
}) => {
  await enter(page)
  await page.goto('/explore')
  await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('Show my stamps')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page).toHaveURL(/\/explore\/passport$/)
  await page.goBack()
  await expect(page.getByRole('article', { name: 'Show my stamps' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Ask about anything nearby' })).toBeVisible()
})
