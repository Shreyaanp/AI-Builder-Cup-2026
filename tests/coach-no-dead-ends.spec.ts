import { expect, test, type Page } from '@playwright/test'

// OB-172 (#531, #527): the coach never dead-ends. A shop-detail request becomes the normal
// review card (a new place goes through Find pin, like the owner's own edit), something the app
// can't do gets an honest reply and an offered screen, and an unclear ask gets one question.
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

/** A saved Singapore shop pinned at Tiong Bahru, open 07:00–14:00. */
async function savedShop(page: Page) {
  await localOnly(page)
  await enter(page)
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      geocode_confirmed: true,
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
  await enter(page)
  return id as string
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

async function shop(page: Page, id: string) {
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  return shops.find((s: { id: string }) => s.id === id).fields
}

test('OB-172: "change my location to HITEC City, Hyderabad" prepares the place and the pin', async ({
  page,
}) => {
  const id = await savedShop(page)
  await say(page, 'change my location to HITEC City, Hyderabad')
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('HITEC City, Hyderabad')
  // The old Tiong Bahru pin is gone: the owner finds and checks the new one.
  await review.getByRole('button', { name: 'Find pin' }).click()
  await expect(review).toContainText('17.44740, 78.37620')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const fields = await shop(page, id)
  expect(fields.location).toBe('HITEC City, Hyderabad')
  expect([fields.lat, fields.lng]).toEqual([17.4474, 78.3762])
  expect(fields.timezone).toBe('Asia/Kolkata')
})

test('OB-172: "we close at 9 now" prepares the hours', async ({ page }) => {
  const id = await savedShop(page)
  await say(page, 'we close at 9 now')
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const fields = await shop(page, id)
  expect(fields.weekly_hours).toHaveLength(7)
  for (const day of fields.weekly_hours) expect([day.open, day.close]).toEqual(['07:00', '21:00'])
})

test('OB-172: "post this on Instagram" gets an honest reply and an offered screen', async ({
  page,
}) => {
  await savedShop(page)
  await say(page, 'post this on Instagram')
  await expect(page.getByText("I can't do that yet, and nothing was posted or sent.")).toBeVisible()
  const offer = page.getByRole('button', { name: 'Open Customer page and QR code' })
  await expect(offer).toBeVisible()
  // Offered, not opened: no review card and no sheet took over the chat.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const box = await offer.boundingBox()
  expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(48)
  await offer.click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('OB-172: an unclear ask gets one short question and no action', async ({ page }) => {
  await savedShop(page)
  await say(page, 'change it')
  await expect(
    page.getByText('What should I change: the name, hours, location or phone?'),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
