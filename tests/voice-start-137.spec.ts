import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

// #137: in the shop chat the owner spoke and nothing showed. The server now ends a turn only once
// the coach has spoken (a tool-only turn is not passed on); here the app's half of that contract:
// press-to-talk shows what the owner said, the tool's card and the reply, all in the chat.

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

test('press-to-talk in the shop chat shows what the owner said and the reply', async ({ page }) => {
  test.setTimeout(60_000)
  await openCoach(page)
  let socket: WebSocketRoute | null = null
  const frames: string[] = []
  await page.routeWebSocket('**/api/v1/voice*', (route) => {
    socket = route
    route.onMessage((message) => {
      if (typeof message === 'string') frames.push(message)
    })
    route.send(JSON.stringify({ kind: 'ready', session_id: 'fixture-137', mode: 'gemini' }))
  })
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  const finish = page.getByRole('button', { name: 'Finish speaking' })
  await expect(finish).toBeVisible()
  await finish.click()
  await expect.poll(() => frames.some((frame) => frame.includes('audio_end'))).toBe(true)

  // As the server sends it now: the owner's words, the tool's result, then the spoken reply and
  // one turn_complete (the tool-only turn_complete before the words no longer reaches the app).
  socket!.send(
    JSON.stringify({ kind: 'input_transcript', text: 'Add masala chai, 15 rupees a cup.' }),
  )
  socket!.send(
    JSON.stringify({ kind: 'output_transcript', text: 'Added masala chai at 15 rupees.' }),
  )
  socket!.send(JSON.stringify({ kind: 'turn_complete' }))

  const log = page.getByRole('log')
  await expect(log).toContainText('Add masala chai, 15 rupees a cup.')
  await expect(log).toContainText('Added masala chai at 15 rupees.', { timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Press to talk', exact: true })).toBeVisible()
})
