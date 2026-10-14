import { expect, test } from '@playwright/test'
import {
  closeSheet,
  catalogue,
  enter,
  gap,
  liveOnly,
  localOnly,
  phone,
  seedShop,
  share,
  shopName as shopPrefix,
  shot,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S3 · nearby discovery, facts, owner reply and QR stamps', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  const shopName = `${shopPrefix} ${Date.now().toString().slice(-5)}`
  await seedShop(page, true, shopName)
  const url = await share(page)
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
      await customer.goto('http://127.0.0.1:3200/explore/')
      await expect(customer.getByRole('button', { name: 'Use my location' })).toBeVisible()
      await shot(customer, 3, 1)
    })
    await test.step('2 · GPS discovery and typed city fallback', async () => {
      await customer.getByRole('button', { name: 'Use my location' }).click()
      await customer.getByRole('button', { name: 'Explore my neighbourhood' }).click()
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
      await expect(customer.getByText('Demo data', { exact: true })).toBeVisible()
      await shot(customer, 3, 2)
      liveOnly('Actual GPS accuracy and live Google Places; local map cards are fixtures')
      // The offline map path accepts SG areas; Indian typed cities currently fail (S1/6, S7/3).
      await customer.getByRole('textbox', { name: 'City or area' }).fill('Bengaluru')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      await expect(
        customer.getByText('Couldn’t find that place. Try a city or neighbourhood name.', {
          exact: true,
        }),
      ).toBeVisible()
      gap('S3/2: Bengaluru typed-city fallback fails in offline mode')
      await customer.getByRole('textbox', { name: 'City or area' }).fill('Tiong Bahru')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      const shops = customer.getByRole('list').getByRole('button').getByRole('heading')
      await expect(shops).toHaveText([
        'Tiong Bahru Kopi',
        'Tiong Bahru Bakery',
        'Chinatown Hawker Centre',
      ])
      await shot(customer, 3, '2-demo-nearest')
      await customer.getByRole('button', { name: 'Use my location', exact: true }).click()
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
    })
    await test.step('3 · category and fact filters', async () => {
      await customer.getByRole('button', { name: 'Coffee & tea', exact: true }).click()
      await customer.getByRole('switch', { name: 'Halal if known' }).check()
      const card = customer.getByRole('list').getByRole('link').filter({ hasText: shopName })
      await expect(card).toBeVisible()
      await expect(card).toContainText('₹18.00')
      await shot(customer, 3, 3)
      await card.click()
    })
    await test.step('4 · shop menu categories, hours and customer facts', async () => {
      await expect(customer.getByRole('heading', { name: shopName })).toBeVisible()
      await expect(customer.getByRole('listitem').filter({ hasText: 'Kopi' })).toContainText(
        '₹18.00',
      )
      await expect(customer.getByText('UPI', { exact: true })).toBeVisible()
      await expect(customer.getByRole('heading', { name: 'Drinks', exact: true })).toBeVisible()
      await expect(customer.getByText('07:00–20:00', { exact: true })).toBeVisible()
      await expect(customer.getByRole('listitem').filter({ hasText: 'Kaya toast' })).toContainText(
        'Sold out',
      )
      await shot(customer, 3, 4)
      const sample = catalogue.find((entry) => entry.city === 'bengaluru')!.shop
      await customer.route(`**/api/v1/public/shops/${sample.id}`, (route) =>
        route.fulfill({ json: sample }),
      )
      await customer.goto(`http://127.0.0.1:3200/explore/s/${sample.id}`)
      await expect(customer.getByText('Demo shop', { exact: true })).toBeVisible()
      await expect(
        customer.getByText('Sample shop for this prototype — not a real business.'),
      ).toBeVisible()
      await expect(customer.locator('a[href^="tel:"], a[href*="wa.me"]')).toHaveCount(0)
      await shot(customer, 3, '4-demo')
      gap(
        'S3/4: owner-uploaded gallery is not displayed on the customer page; generic category artwork is used',
      )
      await customer.goto(url)
    })
    await test.step('5 · halal answer from confirmed shop facts', async () => {
      await customer.getByRole('button', { name: 'Chat with the shop' }).click()
      await customer.getByLabel('Your question').fill('halal?')
      await customer.getByLabel('Your question').press('Enter')
      await expect(customer.getByRole('status').filter({ hasText: 'Not listed' })).toContainText(
        'Please contact the shop',
      )
      gap(
        'S3/5: the offline answer fixture says halal is not listed even though the public page shows the confirmed Halal fact',
      )
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
    await test.step('6 · question reaches Messages and owner reply reaches customer', async () => {
      await customer.getByRole('button', { name: 'Ask the owner' }).last().click()
      await customer.getByLabel('Phone or email').fill('story-customer@example.test')
      await customer
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill('Can I collect two chai today?')
      await customer.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(customer.getByText("Sent to the shop — they haven't replied yet")).toBeVisible()
      gap(
        'S3/6: customer can message without signing in; STORIES explicitly disallows anonymous chat',
      )
      await page.getByRole('button', { name: 'My shop', exact: true }).click()
      await page.getByRole('button', { name: /^Messages 1/ }).click()
      const messages = page.getByRole('region', { name: /Messages/ })
      await expect(messages).toContainText('Can I collect two chai today?')
      await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
      await customer.getByRole('button', { name: 'Open conversation', exact: true }).click()
      await messages
        .getByLabel('Reply', { exact: true })
        .fill('Yes, ready at 4 pm. UPI is welcome.')
      await messages.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(
        customer.getByRole('dialog', { name: 'Conversation', exact: true }),
      ).toContainText('Yes, ready at 4 pm. UPI is welcome.', { timeout: 5_000 })
      const localDate = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date())
      await expect(
        customer.getByRole('dialog', { name: 'Conversation', exact: true }),
      ).toContainText(localDate)
      await shot(page, 3, '6-owner')
      await shot(customer, 3, 6)
    })
    await test.step('7 · QR stamp card is honestly device-only', async () => {
      await customer.goto(`${url}?source=qr`)
      const card = customer.getByRole('region', { name: 'Stamp card' })
      await expect(card.getByRole('status')).toHaveText('1 stamps')
      await expect(customer.getByText('This card is stored on this phone.')).toBeVisible()
      await shot(customer, 3, 7)
      await customer.reload()
      await expect(card.getByRole('status')).toHaveText('1 stamps')
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
