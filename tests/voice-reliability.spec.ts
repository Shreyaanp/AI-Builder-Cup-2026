import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// Owner report (17 Oct, Hindi): "connection lost", the same question asked again, the flow stuck.
// Offline backend; the Live socket is proxied so the test can play the owner's answers straight
// to the server, drop a reply in flight and kill the socket like a phone losing its network.
test.use({ reducedMotion: 'reduce' })
test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

async function quietMicrophone(page: Page) {
  await page.context().grantPermissions(['microphone'])
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      const tone = audio.createOscillator()
      const quiet = audio.createGain()
      quiet.gain.value = 0
      tone.connect(quiet).connect(destination)
      tone.start()
      return destination.stream
    }
  })
}

type Socket = { url: URL; route: WebSocketRoute; server: WebSocketRoute; received: string[] }
type Live = { sockets: Socket[]; drop: boolean }

/** Proxies every Live socket to the offline server and records what the server sent. */
async function proxyLive(page: Page): Promise<Live> {
  const live: Live = { sockets: [], drop: false }
  await page.routeWebSocket('**/api/v1/voice*', (route) => {
    const server = route.connectToServer()
    const socket: Socket = { url: new URL(route.url()), route, server, received: [] }
    live.sockets.push(socket)
    server.onMessage((message) => {
      if (typeof message === 'string') socket.received.push(message)
      // A dropped network: what the server says never reaches the phone.
      if (!live.drop) route.send(message)
    })
  })
  return live
}

/** The owner says something in the live conversation; resolves when the coach has answered. */
async function owner(socket: Socket, text: string) {
  const before = socket.received.filter((m) => m.includes('"turn_complete"')).length
  socket.server.send(JSON.stringify({ kind: 'text', text }))
  await expect
    .poll(() => socket.received.filter((m) => m.includes('"turn_complete"')).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(before)
  const replies = socket.received
    .map((m) => JSON.parse(m) as { kind: string; text?: string })
    .filter((e) => e.kind === 'reply')
  return replies.at(-1)?.text ?? ''
}

/** Opens the new-shop flow with the app in Hindi. */
async function hindiFlow(page: Page) {
  await enter(page)
  const copy = await page.evaluate(async () => {
    const flow = (await import('/src/features/v1/newShopCopy.ts' as string)) as {
      newShopCopyFor: (l: string) => { begin: string }
    }
    const translations = (await import('/src/features/v1/locales/index.ts' as string)) as {
      translations: Record<string, { addShop: string; continuePreview: string }>
    }
    const voice = (await import('/src/features/v1/voiceModeCopy.ts' as string)) as {
      voiceModeCopyFor: (l: string) => Record<string, string>
    }
    return {
      ...translations.translations.hi!,
      begin: flow.newShopCopyFor('hi').begin,
      ...voice.voiceModeCopyFor('hi'),
    } as Record<string, string>
  })
  await page.evaluate(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await page.reload()
  await page.getByRole('button', { name: copy.continuePreview! }).click()
  await page.getByRole('banner').getByRole('button', { name: copy.addShop! }).click()
  await page.getByRole('button', { name: copy.begin! }).click()
  return copy
}

const ASKED = {
  name: 'What is your business called?',
  kind: 'What kind of business do you run?',
  place: 'Where is your shop?',
  hours: 'What are your opening hours?',
}

test('Hindi: the socket dies right after an answer is saved; voice resumes at the next field', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  await hindiFlow(page)
  const log = page.getByRole('log')
  await expect(log).toContainText(ASKED.name, { timeout: 20_000 })
  const first = live.sockets[0]!
  expect(first.url.searchParams.get('lang')).toBe('hi')

  expect(await owner(first, 'name: शर्मा चाय')).toContain(ASKED.kind)
  expect(await owner(first, 'category: चाय की दुकान')).toContain(ASKED.place)
  const card = page.getByTestId('shop-so-far')
  await expect(card).toContainText('शर्मा चाय')

  // The owner answers; the server saves it, but the network drops before the phone hears back.
  live.drop = true
  expect(await owner(first, 'location: लाजपत नगर')).toContain(ASKED.hours)
  await expect(card).not.toContainText('लाजपत नगर')
  first.route.close({ code: 4000, reason: 'Connection interrupted' })
  live.drop = false

  // The app reconnects by itself to the same conversation: no alert, no 409, no dead end.
  await expect.poll(() => live.sockets.length, { timeout: 20_000 }).toBe(2)
  const second = live.sockets[1]!
  const sid = JSON.parse(first.received.find((m) => m.includes('"ready"'))!).session_id
  expect(second.url.searchParams.get('session_id')).toBe(sid)
  await expect.poll(() => second.received.some((m) => m.includes('"ready"'))).toBe(true)
  expect(second.received.join('\n')).not.toContain('AUTH_OR_SESSION_ERROR')
  // The saved answer comes back to the screen.
  await expect(card).toContainText('लाजपत नगर')
  await expect(page.getByTestId('voice-alert')).toHaveCount(0)

  // The conversation carries on from the next missing field: nothing already answered again.
  const next = await owner(second, 'मुझे नहीं पता।')
  for (const done of [ASKED.name, ASKED.kind, ASKED.place]) expect(next).not.toContain(done)
  const said = await log.innerText()
  for (const question of [ASKED.name, ASKED.kind, ASKED.place])
    expect(said.split(question).length - 1, question).toBeLessThanOrEqual(1)
})

test('Hindi: a long onboarding (16 turns) stays on one socket and never drops', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  await hindiFlow(page)
  await expect(page.getByRole('log')).toContainText(ASKED.name, { timeout: 20_000 })
  const socket = live.sockets[0]!
  const turns = [
    'name: शर्मा चाय',
    'category: चाय की दुकान',
    'location: लाजपत नगर',
    'hours: सुबह 7 से रात 9',
    'payment: UPI, cash',
    'delivery: none',
    ...Array.from({ length: 10 }, () => 'मुझे नहीं पता।'),
  ]
  for (const text of turns) await owner(socket, text)
  expect(live.sockets).toHaveLength(1)
  expect(socket.received.join('\n')).not.toContain('"kind":"error"')
  await expect(page.getByTestId('voice-alert')).toHaveCount(0)
  await expect(page.getByTestId('voice-orb').first()).not.toHaveAttribute(
    'data-phase',
    'reconnecting',
  )
  await expect(page.getByTestId('shop-so-far')).toContainText('लाजपत नगर')
})
