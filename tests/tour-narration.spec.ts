import { expect, test } from '@playwright/test'
import { narrationQueue } from '../src/features/tour/narrationQueue.js'
import type { NarrationPlayback, NarrationVoice } from '../src/features/tour/narrationQueue.js'
import { tourCopy } from '../src/features/tour/strings.js'

test('narration queue: late responses, cancellation, fallback and autoplay rejection', async () => {
  const events: string[] = []
  const signals: AbortSignal[] = []
  const pending: ((value: NarrationPlayback | null) => void)[] = []
  const playback = (name: string): NarrationPlayback => ({
    async play() {
      events.push(`play:${name}`)
    },
    stop() {
      events.push(`stop:${name}`)
    },
  })
  const voice: NarrationVoice = {
    load: (_text, _language, signal) => {
      signals.push(signal)
      return new Promise((resolve) => pending.push(resolve))
    },
    fallback: () => playback('phone'),
  }
  const queue = narrationQueue(voice)
  const first = queue.speak('first', 'hi')
  const second = queue.speak('second', 'hi')
  expect(signals[0]!.aborted).toBe(true)
  pending[1]!(playback('second'))
  await second
  pending[0]!(playback('first'))
  await first
  expect(events).toEqual(['play:second', 'stop:first'])
  queue.stop()
  expect(events.at(-1)).toBe('stop:second')

  const closed = queue.speak('close before response', 'hi')
  queue.stop()
  pending[2]!(null)
  await closed
  expect(events).not.toContain('play:phone')

  const fallback = queue.speak('unavailable', 'hi')
  pending[3]!(null)
  await fallback
  expect(events.at(-1)).toBe('play:phone')
  const blocked = queue.speak('blocked', 'hi')
  pending[4]!({
    async play() {
      throw new DOMException('Tap required', 'NotAllowedError')
    },
    stop() {
      events.push('stop:blocked')
    },
  })
  await blocked
  expect(events.filter((event) => event === 'play:phone')).toHaveLength(1)

  const failed = narrationQueue({
    async load() {
      throw new Error('offline')
    },
    fallback: () => playback('offline phone'),
  })
  await failed.speak('offline', 'hi')
  failed.stop()
  expect(events.slice(-2)).toEqual(['play:offline phone', 'stop:offline phone'])
})

test.skip(({ isMobile }) => !isMobile, '390px phone narration flow')

test('390px phone: public demo, optional Hindi narration, interruption and remembered choice', async ({
  page,
}) => {
  const requests: { text: string; language: string }[] = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
    if (url.pathname.endsWith('/tts')) {
      requests.push(route.request().postDataJSON())
      // Successful cloud bytes; playback itself is deterministic below.
      return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'mock audio' })
    }
    return route.continue()
  })
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.explainer.owner.v1', '1')
    localStorage.setItem('niva.language.chosen', '1')
    localStorage.setItem(
      'niva.starter.preferences',
      JSON.stringify({ language: 'hi', appearance: 'light' }),
    )
    const events: string[] = []
    Object.assign(window, { tourAudioEvents: events })
    let id = 0
    window.Audio = class {
      id = ++id
      onended = null
      onerror = null
      async play() {
        events.push(`play:${this.id}`)
      }
      pause() {
        events.push(`stop:${this.id}`)
      }
      removeAttribute() {}
      load() {}
    } as unknown as typeof Audio
  })
  const openTour = async () => {
    await page.goto('/demo?tour=1', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#tour-title')).toContainText(tourCopy('hi').steps[0]!.title, {
      timeout: 30_000,
    })
  }
  await openTour()
  const speaker = page.locator('#tour-title').locator('..').locator('button[aria-pressed]')
  await expect(speaker).toHaveAttribute('aria-pressed', 'false')
  expect(requests).toHaveLength(0)
  await speaker.tap()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({
    text: `${tourCopy('hi').steps[0]!.title}. ${tourCopy('hi').steps[0]!.body}`,
    language: 'hi',
  })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents.filter((event) =>
            event.startsWith('play:'),
          ).length,
      ),
    )
    .toBe(1)
  await page.locator('#tour-title').locator('..').locator('button').last().tap()
  await expect.poll(() => requests.length).toBe(2)
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents),
    )
    .toContain('stop:1')
  await page.locator('#tour-title').locator('..').locator('button').nth(2).tap()
  await expect(page.locator('#tour-title')).toBeVisible()
  expect(requests).toHaveLength(2)
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents),
    )
    .toContain('stop:2')
  await page.locator('#tour-title').locator('..').locator('button').last().tap()
  await expect.poll(() => requests.length).toBe(3)
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents),
    )
    .toContain('play:3')
  await page.locator('#tour-title').locator('..').locator('button').first().tap()
  await expect(page.locator('#tour-title')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents),
    )
    .toContain('stop:3')
  expect(await page.evaluate(() => localStorage.getItem('chalkboard.tour.narration'))).toBe('true')
  await page.reload({ waitUntil: 'domcontentloaded' })
  expect(requests).toHaveLength(3)
  await openTour()
  await expect(speaker).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => requests.length).toBe(4)
  await speaker.tap()
  const before = requests.length
  await page.locator('#tour-title').locator('..').locator('button').last().tap()
  // The seeded order is presented without a narration request until narration is enabled again.
  await expect(page.locator('#tour-title')).toContainText('Tea dust')
  await expect(page.locator('[data-tour="feature"]')).toContainText('Tea dust')
  expect(requests).toHaveLength(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'output/playwright/tour-narration-hi-390.png' })
  // Walk the rest of the story and the spotlights to the feature stops, without importing or
  // publishing.
  for (let i = 0; i < 10; i++)
    await page.locator('#tour-title').locator('..').locator('button').last().tap()
  await expect(page.locator('[data-tour="feature"] #import-panel')).toBeVisible()
  await page.locator('#tour-title').locator('..').locator('button').last().tap()
  await expect(page.locator('[data-tour="feature"] [data-testid="first-customers"]')).toBeVisible()
  await page.locator('#tour-title').locator('..').locator('button').last().tap()
  await expect(page.locator('[data-tour="feature"]')).toContainText('Lantern Chai Corner (Demo)')
  expect(requests).toHaveLength(before)
  await page.locator('#tour-title').locator('..').locator('button').first().tap()
  for (const step of tourCopy('hi').steps)
    expect(`${step.title} ${step.body}`).not.toMatch(/[A-Za-z]/)
})
