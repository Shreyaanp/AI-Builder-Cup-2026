import { expect, test, type Page } from '@playwright/test'

// Fixes #68: the owner can rename the shop from the Shop tab or by telling the coach.
// Runs on the phone and desktop projects.

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
}

async function enter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const terms = page.getByLabel('I agree to the Terms')
  if (
    await terms.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    )
  ) {
    await terms.check()
    await page.getByLabel('I have read the Privacy Notice').check()
    await page.getByRole('button', { name: 'Agree and continue' }).click()
  }
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

async function sharedShop(page: Page) {
  await localOnly(page)
  await enter(page)
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: {
        name: 'Tiong Bahru Kopi',
        location: 'Tiong Bahru, Singapore',
        hours: '07:00–14:00',
      },
      products: [{ name: 'Kopi', price: 180, unit: 'cup' }],
    },
  })
  const proposal = await prepared.json()
  const saved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  const { business_id: id } = await saved.json()
  await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })
  await enter(page)
  return id as string
}

async function customerSees(page: Page, id: string, name: string) {
  const customer = await page.context().newPage()
  await localOnly(customer)
  await customer.goto(`/s/${id}`)
  await expect(customer.getByRole('heading', { name })).toBeVisible()
  await customer.close()
}

test('Owner renames the shop from the Shop tab', async ({ page }) => {
  const id = await sharedShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: 'Edit: Tiong Bahru Kopi' }).click()

  // The guided editor opens on the name, so one answer is enough.
  const editor = page.getByTestId('guided-details')
  await expect(editor).toHaveAttribute('data-step', 'name')
  const name = editor.getByLabel('Name')
  await name.fill('   ')
  await editor.getByRole('banner').getByRole('button', { name: 'Review' }).click()
  await expect(editor.getByRole('alert').getByText('Enter a name.')).toBeVisible()
  await name.fill('x'.repeat(100))
  await expect(name).toHaveValue('x'.repeat(80))
  await name.fill('  Bahru Brew House  ')
  await editor.getByRole('banner').getByRole('button', { name: 'Review' }).click()

  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Bahru Brew House')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // No reload: the shop card shows the new name and the old one is gone.
  await expect(page.getByText('Bahru Brew House').first()).toBeVisible()
  await expect(page.getByText('Tiong Bahru Kopi')).toHaveCount(0)
  await customerSees(page, id, 'Bahru Brew House')
})

test('Owner renames the shop from Review my shop', async ({ page }) => {
  await sharedShop(page)
  await page.getByLabel('Message', { exact: true }).fill('name: Kopi Corner')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Kopi Corner')
  await review.getByRole('button', { name: 'Edit: Kopi Corner' }).click()
  const editor = page.getByTestId('guided-details')
  await expect(editor).toHaveAttribute('data-step', 'name')
  await editor.getByLabel('Name').fill('Kopi Corner 2')
  await editor.getByRole('banner').getByRole('button', { name: 'Review' }).click()
  await expect(review).toContainText('Kopi Corner 2')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Owner renames the shop by telling the coach', async ({ page }) => {
  const id = await sharedShop(page)
  const message = page.getByLabel('Message', { exact: true })
  await message.fill('Rename my shop to Chai Point')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Chai Point')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await customerSees(page, id, 'Chai Point')

  // Hinglish works too.
  await message.fill('dukaan ka naam Masala Chai karo')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(review).toContainText('Masala Chai')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await customerSees(page, id, 'Masala Chai')
})
