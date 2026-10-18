import { expect, test, type WebSocketRoute } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { enter } from '../../tests/stories/support.js'
import { RAW, glideTo, localOnly, phone, relabel, relabelApi, warm } from './support.js'

// The shop owner's story on the real app (local preview, seeded demo worlds, offline coach):
// talk → live with a QR → Today → the AI drafts the wholesaler's chat order → till photo import.
const SAID = 'name: Chai Corner; category: Tea stall; location: Indiranagar'
const SPOKEN = 'I run Chai Corner, a tea stall in Indiranagar'
const tillPhoto = fileURLToPath(
  new URL('../../backend/tests/fixtures/screen-photos/petpooja/photo.png', import.meta.url),
)

test('vendor', async ({ browser, baseURL }) => {
  test.setTimeout(300_000)
  const { context, page, clock, cast } = await phone(browser, baseURL!, 'vendor', {
    permissions: ['microphone'],
  })
  await localOnly(page)
  await relabelApi(page, baseURL!)
  // A silent microphone: the voice screen listens; the owner's words arrive as the transcript.
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
  let server: WebSocketRoute | null = null
  let client: WebSocketRoute | null = null
  await page.routeWebSocket('**/api/v1/voice*', (route) => {
    const upstream = route.connectToServer()
    server = upstream
    client = route
    upstream.onMessage((message) =>
      route.send(
        typeof message === 'string' ? relabel(message, baseURL!).replaceAll(SAID, SPOKEN) : message,
      ),
    )
    route.onMessage((message) => upstream.send(message))
  })

  // Warm the dev server: its first cold load can re-optimise and fail one lazy screen.
  await warm(page)
  await enter(page)
  // 1. Talk to set up.
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  clock.start('talk')
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByText('Can you tell me about your shop?')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  client!.send(JSON.stringify({ kind: 'input_transcript', text: SPOKEN }))
  await page.waitForTimeout(900)
  server!.send(JSON.stringify({ kind: 'text', text: SAID }))
  await expect(page.getByTestId('shop-live')).toHaveText('Live', { timeout: 20_000 })
  await clock.end(page, 2.2)

  // 2. Live, with a link and a QR.
  clock.start('live')
  await page.getByTestId('end-conversation').click()
  await page.getByTestId('finish-review').click()
  await expect(
    page.getByRole('heading', { name: /Congratulations, Chai Corner is live/ }),
  ).toBeVisible()
  await page.waitForTimeout(1200)
  await glideTo(page, page.getByTestId('shop-qr'))
  await clock.end(page, 1.8)

  // Off camera: the seeded tour shop (eight weeks of sales) becomes the shop we follow.
  expect((await page.request.post('/api/v1/demo/workspace?zone=Asia/Kolkata')).ok()).toBe(true)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: /Choose shop:/ }).click()
  await page.getByRole('menuitem').nth(1).click()
  await expect(page.getByTestId('today-pulse')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(800)

  // 3. Today: what needs you first.
  clock.start('today')
  await page.waitForTimeout(1600)
  await glideTo(page, page.getByTestId('today-needs'))
  await clock.end(page, 1.6)

  // Off camera: the supply showcase shop, its wholesaler set to a chat order (WhatsApp-style),
  // as a tea stall orders milk from a local dairy.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Purchase orders/ }).click()
  await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Supply chain' })).toContainText(/runs out/)
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  const milk = shops.find((s: { fields: { name: string } }) => /Supply demo/.test(s.fields.name))
  const supply = await (await page.request.get(`/api/v1/businesses/${milk.id}/supply`)).json()
  const dairy = supply.suppliers[0]
  const saved = await page.request.put(
    `/api/v1/businesses/${milk.id}/supply/suppliers/${dairy.supplier.id}/rules`,
    { data: { version: dairy.version, rules: { ...dairy.rules, system_format: 'text' } } },
  )
  expect(saved.ok()).toBe(true)
  // The Reorder draft is written on the server at tap time, from the rules just saved.
  await page.keyboard.press('Escape')
  const today = page.getByRole('region', { name: 'Supply chain' })
  await expect(today.getByRole('button', { name: 'Reorder', exact: true })).toBeVisible()
  await page.waitForTimeout(800)

  // 4. Running low: the AI drafts the order; the owner approves it.
  clock.start('reorder')
  await page.waitForTimeout(1200)
  await today.getByRole('button', { name: 'Reorder', exact: true }).click()
  const card = page.getByRole('article').first()
  await expect(card.getByRole('button', { name: 'Approve and send', exact: true })).toBeVisible()
  await page.waitForTimeout(2200)
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await expect(card.getByText(/Sent as chat message/)).toBeVisible()
  await clock.end(page, 2)
  const orders = (await (await page.request.get(`/api/v1/businesses/${milk.id}/supply`)).json())
    .orders as { documents: { kind: string; raw: string; translated?: string }[] }[]
  const message = orders[0]?.documents.find((d) => d.kind === 'ORDERS')?.translated ?? ''
  writeFileSync(`${RAW}/vendor-order.txt`, relabel(message, baseURL!))
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // 5. A photo of the till screen becomes the menu.
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.waitForTimeout(600)
  clock.start('import')
  await page.getByRole('button', { name: /Connect your system/i }).click()
  const connect = page.getByRole('dialog', { name: 'Connect your system' })
  await page.waitForTimeout(900)
  await glideTo(page, connect.getByTestId('screen-gallery').locator('..'))
  await connect.getByTestId('screen-gallery').setInputFiles([tillPhoto])
  await page.waitForTimeout(700)
  await connect.getByRole('button', { name: 'Read photos', exact: true }).click()
  const next = connect.getByRole('button', { name: 'Confirm & review import' })
  await expect(next).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1200)
  await glideTo(page, next)
  await next.click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible()
  await page.waitForTimeout(1800)
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  await clock.end(page, 1.6)

  clock.save('vendor.json')
  await cast.finish()
  await context.close()
})
