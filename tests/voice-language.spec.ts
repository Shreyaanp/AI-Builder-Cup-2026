import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

// The Live voice speaks the app's language: every voice socket says which one (the model guessed
// from the audio before and answered a Hindi owner in Bhojpuri), and when the owner asks the
// coach for another language the app's own setting follows. Socket fixture; no model is called.
test.use({ reducedMotion: 'reduce' })

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

/** Every Live socket the app opens, ready at once. */
async function liveFixture(page: Page) {
  const sockets: { url: URL; route: WebSocketRoute }[] = []
  await page.routeWebSocket('**/api/v1/voice*', (route) => {
    sockets.push({ url: new URL(route.url()), route })
    route.send(JSON.stringify({ kind: 'ready', session_id: 'fixture-lang', mode: 'gemini' }))
  })
  return sockets
}

test('voice sockets carry the app language, and "speak Hindi" switches the app to Hindi', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await openCoach(page)
  const sockets = await liveFixture(page)
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible()
  expect(sockets).toHaveLength(1)
  expect(sockets[0]!.url.searchParams.get('lang')).toBe('en')

  // The owner said "Hindi mein bolo": the coach called set_reply_language.
  await page.getByRole('button', { name: 'Finish speaking' }).click()
  const live = sockets[0]!.route
  live.send(JSON.stringify({ kind: 'action', data: { target: 'language', language: 'hi' } }))
  live.send(
    JSON.stringify({ kind: 'output_transcript', text: 'ठीक है, अब हिंदी में बात करते हैं।' }),
  )
  live.send(JSON.stringify({ kind: 'turn_complete' }))

  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('chalkboard.owner.preferences') ?? '{}').language,
    ),
  ).toBe('hi')

  // The next voice session asks for Hindi.
  const talk = page.getByRole('button', { name: 'बोलने के लिए दबाएँ', exact: true })
  await expect(talk).toBeEnabled({ timeout: 10_000 })
  await talk.click()
  await expect.poll(() => sockets.length).toBe(2)
  expect(sockets[1]!.url.searchParams.get('lang')).toBe('hi')
})
