import { expect, test } from '@playwright/test'

test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', viewport: { width: 390, height: 844 } })

test('390px customer demo: browse shops, collect a public demo stamp, and see Passport', async ({
  page,
  request,
}) => {
  test.skip(test.info().project.name !== 'phone', 'This journey is checked at 390px phone width')
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const session = await page.request.post('/api/v1/customer/session', {
    data: { name: 'Asha Rao' },
  })
  expect(session.ok(), await session.text()).toBe(true)
  const shopResponse = await request.get('/api/v1/public/shops/demo-story-bengaluru-chai')
  expect(shopResponse.ok(), await shopResponse.text()).toBe(true)
  const shop = (await shopResponse.json()) as { lat: number; lng: number }
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: shop.lat, longitude: shop.lng, accuracy: 20 })
  await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Try demo' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'Try demo' }).click()

  await expect(page.getByRole('heading', { name: 'Browse shops' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Collect a stamp' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Passport$/ })).toBeVisible()
  const cards = page.locator('main > ul > li')
  await expect(cards).toHaveCount(4)
  for (const card of await cards.all()) await expect(card.locator('img')).toBeVisible()
  await expect(cards.first()).toContainText(/\d/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const firstCard = cards.first()
  const shopName = (await firstCard.locator('span').first().innerText()).trim()
  await firstCard.getByRole('link').click()
  await expect(page.getByRole('heading', { name: shopName })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try a demo stamp' })).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Collect a stamp at the demo chai stall' }),
  ).toHaveAttribute('href', '/explore/s/demo-story-bengaluru-chai?source=qr')

  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('link', { name: 'Collect a stamp' })).toBeVisible()
  await page.getByRole('link', { name: 'Collect a stamp' }).click()
  await expect(page.getByRole('heading', { name: 'Lantern Chai Corner' })).toBeVisible()
  await page.getByRole('button', { name: 'Collect your stamp' }).click()
  const moment = page.getByRole('dialog')
  await expect(moment.getByRole('button', { name: 'Keep browsing' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(moment.getByText('+50 demo points')).toBeVisible()
  await moment.getByRole('button', { name: 'Keep browsing' }).click()
  await expect(moment).toBeHidden()

  await page.goto('/explore/demo')
  await expect(page.getByRole('heading', { name: 'Browse shops' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'See your Passport' })).toBeVisible()
  await page.getByRole('link', { name: 'See your Passport' }).click()
  await expect(page.getByRole('heading', { name: 'Your passport' })).toBeVisible()
  await expect(page.getByText('Includes 50 demo points')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('region', { name: 'Stamp book' })).toContainText(
    'Lantern Chai Corner',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
