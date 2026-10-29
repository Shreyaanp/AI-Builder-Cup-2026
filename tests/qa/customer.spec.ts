import { test, expect, owner, publish, audit, evidence } from './support.js'
import { localOnly } from '../stories/support.js'

test('public menu keeps local prices, hides private stock, and updates across contexts', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await owner(page)
  const path = await publish(page, id)
  const context = await browser.newContext({ baseURL, viewport: test.info().project.use.viewport })
  try {
    const customer = await context.newPage()
    await localOnly(customer)
    await customer.goto(path)
    const kopi = customer.getByRole('listitem').filter({ hasText: 'Kopi' })
    await expect(kopi).toContainText('₹18')
    const publicShop = await (await customer.request.get(`/api/v1/public/shops/${id}`)).json()
    expect(publicShop.products[0]).not.toHaveProperty('stock')
    const products = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
    const product = products.find((p: { name: string }) => p.name === 'Kopi')
    expect(
      (
        await page.request.post(`/api/v1/businesses/${id}/inventory/${product.id}/availability`, {
          data: { available: false },
        })
      ).ok(),
    ).toBe(true)
    await expect(kopi).toContainText('Sold out', { timeout: 6500 })
    await audit(customer)
    await evidence(customer, 'public-sold-out')
    await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: false } })
    await customer.reload()
    await expect(customer.getByRole('heading', { name: 'Menu & prices' })).toHaveCount(0)
    await expect(customer.getByRole('link', { name: /Back/ })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('instant facts remain anonymous; owner chat needs sign-in, replies arrive, close blocks sending', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await owner(page)
  const path = await publish(page, id)
  const context = await browser.newContext({ baseURL, viewport: test.info().project.use.viewport })
  try {
    const customer = await context.newPage()
    await localOnly(customer)
    await customer.goto(path)
    expect(
      (
        await customer.request.post(`/api/v1/customer/shops/${id}/threads`, {
          data: { text: 'Anonymous message' },
        })
      ).status(),
    ).toBe(401)
    await customer.getByRole('button', { name: 'Chat with the shop' }).click()
    await customer.getByLabel('Your question').fill('halal?')
    await customer.getByRole('button', { name: 'Ask the shop assistant' }).click()
    await expect(
      customer.getByText(/not certified|not verified|has not verified/i).first(),
    ).toBeVisible()
    await customer.getByRole('button', { name: 'Ask the owner' }).last().click()
    await expect(customer.getByText('Owners reply to a real person')).toBeVisible()
    await customer.getByRole('button', { name: /Continue with Google/ }).click()
    await customer
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('QA allergy question')
    await customer.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(customer).toHaveURL(new RegExp(`/explore/chats/${id}/`))
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /^Messages 1/ }).click()
    const messages = page.getByRole('region', { name: /Messages/ })
    await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
    await messages.getByLabel('Reply', { exact: true }).fill('Please ask staff before ordering')
    await messages.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(customer.getByRole('list', { name: /Courtyard Chai/ })).toContainText(
      'Please ask staff before ordering',
      { timeout: 6500 },
    )
    await customer.reload()
    await expect(customer.getByRole('list', { name: /Courtyard Chai/ })).toContainText(
      'Please ask staff before ordering',
    )
    await messages.getByRole('button', { name: 'Close conversation', exact: true }).click()
    await expect(customer.getByText('This conversation is closed.')).toBeVisible({ timeout: 6500 })
    // Fixed Q11: hidden chat-author labels stay inside their bubbles; the page fits 1440px.
    await audit(customer)
  } finally {
    await context.close()
  }
})

test('customer chat message failure preserves text and can retry', async ({ page }) => {
  const id = await owner(page)
  await publish(page, id)
  await page.request.post('/api/v1/customer/session', { data: { name: 'QA customer' } })
  await page.goto(`/s/${id}`)
  await page.getByRole('button', { name: 'Chat with the shop' }).click()
  await page.getByRole('button', { name: 'Ask the owner' }).last().click()
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('Retry me')
  await page.route('**/customer/shops/*/threads', (r) => r.fulfill({ status: 503, json: {} }))
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText(/Could not send/)).toBeVisible()
  await expect(input).toHaveValue('Retry me')
  await page.unroute('**/customer/shops/*/threads')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/explore/chats/${id}/`))
})

test('Tamil public facts and prices remain consistent with owner data', async ({ page }) => {
  const id = await owner(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: /தமிழ்/ }).click()
  await page.keyboard.press('Escape')
  await publish(page, id)
  await page.goto(`/s/${id}`)
  await expect(page.locator('html')).toHaveAttribute('lang', /^ta/)
  await expect(page.getByRole('listitem').filter({ hasText: 'Kopi' })).toContainText('₹18')
  await audit(page)
})

test('actual offline public question preserves input and reconnect retry works', async ({
  page,
  context,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.goto(`/s/${id}`)
  await page.getByRole('button', { name: 'Chat with the shop' }).click()
  const input = page.getByLabel('Your question')
  await input.fill('How much is Kopi?')
  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
    await expect(page.getByRole('alert')).toContainText('Could not send')
    await expect(input).toHaveValue('How much is Kopi?')
  } finally {
    await context.setOffline(false)
  }
  await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Listed price' })).toContainText(
    /₹18(?![.\d])/,
  )
})
