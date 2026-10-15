import { createShop, editShopDetails } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Kolkata' })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
})

test('regional suggestions and custom names preserve legacy labels', async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const path = '/src/features/v1/factNames.ts'
    const { factName, factSuggestions } = await import(path)
    return {
      suggestions: Object.fromEntries(
        ['INR', 'JPY', 'PHP', 'SGD', 'USD'].map((code) => [code, factSuggestions(code).payment]),
      ),
      names: [
        factName('UPI', { paynow: 'PayNow' }),
        factName('paynow', { paynow: 'PayNow' }),
        factName('constructor', {}),
      ],
    }
  })
  for (const [currency, names] of Object.entries({
    INR: ['UPI', 'Paytm', 'PhonePe'],
    JPY: ['PayPay'],
    PHP: ['GCash'],
    SGD: ['paynow', 'nets'],
  })) {
    expect(results.suggestions[currency]).toEqual(
      expect.arrayContaining([...names, 'card', 'cash']),
    )
  }
  expect(results.suggestions.USD).toEqual(['card', 'cash'])
  expect(results.names).toEqual(['UPI', 'PayNow', 'constructor'])
})

test('owner reviews custom payments and delivery; customer chips and answers keep names', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  const name = `Global shop ${Date.now()}`
  await createShop(page, `name: ${name}`)
  await editShopDetails(page)
  const payment = page.getByRole('combobox', { name: 'Payment', exact: true })
  await payment.click()
  await expect(page.getByRole('option', { name: 'UPI', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'UPI', exact: true }).click()
  await payment.fill('paynow')
  await payment.press('Enter')
  await payment.fill('x'.repeat(41))
  await payment.press('Enter')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(payment).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
  await payment.press('Backspace')
  const delivery = page.getByRole('combobox', { name: 'Delivery', exact: true })
  await delivery.fill('Swiggy')
  await delivery.press('Enter')
  await page.getByLabel('Shop name').focus()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('UPI, PayNow')
  await expect(review).toContainText('Swiggy')
  const before = await (await page.request.get('/api/v1/businesses')).json()
  expect(before[0].fields.payment_methods ?? []).toEqual([])
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  const shop = shops.find((row: { fields: { name: string } }) => row.fields.name === name)
  expect(shop.fields.payment_methods).toEqual(['UPI', 'paynow'])
  expect(shop.fields.delivery).toBe('Swiggy')
  expect(
    (
      await page.request.post(`/api/v1/businesses/${shop.id}/share`, { data: { public: true } })
    ).ok(),
  ).toBe(true)
  await page.goto(`/explore/s/${shop.id}`)
  await expect(page.getByText('UPI', { exact: true })).toBeVisible()
  await expect(page.getByText('PayNow', { exact: true })).toBeVisible()
  await expect(page.getByText('Delivery via Swiggy', { exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  const answer = await page.request.post(`/api/v1/public/shops/${shop.id}/ask`, {
    data: { question: 'Payment methods?', language: 'en' },
  })
  expect(answer.ok()).toBe(true)
  expect((await answer.json()).answer).toContain('UPI, PayNow')
})
