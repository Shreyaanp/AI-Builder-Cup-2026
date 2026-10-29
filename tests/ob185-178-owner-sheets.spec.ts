import { expect, test, type Page } from '@playwright/test'

// OB-185 (#546): a deferred sheet answers a tap at once, and Back or Escape closes it before it
// has loaded. OB-178 (#538): a changed place must get its pin before "Confirm and save" works.
// Runs on the phone and desktop projects with the offline coach.

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

/** A saved Singapore shop pinned at Tiong Bahru. */
async function savedShop(page: Page) {
  await localOnly(page)
  await enter(page)
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      geocode_confirmed: true,
      business: { name: 'Tiong Bahru Kopi', location: 'Tiong Bahru, Singapore' },
      products: [{ name: 'Kopi', price: 180, unit: 'cup' }],
    },
  })
  const proposal = await prepared.json()
  await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  await enter(page)
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

for (const width of [360, 390, 412]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test(`OB-178: a changed place cannot be saved until its pin is found (${width})`, async ({
      page,
    }) => {
      await savedShop(page)
      await say(page, 'change my location to HITEC City, Hyderabad')
      const review = page.getByRole('dialog', { name: 'Check before saving' })
      const confirm = review.getByRole('button', { name: 'Confirm and save' })
      await expect(review).toContainText('HITEC City, Hyderabad')
      await expect(review.getByRole('button', { name: 'Find pin' })).toBeVisible()
      await expect(confirm).toBeDisabled()
      await review.getByRole('button', { name: 'Find pin' }).click()
      await expect(review).toContainText('17.44740, 78.37620')
      await expect(confirm).toBeEnabled()
    })

    test(`OB-185: a sheet still loading shows a placeholder that Escape closes (${width})`, async ({
      page,
    }) => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/src/features/v1/ReviewDialog.tsx*', async (route) => {
        await gate
        await route.fallback()
      })
      await savedShop(page)
      await say(page, 'change my location to HITEC City, Hyderabad')
      const pending = page.getByTestId('pending-dialog')
      await expect(pending).toBeVisible()
      await expect(pending).toContainText('Opening…')
      await page.keyboard.press('Escape')
      await expect(pending).toHaveCount(0)
      release()
      // The sheet the owner closed does not open late on top of whatever they are doing.
      await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
    })
  })
}
