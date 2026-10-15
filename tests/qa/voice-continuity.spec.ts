import { test, expect, enter, say, voiceFixture, audit } from './support.js'
import type { Page } from '@playwright/test'

async function speak(page: Page) {
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  await page.getByRole('button', { name: 'Finish speaking', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Press to talk', exact: true })).toBeVisible()
}

// Generated audio exercises capture. Replace audio_end with fixture text on the real offline
// socket so ADK persistence and reload are exercised without claiming speech recognition.
async function persistentVoiceFixture(page: Page, sessions: (string | null)[]) {
  await voiceFixture(page)
  await page.routeWebSocket('**/api/v1/voice*', (socket) => {
    sessions.push(new URL(socket.url()).searchParams.get('session_id'))
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string' && JSON.parse(message).kind === 'audio_end') {
        socket.send(
          JSON.stringify({ kind: 'input_transcript', text: 'Offline voice fixture note' }),
        )
        server.send(JSON.stringify({ kind: 'text', text: 'Offline voice fixture note' }))
      } else server.send(message)
    })
  })
}

for (const restored of [false, true]) {
  test(`mic continues the ${restored ? 'restored' : 'open'} text conversation across presses`, async ({
    page,
  }) => {
    const sessions: (string | null)[] = []
    await persistentVoiceFixture(page, sessions)
    await enter(page)
    await say(page, 'Help me plan today')
    await expect(page.getByRole('log')).toContainText('scripted reply')
    const [conversation] = await (await page.request.get('/api/v1/conversations')).json()
    if (restored) {
      await page.reload()
      await page.getByRole('button', { name: 'Continue local preview' }).click()
      await expect(page.getByRole('log')).toContainText('Help me plan today')
    }
    await speak(page)
    await speak(page)
    expect(sessions).toEqual([conversation.session_id, conversation.session_id])
    expect(await (await page.request.get('/api/v1/conversations')).json()).toHaveLength(1)
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await expect(
      page.getByRole('log').getByText('Offline voice fixture note', { exact: true }),
    ).toHaveCount(2)
    const sent = page.waitForRequest(
      (request) => request.url().endsWith('/coach/stream') && request.method() === 'POST',
    )
    await say(page, 'Continue with text')
    expect((await sent).postDataJSON().session_id).toBe(conversation.session_id)
    await expect(page.getByRole('button', { name: 'Stop reply', exact: true })).toHaveCount(0)
  })
}

test('first mic creates a session and subsequent mic presses reuse it', async ({ page }) => {
  const sessions: (string | null)[] = []
  await persistentVoiceFixture(page, sessions)
  await enter(page)
  await speak(page)
  const [conversation] = await (await page.request.get('/api/v1/conversations')).json()
  await speak(page)
  expect(sessions).toEqual([null, conversation.session_id])
  expect(await (await page.request.get('/api/v1/conversations')).json()).toHaveLength(1)
})

test('mic waits for saved conversation restoration before connecting', async ({ page }) => {
  const sessions: (string | null)[] = []
  await persistentVoiceFixture(page, sessions)
  await enter(page)
  await say(page, 'Help me plan today')
  await expect(page.getByRole('log')).toContainText('scripted reply')
  const [conversation] = await (await page.request.get('/api/v1/conversations')).json()
  let release = () => {}
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/conversations/${conversation.session_id}`, async (route) => {
    await hold
    await route.continue()
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const mic = page.getByRole('button', { name: 'Press to talk', exact: true })
  await expect(mic).toBeDisabled()
  release()
  await expect(mic).toBeEnabled()
  await speak(page)
  expect(sessions).toEqual([conversation.session_id])
})

for (const appearance of ['light', 'dark']) {
  test(`voice error remains readable in ${appearance} theme`, async ({ page }) => {
    await page.addInitScript((appearance) => {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ appearance, language: 'en' }),
      )
    }, appearance)
    await voiceFixture(page)
    await page.routeWebSocket('**/api/v1/voice*', (socket) => {
      socket.send(
        JSON.stringify({ kind: 'error', code: 'RATE_LIMITED', data: { retry_after: 137 } }),
      )
    })
    await enter(page)
    await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Wait 137 seconds')
    await audit(page)
    await page.screenshot({ path: test.info().outputPath(`voice-error-${appearance}.png`) })
  })
}

for (const locale of [
  'en',
  'hi',
  'bn',
  'te',
  'mr',
  'kn',
  'zh-Hans',
  'ms',
  'ta',
  'ja',
  'ko',
  'id',
  'th',
  'vi',
  'fil',
]) {
  test(`voice recovery is visible and actionable in ${locale}`, async ({ page }) => {
    await voiceFixture(page)
    await enter(page)
    const copy = await page.evaluate(async (locale) => {
      // Read the localized expectations through Vite, keeping the browser modules out of
      // the Node test compilation and checking that the UI uses the selected locale.
      const source = '/src/features/v1/strings.ts'
      const locales = '/src/features/v1/locales/index.ts'
      const { en } = await import(source)
      const { translations } = await import(locales)
      const copy = locale === 'en' ? en : translations[locale]
      return {
        talk: copy.talk as string,
        continuePreview: copy.continuePreview as string,
        voiceMicDenied: copy.voiceMicDenied as string,
        voiceFailed: copy.voiceFailed as string,
        voiceRateLimited: copy.voiceRateLimited(137) as string,
      }
    }, locale)
    await page.evaluate((language) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
    }, locale)
    await page.reload()
    await page.getByRole('button', { name: copy.continuePreview }).click()
    const mic = page.getByRole('button', { name: copy.talk, exact: true })
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Fixture permission denial', 'NotAllowedError')
      }
    })
    await mic.click()
    await expect(page.getByRole('alert')).toHaveText(copy.voiceMicDenied)
    await expect(mic).toBeEnabled()
    await page.routeWebSocket('**/api/v1/voice*', (socket) => {
      socket.send(
        JSON.stringify({ kind: 'error', code: 'RATE_LIMITED', data: { retry_after: 137 } }),
      )
    })
    await mic.click()
    await expect(page.getByRole('alert')).toHaveText(copy.voiceRateLimited)
    await expect(mic).toBeEnabled()
    // A rejected/closed connection stays visible and offers retry or text in this locale.
    await page.routeWebSocket('**/api/v1/voice*', (socket) => socket.close({ code: 1008 }))
    await mic.click()
    await expect(page.getByRole('alert')).toHaveText(copy.voiceFailed)
    await expect(mic).toBeEnabled()
    await audit(page)
  })
}

test('rollover is announced in chat and the next mic uses the new session', async ({ page }) => {
  await voiceFixture(page)
  await enter(page)
  await say(page, 'Help me plan today')
  await expect(page.getByRole('log')).toContainText('scripted reply')
  const response = await page.request.post('/api/v1/coach/stream', {
    data: { message: 'Rollover fixture' },
  })
  const ready = (await response.text()).split('\n').find((line) => line.startsWith('data: '))!
  const next = JSON.parse(ready.slice(6)).session_id as string
  const sessions: (string | null)[] = []
  await page.routeWebSocket('**/api/v1/voice*', (socket) => {
    sessions.push(new URL(socket.url()).searchParams.get('session_id'))
    socket.send(
      JSON.stringify({
        kind: 'ready',
        session_id: next,
        code: 'CONVERSATION_ROLLED_OVER',
        mode: 'offline',
      }),
    )
    socket.onMessage((message) => {
      if (typeof message === 'string' && JSON.parse(message).kind === 'audio_end')
        socket.send(JSON.stringify({ kind: 'turn_complete' }))
    })
  })
  await speak(page)
  await expect(page.getByRole('log')).toContainText(
    'This conversation is full. I started a new conversation so we can continue.',
  )
  await speak(page)
  expect(sessions[1]).toBe(next)
})
