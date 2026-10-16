import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

export const gpsBoard = new URL('./fixtures/bengaluru-board.jpg', import.meta.url)
export const gpsBoardPath = fileURLToPath(gpsBoard)
// One real catalogue sample per city, exported without seeding the shared test database.
export const catalogue = JSON.parse(
  readFileSync(new URL('./fixtures/catalogue.json', import.meta.url), 'utf8'),
) as { city: string; shop: { id: string; name: string; currency: string } }[]

export async function voiceFixture(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      audio.createOscillator().connect(destination)
      return destination.stream
    }
  })
  await page.routeWebSocket('**/api/v1/voice*', (socket) => {
    // This UI-only fixture creates no backend session; do not hand a fictitious session to text chat.
    socket.send(JSON.stringify({ kind: 'ready', mode: 'offline' }))
    socket.onMessage((message) => {
      if (typeof message !== 'string' || JSON.parse(message).kind !== 'audio_end') return
      socket.send(JSON.stringify({ kind: 'input_transcript', text: 'Fixture voice note' }))
      socket.send(
        JSON.stringify({ kind: 'output_transcript', text: 'Offline voice fixture received.' }),
      )
      socket.send(JSON.stringify({ kind: 'turn_complete' }))
    })
  })
}

export async function tryVoice(page: Page, story: number) {
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  const finish = page.getByRole('button', { name: 'Finish speaking', exact: true })
  await expect(finish).toHaveAttribute('aria-pressed', 'true')
  await shot(page, story, '1-voice')
  await finish.click()
  await expect(page.getByRole('log')).toContainText('Offline voice fixture received.')
  await expect(page.getByRole('button', { name: 'Press to talk', exact: true })).toBeVisible()
}

export const reviewName = 'Check before saving'
export const shopName = 'Courtyard Chai · Bengaluru'

export async function localOnly(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

export function gap(description: string) {
  test.info().annotations.push({ type: 'gap', description })
  if (process.env.STORY_STRICT === 'true') expect.soft(false, description).toBe(true)
}

export function liveOnly(description: string) {
  test.info().annotations.push({ type: 'live-only', description })
}

export async function shot(page: Page, story: number, step: string | number) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.screenshot({ path: `docs/stories/S${story}-${step}.png`, animations: 'disabled' })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `S${story}/${step}: horizontal overflow at 390px`,
  ).toBe(true)
}

export async function enter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
}

export async function confirm(page: Page) {
  const review = page.getByRole('dialog', { name: reviewName })
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/**
 * Opens the full-screen new-shop flow from the header "+" (unless it is already open), lets the
 * coach greet, answers in the chat and opens the full-screen review. The offline coach reads
 * "name: …; location: …" notes into the draft.
 */
export async function openNewShopReview(
  page: Page,
  details = 'name: Courtyard Chai; category: Tea stall; location: Indiranagar, Bengaluru',
) {
  const begin = page.getByRole('button', { name: 'Let’s begin' })
  if (!(await begin.isVisible()))
    await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await begin.click()
  await expect(page.getByRole('log')).toContainText('What do you sell?')
  await page.getByLabel('Message', { exact: true }).fill(details)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('agent-action').last()).toBeVisible()
  await page.getByRole('button', { name: 'Review my shop' }).click()
  await expect(page.getByTestId('new-shop-review')).toBeVisible()
}

/** A whole new shop through the flow: chat, review, "Open my shop", back to the workspace. */
export async function createShop(page: Page, details?: string) {
  await openNewShopReview(page, details)
  await createShopFromReview(page)
}

/** The saved shop's details form (My shop → Shop details → Edit details). */
export async function editShopDetails(page: Page) {
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByLabel('Shop name')).toBeVisible()
}

/** From the flow's review page: "Open my shop", the ready moment, then the workspace. */
export async function createShopFromReview(page: Page) {
  await page.getByRole('button', { name: 'Open my shop' }).click()
  await expect(page.getByRole('heading', { name: 'Your shop is ready' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue with my shop' }).click()
  await expect(page.getByTestId('new-shop-flow')).toHaveCount(0)
}

export async function closeSheet(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export async function image(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 120
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f0c878'
    ctx.fillRect(0, 0, 160, 120)
    ctx.fillStyle = '#242424'
    ctx.font = '16px sans-serif'
    ctx.fillText('Fixture Chai 15', 10, 60)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  return { name: 'fixture-board.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }
}

/** Arrange an owned shop in the same SQLite preview as existing specs; story actions use UI. */
export async function seedShop(page: Page, withPhotoPin = false, name = shopName) {
  let pinned: { id: string; revision: number } | null = null
  if (withPhotoPin) {
    // Only the new-shop photo path can currently review GPS. Keep its empty address while
    // adding the rest of this setup fixture; S1 audits the existing-shop GPS gap separately.
    const photo = await (
      await page.request.post('/api/v1/photos?currency=INR', {
        headers: { 'Content-Type': 'image/jpeg' },
        data: readFileSync(gpsBoard),
      })
    ).json()
    expect(
      (
        await page.request.post(`/api/v1/proposals/${photo.proposal.id}/approve`, {
          data: { digest: photo.proposal.digest },
        })
      ).ok(),
    ).toBe(true)
    pinned = (await (await page.request.get('/api/v1/businesses')).json())[0]
  }
  const products = [
    { name: 'Kopi', price: 1800, unit: 'cup', category: 'Drinks' },
    {
      name: 'Kaya toast',
      price: 2500,
      unit: 'set',
      category: 'Breakfast',
      available: !withPhotoPin,
    },
  ]
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business_id: pinned?.id,
      revision: pinned?.revision ?? 0,
      business: {
        name,
        category: 'Cafe',
        location: pinned ? '' : 'Indiranagar, Bengaluru',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        halal: 'yes',
        locally_made: true,
        phone: '',
        payment_methods: ['UPI', 'cash'],
        delivery: 'Swiggy',
        weekly_hours: [{ day: 'thu', open: '07:00', close: '20:00', closed: false }],
        reward_text: 'Your eighth chai is free',
        stamps_needed: 8,
      },
      products: pinned ? [] : products,
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
  if (pinned) {
    const { business_id: id } = await approved.json()
    const current = (await (await page.request.get('/api/v1/businesses')).json()).find(
      (shop: { id: string }) => shop.id === id,
    )
    const restored = await (
      await page.request.post('/api/v1/proposals', {
        data: { kind: 'inventory', business_id: id, revision: current.revision, products },
      })
    ).json()
    expect(
      (
        await page.request.post(`/api/v1/proposals/${restored.id}/approve`, {
          data: { digest: restored.digest },
        })
      ).ok(),
    ).toBe(true)
  }
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

export async function share(page: Page) {
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Customer page/ }).click()
  const sharing = page.getByRole('switch', { name: 'Share customer page' })
  if (!(await sharing.isChecked())) await sharing.click()
  await expect(sharing).toBeChecked()
  const href = await page.getByRole('link', { name: 'Open page' }).getAttribute('href')
  expect(href).toBeTruthy()
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible()
  return new URL(href!, page.url()).toString()
}

/** share(), plus the signed QR link the owner's poster encodes (`?source=qr&k=…`). */
export async function shareSigned(page: Page) {
  const keyed = page.waitForResponse((r) => /\/businesses\/[^/]+\/qr-key$/.test(r.url()) && r.ok())
  const url = await share(page)
  const { key } = (await (await keyed).json()) as { key: string }
  const qr = new URL(url)
  qr.searchParams.set('source', 'qr')
  qr.searchParams.set('k', key)
  return { url, qr: qr.toString() }
}

export const phone = {
  viewport: { width: 390, height: 844 },
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
}

/** A 256 px map tile for the in-chat map (streets, blocks, a park), made without network. */
function fakeTile(): Buffer {
  const size = 256
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const paint = (x: number, y: number) => {
    const road = (at: number, width: number, v: number) => Math.abs(v - at) <= width
    if (road(70, 6, x) || road(180, 6, y)) return [255, 255, 255]
    if (road(70, 8, x) || road(180, 8, y)) return [214, 207, 192]
    if (road(200, 3, x) || road(60, 3, y) || road(x * 0.6 + 10, 3, y)) return [250, 248, 244]
    if (x > 92 && x < 176 && y > 84 && y < 160) return [205, 230, 196]
    return (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? [238, 233, 223] : [232, 226, 214]
  }
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y)
      raw.set([r!, g!, b!, 255], y * (size * 4 + 1) + 1 + x * 4)
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body) >>> 0)
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * The phone's camera and microphone for the in-chat camera, and stand-in map tiles. The camera
 * films a chalk price board (drawn on a canvas); `camera: 'denied'` refuses it like a blocked
 * browser permission. Register after `localOnly` (later routes win).
 */
export async function inChatFixtures(page: Page, camera: 'board' | 'denied' = 'board') {
  await page.addInitScript((mode) => {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.video) {
        if (mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError')
        const canvas = document.createElement('canvas')
        canvas.width = 1280
        canvas.height = 960
        const g = canvas.getContext('2d')!
        const draw = () => {
          g.fillStyle = '#6b4a2b'
          g.fillRect(0, 0, 1280, 960)
          g.fillStyle = '#23362c'
          g.fillRect(150, 170, 980, 680)
          g.fillStyle = '#f4f1e8'
          g.font = 'bold 72px sans-serif'
          g.fillText('CHAI CORNER', 380, 280)
          g.font = '52px sans-serif'
          const rows = ['Masala chai', 'Cutting chai', 'Bun maska', 'Samosa', 'Ginger tea']
          rows.forEach((row, i) => {
            g.fillText(row, 230, 390 + i * 90)
            g.fillText(`₹${[15, 10, 25, 20, 18][i]}`, 900, 390 + i * 90)
          })
        }
        draw()
        window.setInterval(draw, 200)
        return canvas.captureStream(10)
      }
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      audio.createOscillator().connect(destination)
      return destination.stream
    }
  }, camera)
  const tile = fakeTile()
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: tile }),
  )
}

/** Edit details is a journey of one question per screen: jump to a step from the step row. */
export async function detailsStep(page: Page, step: string) {
  await page
    .getByRole('dialog', { name: 'Edit details' })
    .getByRole('navigation')
    .getByRole('button', { name: step, exact: true })
    .click()
}
