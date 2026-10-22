import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
}

/** Ask and Message live together in the Chat with the shop sheet. */
async function openChat(page: Page) {
  await page.getByRole('button', { name: 'Chat with the shop' }).click()
  await expect(page.getByRole('dialog', { name: 'Chat with the shop' })).toBeVisible()
}

/** Choosing the owner asks for sign-in once (local stand-in for Google), then the message. */
async function toOwner(page: Page) {
  await page.getByRole('button', { name: 'Ask the owner' }).last().click()
  await expect(page.getByText('Owners reply to a real person')).toBeVisible()
  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect(page.getByText('Signed in as Asha')).toBeVisible()
}

async function sharedShop(page: Page, phone = '+65 6123 4567') {
  await localOnly(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: {
        name: 'Tiong Bahru Kopi',
        location: 'Tiong Bahru, Singapore',
        hours: '07:00–14:00',
        phone,
      },
      products: [
        { name: 'Kopi', price: 180, unit: 'cup', stock: 987 },
        { name: 'Kaya toast', price: 240, unit: 'set' },
      ],
    },
  })
  expect(prepared.ok()).toBeTruthy()
  const proposal = await prepared.json()
  const saved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(saved.ok()).toBeTruthy()
  const { business_id: id } = await saved.json()
  const sharing = await page.request.post(`/api/v1/businesses/${id}/share`, {
    data: { public: true },
  })
  expect(sharing.ok()).toBeTruthy()
  return id as string
}

test('Signed-in customer and owner have a live two-way conversation', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await sharedShop(page)
  const signedOut = await browser.newContext({
    baseURL,
    viewport: { width: 412, height: 915 },
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
  })
  try {
    const customer = await signedOut.newPage()
    await localOnly(customer)
    await customer.goto(`/s/${id}`)
    await expect(customer.getByRole('heading', { name: 'Tiong Bahru Kopi' })).toBeVisible()
    // Browsing and instant answers need no account.
    await expect(customer.getByText('Owners reply to a real person')).toHaveCount(0)
    // Header actions: call and WhatsApp the shop (one place, not on every menu row).
    await expect(customer.getByRole('link', { name: 'Call', exact: true })).toHaveAttribute(
      'href',
      'tel:+6561234567',
    )
    const whatsapp = await customer
      .getByRole('link', { name: 'WhatsApp', exact: true })
      .getAttribute('href')
    const link = new URL(whatsapp!)
    expect(link.hostname).toBe('wa.me')
    expect(link.pathname).toBe('/6561234567')
    expect(link.searchParams.get('text')).toBe(
      'Hello Tiong Bahru Kopi, I would like to ask about your menu.',
    )
    await openChat(customer)
    const question = customer.getByLabel('Your question')
    await question.fill('How much is kopi?')
    await question.press('Enter')
    await expect(customer.getByRole('status').filter({ hasText: 'Listed price' })).toContainText(
      '$1.80 / cup',
    )
    await expect(customer.getByText("Answer based on the shop's listed details")).toBeVisible()
    await expect(
      customer.getByText('Simulated answer · offline fixture, no live AI connected'),
    ).toBeVisible()
    await question.fill('Is kaya toast allergy-safe?')
    await customer.getByRole('button', { name: 'Ask the shop assistant' }).click()
    await expect(customer.getByRole('status').filter({ hasText: 'Not listed' })).toContainText(
      'Please contact the shop',
    )

    // Messaging the owner needs sign-in (A5), checked on the server too.
    expect(
      (
        await customer.request.post(`/api/v1/customer/shops/${id}/threads`, {
          data: { text: 'Hello' },
        })
      ).status(),
    ).toBe(401)
    await toOwner(customer)
    // Plain text must remain plain text in both interfaces.
    await customer
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Could I ask about kopi? <script>hello</script>')
    await customer.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(customer).toHaveURL(new RegExp(`/explore/chats/${id}/`))
    const thread = customer.getByRole('list', { name: 'Tiong Bahru Kopi' })
    await expect(thread).toContainText('Could I ask about kopi? <script>hello</script>')
    await expect(customer.getByText('Sent. The owner replies here')).toBeVisible()
    expect(
      (
        await customer.request.get(`/api/v1/businesses/${id}/inquiries`, {
          headers: { Cookie: '' },
        })
      ).status(),
    ).toBe(401)
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    // The pending card says who is waiting; its Reply opens the same inbox sheet.
    const waiting = page.getByRole('region', { name: '1 customer is waiting' })
    await expect(waiting).toBeVisible()
    // The Messages tile shows the unread count and opens the inbox sheet.
    await page.getByRole('button', { name: /^Messages 1/ }).click()
    const messages = page.getByRole('region', { name: /Messages/ })
    // The owner sees the customer's Google name (the local stand-in is Asha).
    await expect(messages).toContainText('Asha')
    await expect(messages).toContainText('Could I ask about kopi? <script>hello</script>')
    await expect(messages).toContainText('Unread')
    await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Messages (0)' })).toBeVisible()
    await messages
      .getByLabel('Reply', { exact: true })
      .fill('Yes, kopi is available. How can I help?')
    await messages.getByRole('button', { name: 'Send message', exact: true }).click()
    // 5s is less than the polling fallback: this checks actual live delivery.
    await expect(thread).toContainText('Yes, kopi is available. How can I help?', {
      timeout: 5_000,
    })
    const composer = customer.getByRole('textbox', { name: 'Message', exact: true })
    await composer.fill('Thank you!')
    await composer.press('Enter')
    await expect(messages).toContainText('Thank you!', { timeout: 5_000 })
    await messages.getByRole('button', { name: 'See translation', exact: true }).last().click()
    await expect(messages).toContainText(
      'Simulated translation \u00b7 offline fixture, no live AI connected',
    )
    await messages.getByRole('button', { name: 'Close conversation', exact: true }).click()
    await expect(customer.getByText('This conversation is closed.')).toBeVisible({
      timeout: 5_000,
    })
    await expect(composer).toHaveCount(0)
    // The thread lives in Chats.
    await customer.goto('/explore/chats')
    await expect(customer.getByRole('list', { name: 'Chats' })).toContainText('Tiong Bahru Kopi')
  } finally {
    await signedOut.close()
  }
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`public answer and contact forms have zero axe violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    const id = await sharedShop(page)
    await page.goto(`/s/${id}`)
    await openChat(page)
    await page.getByLabel('Your question').fill('How much is kopi?')
    await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
    await expect(page.getByText("Answer based on the shop's listed details")).toBeVisible()
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
    // After an answer, the person behind the shop is one tap away.
    await expect(page.getByRole('button', { name: 'Ask the owner' })).toBeVisible()
  })
}

test('H09: changed facts clear an old answer; errors preserve input and offer recovery', async ({
  page,
}) => {
  const id = await sharedShop(page, '')
  await page.goto(`/s/${id}`)
  await expect(page.getByRole('link', { name: 'Call', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0)
  await openChat(page)
  const question = page.getByLabel('Your question')
  await question.fill('How much is kopi?')
  await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
  await expect(page.getByText('Available as shown', { exact: false })).toBeVisible()
  const products = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  const kopi = products.find((item: { name: string }) => item.name === 'Kopi')
  await page.request.post(`/api/v1/businesses/${id}/inventory/${kopi.id}/availability`, {
    data: { available: false },
  })
  // Refresh lives on the page behind the sheet; changed facts clear the old answer.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await openChat(page)
  await expect(page.getByText("Answer based on the shop's listed details")).toHaveCount(0)
  // Like a messenger, a sent question leaves the box; ask again.
  await question.fill('How much is kopi?')
  await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
  await expect(page.getByText('Sold out as shown', { exact: false })).toBeVisible()
  await page.route('**/ask', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: '{}' }),
  )
  await question.fill('How much is kopi?')
  await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
  await expect(page.getByRole('alert')).toContainText('Please wait a minute')
  // A failed question stays in the box to retry.
  await expect(question).toHaveValue('How much is kopi?')
  await toOwner(page)
  const message = page.getByRole('textbox', { name: 'Message', exact: true })
  await message.fill(' ')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText('Enter a message of up to 500 characters.')).toBeVisible()
  await expect(message).toBeFocused()
  await message.fill('Hello')
  await page.route('**/customer/shops/*/threads', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  )
  await message.press('Control+Enter')
  await expect(
    // A-17: a server error (503) is ours, never the customer's connection.
    page.getByText('Something went wrong on our side. Try again in a moment.'),
  ).toBeVisible()
  await expect(message).toHaveValue('Hello')
  await page.unroute('**/customer/shops/*/threads')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/explore/chats/${id}/`))
  await expect(page.getByText('Sent. The owner replies here')).toBeVisible()
})

test('Polling recovers when the live stream fails, and a blocked customer cannot send', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await sharedShop(page)
  const signedOut = await browser.newContext({ baseURL, viewport: { width: 412, height: 915 } })
  try {
    const customer = await signedOut.newPage()
    await localOnly(customer)
    await customer.route('**/threads/*/stream', (route) =>
      route.fulfill({ status: 503, body: '{}' }),
    )
    await customer.goto(`/s/${id}`)
    await openChat(customer)
    await toOwner(customer)
    await customer
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Hello from fallback')
    await customer.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(customer).toHaveURL(new RegExp(`/explore/chats/${id}/`))
    const thread = customer.getByRole('list', { name: 'Tiong Bahru Kopi' })
    await expect(thread).toContainText('Hello from fallback')
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /^Messages 1/ }).click()
    const messages = page.getByRole('region', { name: /Messages/ })
    await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
    await messages.getByLabel('Reply', { exact: true }).fill('Reply through polling')
    await messages.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(thread).toContainText('Reply through polling', { timeout: 12_000 })
    await messages.getByRole('button', { name: 'Block customer', exact: true }).click()
    await messages
      .getByRole('group', { name: 'Block this customer from sending more messages?' })
      .getByRole('button', { name: 'Block customer', exact: true })
      .click()
    await expect(messages).toContainText('Customer blocked')
    await expect(customer.getByText('This conversation is closed.')).toBeVisible({
      timeout: 12_000,
    })
    // Starting again continues the same blocked thread, so the server refuses it.
    const again = await customer.request.post(`/api/v1/customer/shops/${id}/threads`, {
      data: { text: 'Try again' },
    })
    expect(again.ok()).toBeFalsy()
  } finally {
    await signedOut.close()
  }
})
