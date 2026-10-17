import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// The phone stays awake while voice is on: a screen wake lock from start to stop, taken again
// after the browser dropped it (the page was hidden). Offline backend; the Wake Lock API is a
// recording fake so the test can see each request and release.
test.use({ reducedMotion: 'reduce' })
test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

type Wake = { requests: number; active: number }

async function fakeWakeLock(page: Page) {
  await page.addInitScript(() => {
    const wake = { requests: 0, active: 0, locks: [] as WakeLockSentinel[] }
    Object.assign(window, { __wake: wake })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          wake.requests += 1
          wake.active += 1
          const lock = Object.assign(new EventTarget(), {
            type: 'screen',
            released: false,
            release: async () => {
              if (lock.released) return
              lock.released = true
              wake.active -= 1
            },
          })
          wake.locks.push(lock as unknown as WakeLockSentinel)
          return lock
        },
      },
    })
  })
}

const wake = (page: Page) =>
  page.evaluate(() => {
    const { requests, active } = (window as unknown as { __wake: Wake }).__wake
    return { requests, active }
  })

/** A granted microphone that hears silence. */
async function quietMicrophone(page: Page) {
  await page.context().grantPermissions(['microphone'])
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      const quiet = audio.createGain()
      quiet.gain.value = 0
      const tone = audio.createOscillator()
      tone.connect(quiet).connect(destination)
      tone.start()
      return destination.stream
    }
  })
}

test('voice keeps the screen awake, takes the lock again after a hide, and lets go on stop', async ({
  page,
}) => {
  await fakeWakeLock(page)
  await quietMicrophone(page)
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  // Nothing is held before voice starts.
  expect(await wake(page)).toEqual({ requests: 0, active: 0 })
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByTestId('voice-orb').first()).toHaveAttribute('data-phase', 'listening')
  expect(await wake(page)).toEqual({ requests: 1, active: 1 })

  // The browser drops the lock when the page is hidden; back on screen, voice takes it again.
  await page.evaluate(() => {
    const { locks } = (window as unknown as { __wake: { locks: WakeLockSentinel[] } }).__wake
    void locks.at(-1)!.release()
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => wake(page)).toEqual({ requests: 2, active: 1 })

  await page.getByRole('button', { name: 'End voice' }).click()
  await expect.poll(() => wake(page)).toEqual({ requests: 2, active: 0 })
  // A later visibility change no longer asks for the lock.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(await wake(page)).toEqual({ requests: 2, active: 0 })
})

test('voice works where the Wake Lock API is missing', async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { wakeLock?: unknown }).wakeLock
  })
  await quietMicrophone(page)
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByTestId('voice-orb').first()).toHaveAttribute('data-phase', 'listening')
  expect(await page.evaluate(() => 'wakeLock' in navigator)).toBe(false)
})
