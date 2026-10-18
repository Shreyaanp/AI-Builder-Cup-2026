import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import {
  ASKED_HI as ASKED,
  askedTopics,
  FIRST_QUESTION_HI as FIRST_QUESTION,
  FOLLOW_UPS_HI,
  nextQuestion,
} from './newShopTopics.js'
import { enter, localOnly } from './stories/support.js'

// Owner report (17 Oct, Hindi): "connection lost", the same question asked again, the flow stuck,
// and "thinking" that never ends. Offline backend; the Live socket is proxied so the test can
// play the owner's answers straight to the server, drop replies in flight and kill the socket
// like a phone losing its network.
test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true })
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

const completed = (socket: Socket) =>
  socket.received.filter((m) => m.includes('"turn_complete"')).length

/** The owner says something in the live conversation; resolves when the coach has answered. */
async function owner(socket: Socket, text: string) {
  const before = completed(socket)
  socket.server.send(JSON.stringify({ kind: 'text', text }))
  await expect
    .poll(() => completed(socket), {
      timeout: 30_000,
      message: `no answer to "${text}"; last: ${socket.received.slice(-6).join(' | ')}`,
    })
    .toBeGreaterThan(before)
  const replies = socket.received
    .map((m) => JSON.parse(m) as { kind: string; text?: string })
    .filter((e) => e.kind === 'reply')
  return replies.at(-1)?.text ?? ''
}

type Copy = Record<string, string>

/** Opens the new-shop flow with the app in Hindi. */
async function hindiFlow(page: Page): Promise<Copy> {
  await enter(page)
  const copy = await page.evaluate(async () => {
    const flow = (await import('/src/features/v1/newShopCopy.ts' as string)) as {
      newShopCopyFor: (l: string) => { begin: string }
    }
    const locales = (await import('/src/features/v1/locales/index.ts' as string)) as {
      loaders: Record<
        string,
        (() => Promise<{ addShop: string; continuePreview: string }>) | undefined
      >
    }
    const voice = (await import('/src/features/v1/voiceModeCopy.ts' as string)) as {
      voiceModeCopyFor: (l: string) => Record<string, string>
    }
    const onboarding = (await import('/src/features/v1/onboardingCopy.ts' as string)) as {
      onboardingCopyFor: (l: string) => Record<string, string>
    }
    return {
      ...(await locales.loaders.hi?.()),
      begin: flow.newShopCopyFor('hi').begin,
      ...voice.voiceModeCopyFor('hi'),
      ...onboarding.onboardingCopyFor('hi'),
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

async function typeTurn(page: Page, copy: Copy, text: string) {
  await page.getByLabel(copy.message!, { exact: true }).fill(text)
  await page.getByRole('button', { name: copy.send!, exact: true }).click()
}

// The offline coach asks what is missing in each owner's own order (no fixed script): after the
// name, the next question is whichever of the kind and the place is left first.
async function askedAfterName(page: Page, count: number) {
  expect(['kind', 'place']).toContain(await nextQuestion(page, count))
}

test('Hindi: the socket dies right after an answer is saved; voice resumes silently at the next field', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  const copy = await hindiFlow(page)
  const log = page.getByRole('log')
  await expect(log).toContainText(FIRST_QUESTION, { timeout: 20_000 })
  const first = live.sockets[0]!
  expect(first.url.searchParams.get('lang')).toBe('hi')

  // One sentence fills two fields; only what is missing is asked next.
  expect(await owner(first, 'name: शर्मा चाय; category: चाय की दुकान')).toContain(ASKED.place)
  const card = page.getByTestId('shop-so-far')
  await expect(card).toContainText('शर्मा चाय')

  // The owner answers; the server saves it (the shop goes live), but the network drops before
  // the phone hears back.
  live.drop = true
  const afterPlace = await owner(first, 'location: लाजपत नगर')
  // #112: after the basics, the tea stall's own follow-up comes first.
  expect(afterPlace).toContain(FOLLOW_UPS_HI.seating)
  await expect(card).not.toContainText('लाजपत नगर')
  first.route.close({ code: 4000, reason: 'Connection interrupted' })
  live.drop = false

  // "Review my shop" works while reconnecting: it opens at once and closes back to the chat.
  await page.getByTestId('review-my-shop').click()
  await expect(page.getByTestId('draft-summary')).toContainText('शर्मा चाय')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('draft-summary')).toHaveCount(0)

  // The app reconnects by itself to the same conversation: no alert, no 409, no dead end.
  await expect.poll(() => live.sockets.length, { timeout: 20_000 }).toBe(2)
  const second = live.sockets[1]!
  const sid = JSON.parse(first.received.find((m) => m.includes('"ready"'))!).session_id
  expect(second.url.searchParams.get('session_id')).toBe(sid)
  await expect.poll(() => second.received.some((m) => m.includes('"ready"'))).toBe(true)
  expect(second.received.join('\n')).not.toContain('AUTH_OR_SESSION_ERROR')
  expect(second.received.join('\n')).not.toContain('"kind":"error"')
  // The saved answer comes back to the screen, with the live shop.
  await expect(card).toContainText('लाजपत नगर')
  await expect(page.getByTestId('shop-live')).toHaveText(copy.live!)
  await expect(page.getByTestId('voice-alert')).toHaveCount(0)
  // Silent resume: the coach does not greet again or repeat its question by itself.
  await page.waitForTimeout(2_000)
  expect(second.received.filter((m) => m.includes('"kind":"reply"'))).toHaveLength(0)

  // The conversation carries on from the next missing field: nothing already answered again.
  const next = await owner(second, 'मुझे नहीं पता।')
  expect(next).toContain(ASKED.hours)
  for (const done of [ASKED.name, ASKED.kind, ASKED.place, FOLLOW_UPS_HI.seating])
    expect(next).not.toContain(done)
  const said = await log.innerText()
  // Every question at most once: an answered (or unknown) one is never asked again.
  for (const question of [...Object.values(ASKED), FOLLOW_UPS_HI.seating])
    expect(said.split(question).length - 1, question).toBeLessThanOrEqual(1)
  expect(said).not.toMatch(/menu|pay|delivery|halal/i)
  // One shop, live for customers.
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
})

test('Hindi: a long onboarding (18 turns) stays on one socket and never drops', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  await hindiFlow(page)
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION, { timeout: 20_000 })
  const socket = live.sockets[0]!
  const turns = [
    'name: शर्मा चाय',
    'category: चाय की दुकान',
    'location: लाजपत नगर',
    'name: शर्मा चाय पॉइंट',
    'hours: सुबह 7 से रात 9',
    'बाद में',
    ...Array.from({ length: 12 }, () => 'मुझे नहीं पता।'),
  ]
  for (const text of turns) await owner(socket, text)
  expect(live.sockets).toHaveLength(1)
  expect(socket.received.join('\n')).not.toContain('"kind":"error"')
  await expect(page.getByTestId('voice-alert')).toHaveCount(0)
  await expect(page.getByTestId('voice-orb').first()).not.toHaveAttribute(
    'data-phase',
    'reconnecting',
  )
  // The correction replaced the name silently; the summary card closed the onboarding.
  await expect(page.getByTestId('shop-so-far')).toContainText('शर्मा चाय पॉइंट')
  await expect(page.getByTestId('shop-summary')).toBeVisible()
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  expect(shops).toHaveLength(1)
  expect(shops[0].fields.name).toBe('शर्मा चाय पॉइंट')
})

test('Hindi: a reply lost mid-turn never leaves the coach thinking; Retry continues', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  const copy = await hindiFlow(page)
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION, { timeout: 20_000 })
  // The owner types while voice is on; the server's whole answer is lost on the way.
  await page.getByRole('button', { name: copy.typeInstead! }).click()
  live.drop = true
  const asked = (await askedTopics(page)).length
  await typeTurn(page, copy, 'name: गुप्ता स्टोर')
  const orb = page.getByTestId('voice-orb').first()
  await expect(orb).toHaveAttribute('data-phase', 'thinking')
  // "Review my shop" opens while the coach is thinking, and closes back to the same step.
  await page.getByTestId('review-my-shop').click()
  await expect(page.getByTestId('draft-summary')).toBeVisible()
  await page.keyboard.press('Escape')
  // Thinking ends by itself (about 12 s without a word): calm message and Retry.
  const stalled = page.getByTestId('turn-stalled')
  await expect(stalled).toContainText(copy.tooSlow!, { timeout: 20_000 })
  await expect(orb).not.toHaveAttribute('data-phase', 'thinking')
  live.drop = false
  await stalled.getByRole('button', { name: copy.retry! }).click()
  await expect(stalled).toHaveCount(0)
  await expect(page.getByTestId('shop-so-far')).toContainText('गुप्ता स्टोर')
  await askedAfterName(page, asked)
})

test('Hindi: the 15-minute cap ends politely: typing works and a tap talks again', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  const copy = await hindiFlow(page)
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION, { timeout: 20_000 })
  const first = live.sockets[0]!
  // The server's cap (simulated): a polite end, not a dropped connection.
  first.route.send(JSON.stringify({ kind: 'error', code: 'SESSION_CAP' }))
  first.route.close({ code: 1000, reason: 'SESSION_CAP' })
  const alert = page.getByTestId('voice-alert')
  await expect(alert).toHaveAttribute('data-problem', 'session-cap')
  await expect(alert).toContainText(copy.capTitle!)
  // No reconnect loop: one socket until the owner asks.
  await page.waitForTimeout(1_500)
  expect(live.sockets).toHaveLength(1)
  // Typing works at once, in the same conversation.
  const asked = (await askedTopics(page)).length
  await typeTurn(page, copy, 'name: वर्मा स्वीट्स')
  await expect(page.getByTestId('shop-so-far')).toContainText('वर्मा स्वीट्स')
  await askedAfterName(page, asked)
  // A tap talks again (the same conversation, no new greeting).
  await alert.getByRole('button', { name: copy.talkAgain! }).click()
  await expect.poll(() => live.sockets.length, { timeout: 20_000 }).toBe(2)
  const sid = JSON.parse(first.received.find((m) => m.includes('"ready"'))!).session_id
  expect(live.sockets[1]!.url.searchParams.get('session_id')).toBe(sid)
})

test('Hindi: "बस" ends the voice conversation: a goodbye, the mic closes, no reconnect', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await quietMicrophone(page)
  const live = await proxyLive(page)
  const copy = await hindiFlow(page)
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION, { timeout: 20_000 })
  const socket = live.sockets[0]!
  await owner(socket, 'name: शर्मा चाय; category: चाय की दुकान')
  // Before the place is known: the owner may still stop; everything said is kept.
  const goodbye = await owner(socket, 'बस')
  expect(goodbye).not.toContain('?')
  expect(socket.received.join('\n')).toContain('"target":"end_conversation"')
  const ended = page.getByTestId('conversation-ended')
  await expect(ended).toContainText(copy.endedTitle!)
  await expect(page.getByTestId('voice-alert')).toHaveCount(0)
  // No reconnect loop and no error: the conversation rests until the owner continues.
  await page.waitForTimeout(2_000)
  expect(live.sockets).toHaveLength(1)
  expect(socket.received.join('\n')).not.toContain('"kind":"error"')
  await expect(page.getByTestId('shop-so-far')).toContainText('शर्मा चाय')
  // Stopping opens "Review my shop" at once; close it to continue.
  await expect(page.getByTestId('draft-summary')).toContainText('शर्मा चाय')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('draft-summary')).toHaveCount(0)
  // Continue: the same conversation, silently, from the next missing field.
  await ended.getByRole('button', { name: copy.continueChat! }).click()
  await expect.poll(() => live.sockets.length, { timeout: 20_000 }).toBe(2)
  const sid = JSON.parse(socket.received.find((m) => m.includes('"ready"'))!).session_id
  expect(live.sockets[1]!.url.searchParams.get('session_id')).toBe(sid)
  const second = live.sockets[1]!
  await expect.poll(() => second.received.some((m) => m.includes('"ready"'))).toBe(true)
  // Silent: no new greeting.
  await page.waitForTimeout(1_500)
  expect(second.received.filter((m) => m.includes('"kind":"reply"'))).toHaveLength(0)
  const next = await owner(second, 'location: लाजपत नगर')
  for (const done of [ASKED.name, ASKED.kind, ASKED.place]) expect(next).not.toContain(done)
})
