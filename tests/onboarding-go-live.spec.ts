import { confirmShopPin, suggestShopPin } from './pinSupport.js'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { missingForListing } from '../src/features/v1/goLive.js'

// Issue #180: finishing the conversation leads to Review my shop → List my shop → the
// congratulations page with the shop link and QR. Phone first.
test.describe('what a shop needs before it is listed', () => {
  test('OB-168 / OB-188 name, what it sells and a confirmed pin', () => {
    expect(missingForListing({ business: null })).toEqual(['name', 'category', 'location'])
    expect(missingForListing({ business: { name: 'Chai', category: ' ', location: '' } })).toEqual([
      'category',
      'location',
    ])
    expect(
      missingForListing({ business: { name: 'Chai', category: 'Tea', location: 'MG Road' } }),
    ).toEqual(['location'])
    // Both coordinates are required for a map pin.
    expect(missingForListing({ business: { name: 'Chai', category: 'Tea', lat: 12.9 } })).toEqual([
      'location',
    ])
    expect(
      missingForListing({ business: { name: 'Chai', category: 'Tea', lat: 12.9, lng: 77.6 } }),
    ).toEqual([])
  })
})

for (const viewport of [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ reducedMotion: 'reduce', viewport, hasTouch: true })
    test.setTimeout(90_000)
    test.beforeEach(async ({ page }) => {
      await localOnly(page)
      await suggestShopPin(page)
    })

    async function begin(page: Page) {
      await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
      await page.getByRole('button', { name: 'Let’s begin' }).click()
      await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
    }
    async function say(page: Page, text: string) {
      await page.getByLabel('Message', { exact: true }).fill(text)
      await page.getByRole('button', { name: 'Send', exact: true }).click()
    }

    test('finish → Review my shop → congratulations with the link and QR', async ({ page }) => {
      await enter(page)
      await begin(page)
      await say(page, 'name: Lakshmi Tea Stall; category: Tea stall; location: Indiranagar metro')
      // OB-168 / OB-188: confirm the pin before finishing and opening the ready moment.
      await confirmShopPin(page)
      await expect(page.getByTestId('shop-live')).toHaveText('Live')
      await page.getByTestId('end-conversation').click()
      await expect(page.getByTestId('conversation-ended')).toBeVisible()
      await page.getByTestId('finish-review').click()
      await expect(
        page.getByRole('heading', { name: 'Congratulations, Lakshmi Tea Stall is live!' }),
      ).toBeVisible()
      await expect(page.getByTestId('shop-link')).toContainText('/s/')
      await expect(page.getByTestId('shop-qr').getByRole('img')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open my shop page' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add your menu' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Set up stamps' })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
    })

    test('a missing place is named, with a button to that question', async ({ page }) => {
      await enter(page)
      await begin(page)
      await say(page, 'name: Lakshmi Tea Stall; category: Tea stall')
      await expect(page.getByTestId('shop-so-far')).toContainText('Lakshmi Tea Stall')
      await page.getByTestId('end-conversation').click()
      await page.getByTestId('finish-review').click()
      const missing = page.getByTestId('list-missing')
      await expect(missing).toContainText('Where your shop is')
      await expect(missing).not.toContainText('Shop name')
      await expect(page.getByTestId('list-my-shop')).toBeDisabled()
      await missing.getByRole('button', { name: 'Where your shop is' }).click()
      await expect(page.getByTestId('map-card')).toBeVisible()
    })
  })
}

// OB-112: at 1280 the Caveat title wrapped onto lines that touched ("is live!" under "Stall").
test.describe('ready moment at 1280', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
  test.setTimeout(90_000)
  test('OB-112 the title lines have room between them', async ({ page }) => {
    await localOnly(page)
    await suggestShopPin(page)
    await enter(page)
    await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
    await page.getByRole('button', { name: 'Let’s begin' }).click()
    await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
    await page
      .getByLabel('Message', { exact: true })
      .fill('name: Lakshmi Tea Stall; category: Tea stall; location: Indiranagar metro')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await confirmShopPin(page)
    await expect(page.getByTestId('shop-live')).toHaveText('Live')
    await page.getByTestId('end-conversation').click()
    await page.getByTestId('finish-review').click()
    const title = page.getByRole('heading', { name: 'Congratulations, Lakshmi Tea Stall is live!' })
    await expect(title).toBeVisible()
    const ratio = await title.evaluate(
      (el) =>
        parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize),
    )
    expect(ratio).toBeGreaterThanOrEqual(1.25)
  })
})
