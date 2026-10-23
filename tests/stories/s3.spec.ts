import { expect, test } from '@playwright/test'
import {
  closeSheet,
  catalogue,
  enter,
  liveOnly,
  localOnly,
  phone,
  seedShop,
  shareSigned,
  shopName as shopPrefix,
  shot,
  collectStamp,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S3 · nearby discovery, facts, owner reply and QR stamps', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  const shopName = `${shopPrefix} ${Date.now().toString().slice(-5)}`
  await seedShop(page, true, shopName)
  const { url, qr } = await shareSigned(page)
  await closeSheet(page)
  const customerContext = await browser.newContext({
    ...phone,
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
    geolocation: { latitude: 12.9718, longitude: 77.6412 },
  })
  try {
    const customer = await customerContext.newPage()
    await localOnly(customer)
    await test.step('1 · open customer entry', async () => {
      await customer.goto(`http://127.0.0.1:${process.env.WEB_PORT ?? 3200}/explore/`)
      await expect(customer.getByRole('button', { name: 'Use my location' })).toBeVisible()
      await shot(customer, 3, 1)
    })
    await test.step('2 · GPS discovery and typed city fallback', async () => {
      await customer.getByRole('button', { name: 'Use my location' }).click()
      // The front door is an AI ask; browsing everything nearby is one tap away.
      await expect(
        customer.getByRole('heading', { name: 'What are you looking for nearby?' }),
      ).toBeVisible()
      await shot(customer, 3, '1-ask')
      // "Homemade" only finds shops whose owner said they make their own goods.
      const ask = customer.getByRole('textbox', { name: 'Ask about anything nearby' })
      await ask.fill('homemade chai')
      await ask.press('Enter')
      const pick = customer.getByRole('link').filter({ hasText: shopName }).first()
      await expect(pick).toContainText('Locally made')
      await shot(customer, 3, '1-ask-locally-made')
      await customer.getByRole('link', { name: 'Browse everything nearby' }).first().click()
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
      await expect(customer.getByText('Demo data', { exact: true })).toBeVisible()
      await shot(customer, 3, 2)
      liveOnly('Actual GPS accuracy and live Google Places; local map cards are fixtures')
      // A typed neighbourhood anywhere in the demo world recentres discovery.
      await customer.getByRole('button', { name: 'Change area' }).click()
      await customer.getByRole('textbox', { name: 'City or area' }).fill('indiranagar, bengaluru')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      // The chosen place collapses to a label; Change area reopens the box.
      await customer.getByRole('button', { name: 'Change area' }).click()
      await expect(customer.getByRole('textbox', { name: 'City or area' })).toHaveValue(
        'Indiranagar',
      )
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
      await customer.getByRole('textbox', { name: 'City or area' }).fill('Tiong Bahru')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      const shops = customer.getByRole('list').getByRole('button').getByRole('heading')
      await expect(shops).toHaveText([
        'Tiong Bahru Kopi',
        'Tiong Bahru Bakery',
        'Chinatown Hawker Centre',
      ])
      await shot(customer, 3, '2-demo-nearest')
      await customer.getByRole('button', { name: 'Change area' }).click()
      await customer.getByRole('button', { name: 'Use my location', exact: true }).click()
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
    })
    await test.step('3 · category and fact filters', async () => {
      await customer.getByRole('button', { name: 'Coffee & tea', exact: true }).click()
      await customer.getByRole('switch', { name: 'Halal if known' }).check()
      const card = customer.getByRole('list').getByRole('link').filter({ hasText: shopName })
      await expect(card).toBeVisible()
      // Cards show the first dish only; the full menu is checked on the shop page.
      await expect(card).toContainText('₹15.00')
      await shot(customer, 3, 3)
      await card.click()
    })
    await test.step('4 · shop menu categories, hours and customer facts', async () => {
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
      await expect(customer.getByRole('listitem').filter({ hasText: /^Kopi/ })).toContainText('₹18')
      await expect(customer.getByText('UPI', { exact: true })).toBeVisible()
      await expect(customer.getByText('Locally made', { exact: true })).toBeVisible()
      await expect(customer.getByRole('heading', { name: 'Drinks', exact: true })).toBeVisible()
      await customer.getByRole('button', { name: /^Weekly hours/ }).click()
      await expect(customer.getByText('07:00–20:00', { exact: true })).toBeVisible()
      await expect(customer.getByRole('listitem').filter({ hasText: /^Kaya toast/ })).toContainText(
        'Sold out',
      )
      await shot(customer, 3, 4)
      const sample = catalogue.find((entry) => entry.city === 'bengaluru')!.shop
      await customer.route(`**/api/v1/public/shops/${sample.id}`, (route) =>
        route.fulfill({ json: sample }),
      )
      await customer.goto(`http://127.0.0.1:${process.env.WEB_PORT ?? 3200}/explore/s/${sample.id}`)
      await expect(customer.getByText('Sample shop', { exact: true })).toBeVisible()
      await expect(
        customer.getByText('Sample shop for this prototype — not a real business.'),
      ).toBeVisible()
      await expect(customer.locator('a[href^="tel:"], a[href*="wa.me"]')).toHaveCount(0)
      await shot(customer, 3, '4-demo')
      await expect(customer.locator('main img[src^="/art/category-"]')).toBeVisible()
      await customer.goto(url)
    })
    await test.step('5 · halal answer from confirmed shop facts', async () => {
      await customer.getByRole('button', { name: 'Chat with the shop' }).click()
      await customer.getByLabel('Your question').fill('halal?')
      await customer.getByLabel('Your question').press('Enter')
      await expect(
        customer.getByRole('status').filter({ hasText: 'Halal, according to the owner' }),
      ).toContainText('Not certified or verified by Chalkboard')
      await expect(customer.getByText("Answer based on the shop's listed details")).toBeVisible()
      await expect(
        customer.getByText('Simulated answer · offline fixture, no live AI connected'),
      ).toBeVisible()
      await shot(customer, 3, 5)
      await customer.getByLabel('Your question').fill('Payment methods?')
      await customer.getByRole('button', { name: 'Ask the shop assistant' }).click()
      await expect(customer.getByRole('status').filter({ hasText: 'UPI' })).toContainText('Cash')
      await shot(customer, 3, '5-payment-fixture')
    })
    await test.step('6 · signed-in question reaches Messages and owner reply reaches customer', async () => {
      await customer.getByRole('button', { name: 'Ask the owner' }).last().click()
      // Chat with owners needs sign-in; browsing and instant answers did not.
      await expect(customer.getByText('Owners reply to a real person')).toBeVisible()
      await customer.getByRole('button', { name: /Continue with Google/ }).click()
      await expect(customer.getByText(/Signed in as/)).toBeVisible()
      await customer
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill('Can I collect two chai today?')
      await customer.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(customer).toHaveURL(/\/explore\/chats\//)
      await page.getByRole('button', { name: 'Shop', exact: true }).click()
      await page.getByRole('button', { name: /^Messages 1/ }).click()
      const messages = page.getByRole('region', { name: /Messages/ })
      await expect(messages).toContainText('Can I collect two chai today?')
      await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
      await messages
        .getByLabel('Reply', { exact: true })
        .fill('Yes, ready at 4 pm. UPI is welcome.')
      await messages.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(customer.getByText('Yes, ready at 4 pm. UPI is welcome.')).toBeVisible({
        timeout: 10_000,
      })
      await shot(page, 3, '6-owner')
      await shot(customer, 3, 6)
    })
    await test.step('7 · signed QR stamp moment and an honest card', async () => {
      // The owner's poster QR is signed: the stamp moment checks it, then the card counts it.
      await customer.goto(qr)
      await collectStamp(customer)
      const moment = customer.getByRole('dialog')
      await expect(moment.getByRole('button', { name: 'Keep browsing' })).toBeVisible()
      await expect(moment.getByRole('progressbar')).toHaveCount(0)
      // A tap skips the celebration to its end state. The customer signed in to chat (step 5),
      // so this verified stamp lands on their account card, not only this phone.
      await moment.getByRole('heading').first().click()
      await expect(moment.getByText('+50 points')).toBeVisible()
      await shot(customer, 3, '7-stamp-moment')
      await moment.getByRole('button', { name: 'Keep browsing' }).click()
      await expect(customer).not.toHaveURL(/[?&]k=/)
      const card = customer.getByRole('region', { name: 'Stamp card' })
      await expect(card.getByRole('status')).toHaveText('3 stamps')
      await expect(customer.getByText('This card is saved to your account.')).toBeVisible()
      await shot(customer, 3, 7)
      await customer.reload()
      await expect(card.getByRole('status')).toHaveText('3 stamps')
    })
    await test.step('8 · light/dark and reduced motion', async () => {
      await customer.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await customer.getByRole('button', { name: 'Switch to dark mode' }).click()
      await expect(customer.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
      await shot(customer, 3, '8-dark')
      await customer.getByRole('button', { name: 'Switch to light mode' }).click()
      await shot(customer, 3, 8)
    })
  } finally {
    await customerContext.close()
  }
})
