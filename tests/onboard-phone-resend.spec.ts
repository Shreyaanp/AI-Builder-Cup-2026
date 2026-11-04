import { capture } from './onboardPhoneSupport.js'
import { expect, test, type Page } from '@playwright/test'
import { enter, inChatFixtures, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'

// Tab recovery keeps only what is safe to resend: no refused photo, no second turn.
test.use({
  reducedMotion: 'reduce',
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  viewport: { width: 360, height: 800 },
})
test.setTimeout(90_000)
// A phone battle test: the phone project only.
test.skip(({ isMobile }) => !isMobile, 'phone project only')

async function open(page: Page) {
  await localOnly(page)
  await enter(page)
  await page.getByRole('button', { name: 'Type your shop name' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
}

async function resumeLocal(page: Page) {
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const hero = page.getByRole('button', { name: 'Let’s begin' })
  await expect(page.getByTestId('new-shop-flow')).toBeVisible()
  if (await hero.isVisible()) await hero.click()
}

/** Rows in the tab-recovery photo store (any account in this browser). */
const storedPhotos = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open('chalkboard.owner.onboarding', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('photos')
        request.onsuccess = () => {
          const count = request.result.transaction('photos').objectStore('photos').count()
          count.onsuccess = () => {
            request.result.close()
            resolve(count.result)
          }
        }
      }),
  )

test('OB-295 an oversized upload is never kept in the browser', async ({ page }) => {
  await inChatFixtures(page, 'denied')
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined }),
  )
  await open(page)
  await page.getByRole('button', { name: 'Shop photo', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
  await (
    await chooser
  ).setFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(25_000_000) })
  await expect(page.getByTestId('photo-read-error')).toBeVisible()
  await expect.poll(() => storedPhotos(page)).toBe(0)
  await page.reload()
  await resumeLocal(page)
  await expect(page.getByRole('log')).not.toBeEmpty()
  await expect(page.getByTestId('camera-modal')).toHaveCount(0)
  expect(await storedPhotos(page)).toBe(0)
})

test('OB-295 a photo the server refused is cleared and not restored', async ({ page }) => {
  await inChatFixtures(page)
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined }),
  )
  await open(page)
  await page.getByRole('button', { name: 'Shop photo', exact: true }).click()
  await page.getByTestId('camera-card').getByRole('button', { name: 'Open camera' }).click()
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Take photo', exact: true }).click()
  await expect(page.getByTestId('camera-modal')).toHaveAttribute('data-phase', 'preview')
  // The shutter keeps the shot for a reload until it is used.
  await expect.poll(() => storedPhotos(page)).toBe(1)
  await page.route('**/api/v1/photos?*', (route) =>
    route.fulfill({
      status: 422,
      json: { detail: { code: 'NOT_BUSINESS_PHOTO', message: 'Not a business photo.' } },
    }),
  )
  await page.getByRole('button', { name: 'Use photo', exact: true }).click()
  await expect(page.getByTestId('photo-read-error')).toBeVisible()
  await expect.poll(() => storedPhotos(page)).toBe(0)
  await page.unroute('**/api/v1/photos?*')
  await page.reload()
  await resumeLocal(page)
  await expect(page.getByRole('log')).not.toBeEmpty()
  await expect(page.getByTestId('camera-modal')).toHaveCount(0)
  expect(await storedPhotos(page)).toBe(0)
})

test('OB-291 a turn the server already got is not sent twice after a reload', async ({ page }) => {
  await open(page)
  const message = 'name: Twice Tea Stall'
  const sent: { turn: string; frames: string }[] = []
  const frameTurn = (body: string) => /^id: ([^:\s]+):/m.exec(body)?.[1]
  // The server receives and answers the turn, but the page reloads before it sees the answer.
  await page.route('**/api/v1/coach/stream', async (route) => {
    const body = route.request().postDataJSON() as { message: string; turn_id: string | null }
    if (body.message !== message) return route.continue()
    const response = await route.fetch()
    sent.push({ turn: body.turn_id ?? '', frames: await response.text() })
    if (sent.length > 1) await route.fulfill({ response })
  })
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(message)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  await page.reload()
  await resumeLocal(page)
  const box = page.getByRole('textbox', { name: 'Message', exact: true })
  await expect(box).toHaveValue(message)
  const owner = page.getByRole('log').getByText(message, { exact: true })
  await expect(owner).toHaveCount(0)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => sent.length).toBe(2)
  await expect(page.getByTestId('shop-so-far')).toContainText('Twice Tea Stall')
  await expect(owner).toHaveCount(1)
  // Same client turn id, and the answer is the first turn replayed, not a second model turn.
  expect(sent[0]!.turn).toBeTruthy()
  expect(sent[1]!.turn).toBe(sent[0]!.turn)
  expect(frameTurn(sent[0]!.frames)).toBeTruthy()
  expect(frameTurn(sent[1]!.frames)).toBe(frameTurn(sent[0]!.frames))
  await capture(page, 'OB-291-resend-once')
})
