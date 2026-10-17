import { expect, test, type Page } from '@playwright/test'
import { enter, image, inChatFixtures, localOnly } from './stories/support.js'
import { askedTopics, FIRST_QUESTION } from './newShopTopics.js'

// Owner phone test, 17 Oct: closing the camera (X) stays quiet (#107), a menu photo never renames
// the shop (#110), and the camera is a full-screen view opened from the in-chat card (#111).
test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true })
test.beforeEach(async ({ page }) => {
  await localOnly(page)
  // A film of a price board for the camera; the microphone is refused, so the chat is typed.
  await inChatFixtures(page)
  await page.addInitScript(() => {
    const film = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.audio) throw new DOMException('Permission denied', 'NotAllowedError')
      return film(constraints)
    }
  })
})

async function begin(page: Page) {
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

test('#107 the camera card X closes quietly: no turn, no thinking, the draft is kept', async ({
  page,
}) => {
  await begin(page)
  await say(page, 'name: Gupta Sweets; category: Sweets; location: Lajpat Nagar')
  await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
  await expect.poll(async () => (await askedTopics(page)).length).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Shop photo' }).click()
  const camera = page.getByTestId('camera-card')
  await expect(camera).toBeVisible()
  const turns: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/coach/stream')) turns.push(request.postData() ?? '')
  })
  await camera.getByRole('button', { name: 'Close camera' }).click()
  await expect(camera).toHaveCount(0)
  await page.waitForTimeout(1_500)
  expect(turns).toEqual([])
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
})

test('#110 a name printed on a menu photo never replaces the one the owner gave', async ({
  page,
}) => {
  await begin(page)
  await say(page, 'name: Gupta Sweets; category: Sweets; location: Lajpat Nagar')
  await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
  await page.route('**/api/v1/photos?*', (route) =>
    route.fulfill({
      json: {
        status: 'needs_review',
        photo_kind: 'menu',
        proposal: {
          kind: 'business',
          business_id: '',
          revision: 0,
          snapshot: {
            kind: 'business',
            business_id: '',
            revision: 0,
            business: {
              name: 'Chai Corner',
              category: 'Tea stall',
              location: '',
              hours: '',
              phone: '',
            },
            products: [],
          },
        },
        extraction: {
          uncertain: [],
          business: {
            name: 'Chai Corner',
            category: 'Tea stall',
            location: '',
            hours: '',
            phone: '',
          },
          products: [],
        },
      },
    }),
  )
  const turns: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/coach/stream')) turns.push(request.postData() ?? '')
  })
  await page.getByRole('button', { name: 'Shop photo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
  await (await chooser).setFiles(await image(page))
  await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
  await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
  await expect(page.getByTestId('shop-so-far')).not.toContainText('Chai Corner')
  // Only offered: tap to use it.
  const chip = page.getByTestId('name-suggestion')
  await expect(chip).toContainText('Chai Corner')
  await expect.poll(() => turns.length).toBeGreaterThan(0)
  expect(turns.join('\n')).not.toContain('Chai Corner')
  await chip.click()
  await expect(page.getByTestId('shop-so-far')).toContainText('Chai Corner')
  await expect(chip).toHaveCount(0)
})

test('#111 the camera opens full screen from the card and returns to the chat with the photo', async ({
  page,
}) => {
  await begin(page)
  await say(page, 'name: Gupta Sweets; category: Sweets; location: Lajpat Nagar')
  await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
  await page.getByRole('button', { name: 'Shop photo' }).click()
  const camera = page.getByTestId('camera-card')
  await expect(camera).toHaveAttribute('data-phase', 'ask')
  await camera.getByRole('button', { name: 'Open camera' }).click()
  const modal = page.getByTestId('camera-modal')
  await expect(modal).toHaveAttribute('data-phase', 'live')
  const box = (await modal.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(389)
  expect(box.height).toBeGreaterThan(844 * 0.95)
  await expect(modal.getByRole('button', { name: 'Take photo' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Upload instead' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Close camera' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'docs/stories/onboarding-camera-fullscreen-390.png' })
  await modal.getByRole('button', { name: 'Take photo' }).click()
  await expect(modal).toHaveAttribute('data-phase', 'preview')
  await modal.getByRole('button', { name: 'Use photo' }).click()
  await expect(modal).toHaveCount(0)
  await expect(camera).toHaveCount(0)
  await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
})
