import { test, expect, audit, owner, say, prepare, approve } from './support.js'
import { openTool, preparePayment } from '../owner-tools-support.js'

test('owner creates a UPI request; coach returns the same payee without sending money', async ({
  page,
}) => {
  await owner(page)
  await preparePayment(page)
  await audit(page)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await say(page, 'Send a payment link for ₹240 to the customer')
  await expect(page.getByRole('log').getByRole('link', { name: 'Open UPI' })).toHaveAttribute(
    'href',
    /am=240.00/,
  )
  await expect(page.getByRole('log')).toContainText('nothing', { ignoreCase: true })
})

test('help sends a forecast question and returns to the coach', async ({ page }) => {
  await owner(page)
  await openTool(page, 'Talk to your coach')
  await audit(page)
  const forecast = page.getByRole('button', { name: /^Forecast demand for / })
  const sentence = (await forecast.textContent())!
  await forecast.click()
  await expect(page.getByRole('log')).toContainText(sentence)
  await expect(page).not.toHaveURL(/feature=guide/)
})

test('service businesses get six relevant guide examples', async ({ page }) => {
  const id = await owner(page)
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const proposal = await prepare(page.request, {
    kind: 'business',
    business_id: id,
    revision: shop.revision,
    business: { ...shop.fields, category: 'Tailor' },
  })
  expect((await approve(page.request, proposal)).ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await openTool(page, 'Talk to your coach')
  await expect(page.locator('main .MuiChip-root:visible')).toHaveCount(6)
  await expect(page.getByText('Rescue deals', { exact: true })).toHaveCount(0)
  await audit(page)
  await page.getByRole('button', { name: 'Help me update my services.', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Help me update my services.')
})

test('rider handoffs preserve the saved pickup and typed drop', async ({ page }) => {
  const id = await owner(page)
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const proposal = await prepare(page.request, {
    kind: 'business',
    business_id: id,
    revision: shop.revision,
    business: { ...shop.fields, lat: 12.9716, lng: 77.5946, pin_demo: false },
  })
  expect((await approve(page.request, proposal)).ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await openTool(page, 'Payments & rides')
  await page.getByRole('button', { name: 'Back', exact: true }).last().click()
  await page.getByText('Send a rider', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Drop address or pin' }).fill('Market Road, Gate 2')
  const url = new URL(
    (await page.getByRole('link', { name: 'Uber', exact: true }).getAttribute('href'))!,
  )
  expect(url.searchParams.get('pickup[latitude]')).toBe('12.9716')
  expect(url.searchParams.get('pickup[longitude]')).toBe('77.5946')
  expect(url.searchParams.get('dropoff[formatted_address]')).toBe('Market Road, Gate 2')
  await expect(page.getByRole('link', { name: 'Rapido · Open home' })).toHaveAttribute(
    'href',
    'https://www.rapido.bike/',
  )
  await expect(page.getByRole('link', { name: 'Porter · Open home' })).toHaveAttribute(
    'href',
    'https://porter.in/',
  )
  await audit(page)
})

test('a guide sentence waits for an active coach reply', async ({ page }) => {
  await owner(page)
  const sent: string[] = []
  let release!: () => void
  const firstReply = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/coach/stream', async (route) => {
    sent.push(route.request().postDataJSON().message)
    if (sent.length === 1) await firstReply
    await route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"kind":"ready","mode":"offline"}\n\ndata: {"kind":"reply","text":"Received"}\n\ndata: {"kind":"turn_complete"}\n\n',
    })
  })
  try {
    await say(page, 'Tell me about today')
    await expect.poll(() => sent.length).toBe(1)
    await openTool(page, 'Talk to your coach')
    const forecast = page.getByRole('button', { name: /^Forecast demand for / })
    const sentence = (await forecast.textContent())!
    await forecast.click()
    expect(sent).toEqual(['Tell me about today'])
    release()
    await expect.poll(() => sent.length).toBe(2)
    expect(sent[1]).toBe(sentence)
    await expect(page.getByRole('log')).toContainText(sentence)
  } finally {
    release()
  }
})
