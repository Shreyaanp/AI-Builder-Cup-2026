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
  // The demo plays recorded clips (#356); it never calls /tts.
  const tts: unknown[] = []
  const clips = () =>
    page.evaluate(() =>
      (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents
        .filter((event) => event.startsWith('load:'))
        .map((event) => event.slice(5)),
    )
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
    if (url.pathname.endsWith('/tts')) {
      tts.push(route.request().postDataJSON())
      return route.fulfill({ status: 410, json: {} })
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
      constructor(src: string) {
        events.push(`load:${src}`)
      }
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
  const speaker = page.getByRole('dialog').getByRole('button', { name: tourCopy('hi').narration })
  await expect(speaker).toHaveAttribute('aria-pressed', 'false')
  expect(await clips()).toHaveLength(0)
  await speaker.tap()
  await expect.poll(async () => (await clips()).length).toBe(1)
  // The first spotlight line, recorded in Hindi.
  expect((await clips())[0]).toBe('/audio/demo/hi/step-0.mp3')
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
  // Skip voice stops the line being read and keeps the tour open.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: tourCopy('hi').skipVoice, exact: true })
    .tap()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { tourAudioEvents: string[] }).tourAudioEvents),
    )
    .toContain('stop:1')
  await expect(page.locator('#tour-title')).toBeVisible()
  // The story step carries live numbers, so it has no recording and stays silent rather than
  // falling back to the phone's voice.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: tourCopy('hi').next, exact: true })
    .tap()
  await expect(page.locator('#tour-title')).not.toContainText(tourCopy('hi').steps[0]!.title)
  await page.waitForTimeout(500)
  expect(await clips()).toHaveLength(1)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: tourCopy('hi').close, exact: true })
    .tap()
  await expect(page.locator('#tour-title')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('chalkboard.tour.narration'))).toBe('true')
  // The choice is remembered: the next tour reads its first line again by itself.
  await openTour()
  await expect(speaker).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await clips()).length).toBe(1)
  await speaker.tap()
  const before = (await clips()).length
  await page
    .getByRole('dialog')
    .getByRole('button', { name: tourCopy('hi').next, exact: true })
    .tap()
  // The seeded supply step is presented without a narration request until narration is enabled again.
  await expect(page.locator('#tour-title')).toContainText('Tea dust')
  // OB-51: no preview copy of any screen is ever drawn over the page.
  await expect(page.locator('[data-tour="feature"]')).toHaveCount(0)
  expect(await clips()).toHaveLength(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'output/playwright/tour-narration-hi-390.png' })
  await page
    .getByRole('dialog')
    .getByRole('button', { name: tourCopy('hi').close, exact: true })
    .tap()
  expect(tts).toEqual([])
  for (const step of tourCopy('hi').steps)
    expect(`${step.title} ${step.body}`).not.toMatch(/[A-Za-z]/)
})
