import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from '../stories/support.js'
import { FIRST_QUESTION } from '../newShopTopics.js'

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

async function startNewShop(page: Page) {
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
}

async function typeMessage(page: Page, text: string) {
  const input = page.getByLabel('Message', { exact: true })
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

test.describe('Onboarding end-to-end flows on phone (390px)', () => {
  test('typed flow: partial details → stop/finish → Review my shop → supply missing location → List my shop → Congratulations', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await startNewShop(page)

    // Owner types name and category only (location intentionally omitted)
    await typeMessage(page, 'name: Green Leaf Tea; category: Cafe')
    await expect(page.getByTestId('shop-so-far')).toContainText('Green Leaf Tea')

    // End conversation via end-conversation button
    const endBtn = page.getByTestId('end-conversation')
    await expect(endBtn).toBeVisible()
    await endBtn.click()

    // Conversation is ended; "Review my shop" appears
    await expect(page.getByTestId('conversation-ended')).toBeVisible()
    const reviewBtn = page.getByTestId('finish-review')
    await expect(reviewBtn).toBeVisible()
    await reviewBtn.click()

    // Review sheet opens with List my shop button disabled because location is missing
    const listSheet = page.getByTestId('list-missing')
    await expect(listSheet).toBeVisible()
    await expect(listSheet).toContainText('Where your shop is')
    const listMyShopBtn = page.getByTestId('list-my-shop')
    await expect(listMyShopBtn).toBeDisabled()

    // Tap missing location button to supply location
    await listSheet.getByRole('button', { name: 'Where your shop is' }).click()

    // Map card opens in chat
    const mapCard = page.getByTestId('map-card')
    await expect(mapCard).toBeVisible()

    // Click "Use my current location" if pin is not yet set
    const useLocationBtn = mapCard.getByRole('button', { name: 'Use my current location' })
    if (await useLocationBtn.isVisible()) {
      await useLocationBtn.click()
    }
    const confirmPinBtn = mapCard.getByRole('button', { name: 'This is my shop' })
    await expect(confirmPinBtn).toBeVisible({ timeout: 10_000 })
    await confirmPinBtn.click()

    // Now all 3 fields are present; shop is live
    await expect(page.getByTestId('shop-live')).toHaveText('Saved', { timeout: 15_000 })

    // Clicking end-conversation ends chat; then Review my shop goes to Congratulations
    await page.getByTestId('end-conversation').click()
    await expect(page.getByTestId('conversation-ended')).toBeVisible()
    await page.getByTestId('finish-review').click()

    // Congratulations screen with shop link and QR
    await expect(
      page.getByRole('heading', { name: /Congratulations, Green Leaf Tea is live!/ }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('shop-link')).toContainText('/s/')
    await expect(page.getByTestId('shop-qr').getByRole('img')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open my shop page' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add your menu' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Set up stamps' })).toBeVisible()

    // Verify no horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

  test('typed flow: providing all 3 fields upfront marks shop live automatically', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await startNewShop(page)

    // Owner types name, category and location in one message
    await typeMessage(
      page,
      'name: Golden Bakes; category: Bakery; location: Koramangala 4th Block, Bengaluru',
    )
    await expect(page.getByTestId('shop-live')).toHaveText('Saved', { timeout: 15_000 })

    // Ending conversation and reviewing goes directly to congratulations
    await page.getByTestId('end-conversation').click()
    await expect(page.getByTestId('conversation-ended')).toBeVisible()
    await page.getByTestId('finish-review').click()

    await expect(
      page.getByRole('heading', { name: /Congratulations, Golden Bakes is live!/ }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('shop-link')).toBeVisible()
    await expect(page.getByTestId('shop-qr')).toBeVisible()
  })

  test('typed flow: typing stop word ending conversation', async ({ page }) => {
    test.setTimeout(90_000)
    await startNewShop(page)

    // Type shop details
    await typeMessage(page, 'name: Corner Chai; category: Tea')
    await expect(page.getByTestId('shop-so-far')).toContainText('Corner Chai')

    // Type "stop" / "I am finished" in chat
    await typeMessage(page, "I'm finished")

    // The agent processes stop intent or conversation-ended status appears
    // In offline mode, the agent receives "I'm finished" and ends the conversation
    await expect(page.getByTestId('conversation-ended')).toBeVisible({ timeout: 15_000 })
  })
})
