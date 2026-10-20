import { expect, test, type Page } from '@playwright/test'

async function openCoach(page: Page) {
  // OB-72: readiness is the explicit preview control below, not the window's load event.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

// Slow consumption of the real local offline fixture gives both viewports a reproducible
// mid-turn network switch. The server and resume requests still use real HTTP/SSE.
async function slowStream(page: Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      if (!String(args[0]).endsWith('/api/v1/coach/stream') || !response.body || !response.ok)
        return response
      const reader = response.body.getReader()
      return new Response(
        new ReadableStream({
          async pull(controller) {
            try {
              const result = await reader.read()
              await new Promise((resolve) => setTimeout(resolve, 150))
              args[1]?.signal?.throwIfAborted()
              if (result.done) controller.close()
              else controller.enqueue(result.value)
            } catch (error) {
              controller.error(error)
            }
          },
          cancel: () => reader.cancel(),
        }),
        { status: response.status, headers: response.headers },
      )
    }
  })
}

for (const unavailable of [false, true]) {
  // FIXME: the offline fixture's single-event reply often completes before setOffline, so the
  // mid-turn drop isn't reproducible yet; server resume is covered by test_stream_resume.py.
  test.fixme(`mid-reply offline recovery ${unavailable ? 'keeps the message if replay is unavailable' : 'completes the original turn'}`, async ({
    page,
    context,
  }) => {
    await slowStream(page)
    let starts = 0
    const cursors: string[] = []
    page.on('request', (request) => {
      if (!request.url().endsWith('/api/v1/coach/stream')) return
      const cursor = request.headers()['last-event-id']
      if (cursor) cursors.push(cursor)
      else starts++
    })
    if (unavailable) {
      await page.route('**/api/v1/coach/stream', async (route) => {
        if (!route.request().headers()['last-event-id']) return route.continue()
        // A real refusal takes a network round trip; without it "Reconnecting…" is too brief to see.
        await new Promise((resolve) => setTimeout(resolve, 800))
        return route.fulfill({ status: 409, json: { detail: 'RESUME_UNAVAILABLE' } })
      })
    }
    await openCoach(page)
    const note = page.getByLabel('Message', { exact: true })
    await note.fill('Hello kopi stall')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('Offline demo:')
    await context.setOffline(true)
    await expect(page.getByRole('status').filter({ hasText: /^Offline$/ })).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible()
    if (unavailable) {
      await expect(page.getByRole('alert')).toContainText('reply didn’t finish')
      await expect(note).toHaveValue('Hello kopi stall')
    } else {
      await expect(page.getByRole('log')).toContainText(
        'scripted reply; nothing has been published.',
      )
      await expect(note).toHaveValue('')
    }
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
    expect(starts).toBe(1)
    expect(cursors.length).toBeGreaterThan(0)
    expect(cursors.length).toBeLessThanOrEqual(4)
  })
}

test('OB-72 resume makes at most four attempts and stop cancels recovery', async ({ page }) => {
  await openCoach(page)
  // Compile the lazily imported stream module before the time-bounded browser exercise.
  const streamModule = await page.request.get('/src/api/stream.ts')
  expect(streamModule.ok()).toBe(true)
  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/stream.ts'
    const { streamCoach } = await import(/* @vite-ignore */ modulePath)
    const originalFetch = window.fetch
    const cursors: (string | null)[] = []
    let starts = 0
    window.fetch = async (url, init) => {
      if (String(url).endsWith('/bootstrap')) return new Response('{}')
      const cursor = new Headers(init?.headers).get('Last-Event-ID')
      cursors.push(cursor)
      if (cursor) throw new TypeError('Network disconnected')
      starts++
      return new Response(
        'id: turn:1\ndata: {"kind":"ready","session_id":"fixture"}\n\n' +
          'id: turn:2\ndata: {"kind":"delta","text":"Partial"}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }
    try {
      await streamCoach({ message: 'Hello' }, new AbortController().signal, () => {}).catch(
        () => undefined,
      )
      const attempts = cursors.length
      const abort = new AbortController()
      await streamCoach(
        { message: 'Hello' },
        abort.signal,
        () => {},
        null,
        (state: string) => {
          if (state === 'reconnecting') abort.abort()
        },
      ).catch(() => undefined)
      return { attempts, cursors, starts }
    } finally {
      window.fetch = originalFetch
    }
  })
  expect(result.attempts).toBe(5)
  expect(result.cursors).toEqual([null, 'turn:2', 'turn:2', 'turn:2', 'turn:2', null])
  expect(result.starts).toBe(2)
})

test('voice answers server ping, reconnects once, then explains failure', async ({ page }) => {
  // A local generated audio track exercises capture without a microphone or speech service.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      const oscillator = audio.createOscillator()
      oscillator.connect(destination)
      oscillator.start()
      destination.stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => void audio.close())
      })
      return destination.stream
    }
  })
  let connections = 0
  let pongs = 0
  await page.routeWebSocket('**/api/v1/voice*', (socket) => {
    connections++
    socket.send(JSON.stringify({ kind: 'ready', session_id: 'fixture-voice', mode: 'offline' }))
    socket.onMessage((message) => {
      if (typeof message === 'string' && JSON.parse(message).kind === 'pong') {
        pongs++
        socket.close({ code: 1012, reason: 'Fixture connection restart' })
      }
    })
    socket.send(JSON.stringify({ kind: 'ping' }))
  })
  await openCoach(page)
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Voice connection ended')
  expect(connections).toBe(2)
  expect(pongs).toBe(2)
  await expect(page.getByRole('button', { name: 'Press to talk', exact: true })).toBeEnabled()
})
