import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { SpeechTimeline, snapToSentence, snapToWord } from '../src/features/v1/speechReveal.js'

// Voice and visuals in step: the coach's words appear as they are spoken, the cards a reply
// refers to appear when the voice reaches them, and a barge-in stops the voice and the words
// together. The Live socket is a fixture that plays real PCM audio with its transcript.

test.describe('speech timeline (unit)', () => {
  test('words follow the audio queue, not the transcript arrival', () => {
    const line = new SpeechTimeline()
    // 40 characters arrive at t=0 with 2 s of audio queued: spoken at 20 chars/s.
    line.update('Sales were steady this week, thank you.', 0, 2000)
    expect(line.spoken(0)).toBe(0)
    expect(line.spoken(1000)).toBeGreaterThanOrEqual(18)
    expect(line.spoken(1000)).toBeLessThanOrEqual(21)
    expect(line.spoken(2000)).toBe(line.text.length)
    // Whole words only; reduced motion reveals whole sentences only.
    expect(line.visible(1000)).toBe(snapToWord(line.text, line.spoken(1000)))
    expect(line.text[line.visible(1000)]).toBe(' ')
    expect(line.visible(1000, true)).toBe(0)
    expect(line.visible(2000, true)).toBe(line.text.length)
  })

  test('a piece that arrives while speaking queues after the words before it', () => {
    const line = new SpeechTimeline()
    line.update('One two three.', 0, 1000)
    line.update('One two three. Four five six.', 200, 1800)
    expect(line.spoken(1000)).toBe('One two three.'.length)
    expect(line.spoken(2000)).toBe(line.text.length)
  })

  test('without audio the words come at a speaking rate, and a silent turn completes at once', () => {
    const line = new SpeechTimeline()
    line.update('x'.repeat(30), 0, null)
    expect(line.spoken(1000)).toBe(15)
    line.finish(1000)
    expect(line.done(1000)).toBe(true)
  })

  test('words that came before their audio follow it once it is queued', () => {
    const line = new SpeechTimeline()
    line.update('x'.repeat(40), 0, null)
    line.sync(100, 4000)
    // 38 characters left over 4 s, not the 2.7 s a speaking rate would take.
    expect(line.spoken(2100)).toBeGreaterThanOrEqual(19)
    expect(line.spoken(2100)).toBeLessThanOrEqual(22)
    expect(line.spoken(4100)).toBe(40)
  })

  test('a card shows when the voice reaches it or names it', () => {
    const line = new SpeechTimeline()
    const shown: string[] = []
    line.update('Here is your week.', 0, 1000)
    line.cue(() => shown.push('chart'))
    line.cue(() => shown.push('shop'), ['Katong Kopi'])
    line.update('Here is your week. Sales rose. Katong Kopi is ready.', 100, 3000)
    line.release(900)
    expect(shown).toEqual([])
    // The voice moved past where the chart arrived: it is talking about it.
    line.release(1500)
    expect(shown).toEqual(['chart'])
    // The shop card waits for its name.
    line.release(2000)
    expect(shown).toEqual(['chart'])
    line.release(2700)
    expect(shown).toEqual(['chart', 'shop'])
  })

  test('a barge-in keeps only what was said', () => {
    const line = new SpeechTimeline()
    line.update('First part here. Second part never said.', 0, 2000)
    const said = line.cut(800)
    expect('First part here. Second part never said.'.startsWith(said)).toBe(true)
    expect(said.length).toBeLessThan(20)
    expect(line.active).toBe(false)
  })

  test('snapping never splits a word; scripts without spaces reveal by character', () => {
    expect(snapToWord('hello world', 8)).toBe(5)
    expect(snapToWord('今日はいい天気ですね', 4)).toBe(4)
    expect(snapToSentence('One. Two three.', 9)).toBe(4)
    expect(snapToSentence('வணக்கம். நன்றி', 12)).toBe(8)
  })
})

// --- In the app ---------------------------------------------------------------------------

async function openCoach(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
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
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

/** Seconds of the coach's voice as Live sends it (24 kHz PCM16). */
function coachAudio(seconds: number) {
  const rate = 24000
  const pcm = Buffer.alloc(Math.floor(rate * seconds) * 2)
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 8000), i * 2)
  return pcm
}

/** A Live socket fixture: ready at once, then whatever the test plays into it. */
async function liveFixture(page: Page) {
  let socket: WebSocketRoute | null = null
  await page.routeWebSocket('**/api/v1/voice*', (route) => {
    socket = route
    route.send(JSON.stringify({ kind: 'ready', session_id: 'fixture-sync', mode: 'gemini' }))
  })
  return {
    send: (message: object | Buffer) =>
      socket!.send(Buffer.isBuffer(message) ? message : JSON.stringify(message)),
  }
}

/** Every change to the conversation, with its time since the coach began (ms). */
async function recordLog(page: Page) {
  await page.evaluate(() => {
    const frames: { at: number; text: string; figures: number }[] = []
    ;(window as unknown as { frames_: typeof frames }).frames_ = frames
    // The log appears with the first message: watch the page, read the log.
    const take = () => {
      const log = document.querySelector('[role="log"]')
      const text = log?.textContent ?? ''
      if (text === frames.at(-1)?.text) return
      frames.push({
        at: performance.now(),
        text,
        figures: log?.querySelectorAll('[role="figure"]').length ?? 0,
      })
    }
    new MutationObserver(take).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  })
}

async function frames(page: Page) {
  const all = await page.evaluate(
    () =>
      (window as unknown as { frames_: { at: number; text: string; figures: number }[] }).frames_,
  )
  const start = all.find((frame) => frame.text.includes('Sales'))?.at ?? 0
  return all.map((frame) => ({ ...frame, at: frame.at - start }))
}

const FIRST = 'Sales were steady this week.'
const SECOND = ' Friday was your best day, thanks to the kopi rush.'
const WEEK = {
  type: 'insights',
  currency: 'SGD',
  revenue: 128000,
  previous_revenue: 120000,
  change_percent: 7,
  daily: [
    { date: '2026-10-10', revenue: 15000 },
    { date: '2026-10-11', revenue: 17000 },
    { date: '2026-10-12', revenue: 16000 },
    { date: '2026-10-13', revenue: 21000 },
    { date: '2026-10-14', revenue: 18000 },
    { date: '2026-10-15', revenue: 26000 },
    { date: '2026-10-16', revenue: 15000 },
  ],
  top: [{ item: 'Kopi', quantity: 120, revenue: 21600 }],
  slow: [],
  sold_out_count: 0,
}

test('the reply is revealed in step with its voice, and its chart when the voice reaches it', async ({
  page,
}, info) => {
  test.setTimeout(60_000)
  await openCoach(page)
  const live = await liveFixture(page)
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible()
  await recordLog(page)

  // As Live sends it: each piece of audio, then its transcript; the chart between sentences.
  live.send(coachAudio(1.4))
  live.send({ kind: 'output_transcript', text: FIRST })
  live.send({ kind: 'chart', data: WEEK })
  live.send(coachAudio(2.6))
  live.send({ kind: 'output_transcript', text: SECOND })
  live.send({ kind: 'turn_complete' })

  const log = page.getByRole('log')
  // Mid-sentence evidence: only the words said so far are on screen.
  await expect(log).toContainText('Sales were')
  await page.screenshot({ path: `docs/stories/sync-mid-${info.project.name}.png` })
  await expect(log).toContainText('kopi rush.', { timeout: 10_000 })
  await expect(log.getByRole('figure')).toHaveCount(1)
  const seen = await frames(page)
  const when = (test: (frame: (typeof seen)[number]) => boolean) =>
    seen.find(test)?.at ?? Number.NaN
  const firstSaid = when((frame) => frame.text.includes(FIRST))
  const chart = when((frame) => frame.figures > 0)
  const lastSaid = when((frame) => frame.text.includes('kopi rush.'))
  const timing = { firstSaid, chart, lastSaid }
  await info.attach('timing.json', {
    body: JSON.stringify(timing),
    contentType: 'application/json',
  })

  // Not all at once: the first sentence takes about its 1.4 s of voice…
  expect(firstSaid).toBeGreaterThan(800)
  expect(firstSaid).toBeLessThan(2600)
  // …the chart appears when the voice moves on to it (never before the first sentence)…
  expect(chart).toBeGreaterThanOrEqual(firstSaid)
  expect(chart).toBeLessThan(firstSaid + 1500)
  // …and the last words land with the end of the 4 s of audio.
  expect(lastSaid).toBeGreaterThan(3000)
  expect(lastSaid).toBeLessThan(6500)
  // Words appear whole: no frame before the chart shows a cut word.
  for (const frame of seen.filter((frame) => frame.figures === 0)) {
    const coach = frame.text.slice(frame.text.indexOf('Sales'))
    if (frame.text.includes('Sales')) expect(`${FIRST}${SECOND}`).toContain(coach.trim())
  }

  // In the chat: what was said before the chart, the chart, then the rest.
  const items = await log.locator('li').allTextContents()
  const first = items.findIndex((text) => text.includes(FIRST))
  const chartAt = items.findIndex((text) => text.includes('Top sellers'))
  const second = items.findIndex((text) => text.includes('kopi rush.'))
  expect(first).toBeGreaterThanOrEqual(0)
  expect(items[first]).not.toContain('Friday')
  expect(chartAt).toBeGreaterThan(first)
  expect(second).toBeGreaterThan(chartAt)
  expect(items[second]).toContain('Friday was your best day')
  await page.screenshot({
    path: `docs/stories/sync-chart-${info.project.name}.png`,
    fullPage: false,
  })
})

test('a barge-in stops the voice and the words together', async ({ page }) => {
  test.setTimeout(60_000)
  await openCoach(page)
  const live = await liveFixture(page)
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible()
  await recordLog(page)

  const reply =
    'Sales were steady this week. Friday was your best day, and the kopi rush started early.'
  live.send(coachAudio(4.5))
  live.send({ kind: 'output_transcript', text: reply })
  const log = page.getByRole('log')
  await expect(log).toContainText('Sales were', { timeout: 5_000 })
  await page.waitForTimeout(900)
  // The owner talks over the coach.
  live.send({ kind: 'interrupted' })
  live.send({ kind: 'input_transcript', text: 'What about Saturday?' })
  await expect(log).toContainText('What about Saturday?')
  const atCut = await log.textContent()
  await page.waitForTimeout(1500)
  const later = await log.textContent()
  // Nothing more of the reply appears after the interruption…
  expect(later).toBe(atCut)
  expect(later).not.toContain('started early.')
  // …and what was said stays, above what the owner said.
  expect(later!.indexOf('Sales were')).toBeLessThan(later!.indexOf('What about Saturday?'))
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('reveals whole sentences, never word by word', async ({ page }, info) => {
    test.setTimeout(60_000)
    await openCoach(page)
    const live = await liveFixture(page)
    await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible()
    await recordLog(page)
    live.send(coachAudio(3))
    live.send({
      kind: 'output_transcript',
      text: 'Sales are good today. Kaya toast sold out at noon.',
    })
    live.send({ kind: 'turn_complete' })
    const log = page.getByRole('log')
    await expect(log).toContainText('sold out at noon.', { timeout: 10_000 })
    const seen = await frames(page)
    for (const frame of seen) {
      if (frame.text.includes('Sales')) expect(frame.text).toContain('Sales are good today.')
      if (frame.text.includes('Kaya')) expect(frame.text).toContain('sold out at noon.')
    }
    // The first sentence came first, the second later (still in step with the voice).
    const one = seen.find((frame) => frame.text.includes('today.'))!.at
    const two = seen.find((frame) => frame.text.includes('noon.'))!.at
    expect(two - one).toBeGreaterThan(600)
    await page.screenshot({ path: `docs/stories/sync-reduced-${info.project.name}.png` })
  })
})
