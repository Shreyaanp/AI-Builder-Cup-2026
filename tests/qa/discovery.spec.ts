import { test, expect, audit, evidence } from './support.js'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
})

test('a failed customer screen chunk shows a retry instead of a blank screen', async ({ page }) => {
  await page.route('**/src/features/frontdoors/CustomerApp.tsx*', (route) => route.abort())
  await page.goto('/explore/')
  await expect(page.getByRole('alert')).toContainText('Could not load this screen.')
  await page.unroute('**/src/features/frontdoors/CustomerApp.tsx*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What are you looking for nearby?' })).toBeVisible(
    {
      timeout: 30_000,
    },
  )
})

test('a slow app shell stops loading and offers Retry', async ({ page }) => {
  await page.clock.install()
  let releaseRequest!: () => void
  const held = new Promise<void>((resolve) => {
    releaseRequest = resolve
  })
  await page.route('**/src/features/frontdoors/CustomerApp.tsx*', async (route) => {
    await held
    await route.abort()
  })
  await page.goto('/explore/')
  await expect(page.getByTestId('brand-splash')).toBeVisible()
  await page.clock.fastForward(15_000)
  await expect(page.getByRole('alert')).toContainText('Could not load this screen.')
  releaseRequest()
  await page.unroute('**/src/features/frontdoors/CustomerApp.tsx*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What are you looking for nearby?' })).toBeVisible(
    {
      timeout: 30_000,
    },
  )
})

test('Ask blank input, empty results, loading and failed request recovery', async ({ page }) => {
  await page.goto('/explore/')
  const send = page.getByRole('button', { name: 'Send', exact: true })
  await expect(send).toBeDisabled()
  await page.route('**/discover/ask', (route) => route.fulfill({ status: 503, json: {} }))
  await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('QA nonexistent shop')
  await send.click()
  const failed = page.getByRole('alert').filter({ hasText: 'That didn’t work.' })
  await expect(failed).toBeVisible()
  await page.unroute('**/discover/ask')
  await failed.getByRole('button', { name: 'Try again', exact: true }).click()
  // The same turn recovers in place: the error is replaced by the answer.
  await expect(failed).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('article', { name: 'QA nonexistent shop' })).toContainText(
    /Here’s what I found|Nothing nearby matches/,
  )
  await audit(page)
})

test('unavailable public page has keyboard recovery to discovery', async ({ page }) => {
  await page.goto('/s/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  const back = page.getByRole('link', { name: /Back/ })
  await expect(back).toBeVisible()
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/explore/)
  await audit(page)
})

test('browse accepts Bengaluru location and exposes filters without external Maps', async ({
  page,
}) => {
  await page.goto('/explore/browse')
  await expect(page.getByRole('main')).toBeVisible()
  const place = page.getByRole('textbox', { name: 'City or area' })
  await place.fill('Bengaluru')
  await place.press('Enter')
  await expect(place).toHaveValue('Bengaluru')
  await page.getByRole('switch', { name: 'Halal if known' }).check()
  await page.getByRole('button', { name: 'Map view', exact: true }).click()
  await expect(page.getByRole('button', { name: 'List view', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'List view', exact: true }).click()
  await page.reload()
  await expect(place).toHaveValue('Bengaluru')
  await expect(page.getByRole('switch', { name: 'Halal if known' })).toBeChecked()
  await audit(page)
  await evidence(page, 'browse-empty')
})

test.describe('Tamil customer front door', () => {
  test.use({ locale: 'ta-IN' })
  test('customer navigation is translated alongside the Ask page', async ({ page }) => {
    await page.goto('/explore/')
    await expect(page.locator('html')).toHaveAttribute('lang', /^ta/)
    // Fixed Q2: the navigation is translated with the Ask page.
    await expect(page.getByRole('link', { name: 'சேமித்தவை', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'அரட்டைகள்', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Saved', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'சுயவிவரமும் விருப்பங்களும்' })).toBeVisible()
    await audit(page)
    await evidence(page, 'Q2-tamil-customer')
  })
})
