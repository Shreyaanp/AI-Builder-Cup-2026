import { expect, test, type Locator, type Page, type WebSocketRoute } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const fixtures = JSON.parse(readFileSync(resolve('scripts/impact/fixtures.json'), 'utf8')) as {
  shops: { id: string; name: string; category: string; location: string; hours: string }[]
}
const runs = Number(process.env.IMPACT_RUNS || 5)
if (!Number.isInteger(runs) || runs < 1) throw new Error('IMPACT_RUNS must be a positive integer')
type Action = {
  kind: 'tap' | 'utterance' | 'text_entry' | 'file_selection'
  label: string
  at_ms: number
}
type Row = {
  flow: string
  shop?: string
  repeat?: number
  elapsed_ms?: number
  actions: Action[]
  [key: string]: unknown
}
const rows: Row[] = []
const output = resolve('docs/impact/browser-results.json')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const fixturesHash = createHash('sha256')
  .update(readFileSync(resolve('scripts/impact/fixtures.json')))
  .digest('hex')
let browserVersion = ''
test.beforeAll(async ({ browser }) => {
  browserVersion = browser.version()
})

function save() {
  mkdirSync(resolve('docs/impact'), { recursive: true })
  writeFileSync(
    output,
    JSON.stringify(
      {
        measured_at_utc: new Date().toISOString(),
        commit,
        fixtures_sha256: fixturesHash,
        browser_version: browserVersion,
        node_version: process.version,
        runs,
        viewport: { width: 390, height: 844 },
        timing:
          'Node performance.now; includes Playwright actions/waits; no owner think/typing/speech time',
        rows,
      },
      null,
      2,
    ) + '\n',
  )
}

function inputs(started: number) {
  const actions: Action[] = []
  const record = (kind: Action['kind'], label: string) =>
    actions.push({ kind, label, at_ms: performance.now() - started })
  return {
    actions,
    record,
    tap: async (locator: Locator, label: string) => {
      await locator.tap()
      record('tap', label)
    },
    fill: async (locator: Locator, label: string, text: string) => {
      await locator.tap()
      record('tap', `focus ${label}`)
      await locator.fill(text)
      record('text_entry', `${label} (${text.length} characters)`)
    },
  }
}

async function enter(page: Page) {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
  await page.context().grantPermissions(['microphone'])
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      return destination.stream
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).tap({ timeout: 90_000 })
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).tap()
  await expect(page.getByRole('button', { name: 'Add shop details', exact: true })).toBeVisible()
}

async function voiceFixture(page: Page) {
  let socket: WebSocketRoute | undefined
  let server: WebSocketRoute | undefined
  let latest: { business: Record<string, unknown> | null; products: unknown[] } | null = null
  let completed = 0
  const errors: string[] = []
  await page.routeWebSocket('**/api/v1/voice*', (route) => {
    socket = route
    server = route.connectToServer()
    route.onMessage((message) => {
      // Synthetic microphone PCM is irrelevant to transcript replay; avoid flooding the socket.
      if (typeof message === 'string') server!.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const event = JSON.parse(message)
        if (event.kind === 'proposal')
          latest = {
            business: event.data.snapshot.business,
            products: event.data.snapshot.products,
          }
        if (event.kind === 'turn_complete') completed++
        if (event.kind === 'error') errors.push(event.code)
      }
      route.send(message)
    })
  })
  return {
    async say(text: string) {
      await expect.poll(() => Boolean(server && socket)).toBe(true)
      const before = completed
      // The offline server has no ASR. Replay a labelled transcript as a text control through
      // its real socket/tools; proposals and saved state are never stubbed.
      socket!.send(JSON.stringify({ kind: 'input_transcript', text }))
      server!.send(JSON.stringify({ kind: 'new_shop', draft: latest }))
      server!.send(JSON.stringify({ kind: 'text', text }))
      await expect
        .poll(
          () => {
            expect(errors).toEqual([])
            return completed
          },
          { timeout: 15_000 },
        )
        .toBeGreaterThan(before)
    },
  }
}

for (let repeat = 0; repeat < runs; repeat++) {
  for (const shop of fixtures.shops) {
    for (const mode of ['voice', 'manual']) {
      test(`onboarding ${shop.id} ${mode} ${repeat}`, async ({ page }) => {
        const voice = await voiceFixture(page)
        await enter(page)
        const started = performance.now()
        const input = inputs(started)
        await input.tap(
          page.getByRole('button', { name: 'Add shop details', exact: true }),
          'Add shop details',
        )
        await input.tap(page.getByRole('button', { name: 'Let’s begin' }), 'Let’s begin')
        await expect(page.getByRole('log')).toContainText('What is your business called?')
        if (mode === 'voice') {
          for (const field of ['name', 'category', 'location', 'hours'] as const) {
            const utterance = `${field}: ${shop[field]}`
            input.record('utterance', utterance)
            await voice.say(utterance)
            await expect(page.getByTestId('shop-so-far')).toContainText(shop[field])
          }
          await input.tap(page.getByRole('button', { name: 'Review my shop' }), 'Review my shop')
        } else {
          await input.tap(
            page.getByRole('button', { name: 'Type it in instead' }),
            'Type it in instead',
          )
          const form = page.getByTestId('guided-details')
          await input.fill(form.getByLabel('Shop name'), 'Shop name', shop.name)
          await input.tap(form.getByRole('button', { name: 'Next', exact: true }), 'Next: category')
          await input.fill(form.getByLabel('Category', { exact: true }), 'Category', shop.category)
          await input.tap(form.getByRole('button', { name: 'Next', exact: true }), 'Next: items')
          await input.tap(
            form.getByRole('button', { name: 'Next', exact: true }),
            'Next: location (no items in either arm)',
          )
          await input.fill(
            form.getByLabel('Address or area', { exact: true }),
            'Address',
            shop.location,
          )
          await input.tap(form.getByRole('button', { name: 'Next', exact: true }), 'Next: hours')
          await input.fill(
            form.getByLabel('Hours note (optional)', { exact: true }),
            'Hours',
            shop.hours,
          )
          for (const step of ['phone', 'payment', 'delivery']) {
            await input.tap(
              form.getByRole('button', { name: 'Next', exact: true }),
              `Next: ${step}`,
            )
          }
          await input.tap(form.getByRole('button', { name: 'Review my shop' }), 'Review my shop')
        }
        await expect(page.getByTestId('new-shop-review')).toBeVisible()
        expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
        await input.tap(page.getByRole('button', { name: 'Open my shop' }), 'Open my shop')
        await expect(page.getByRole('heading', { name: 'Your shop is ready' })).toBeVisible()
        const elapsed = performance.now() - started
        const businesses = await (await page.request.get('/api/v1/businesses')).json()
        expect(businesses).toHaveLength(1)
        expect(businesses[0].fields).toMatchObject({
          name: shop.name,
          category: shop.category,
          location: shop.location,
          hours: shop.hours,
        })
        // "Shop live" here is the local saved/ready state, not a public or Google listing.
        expect(businesses[0].public).toBeFalsy()
        rows.push({
          flow: `onboarding_${mode}`,
          shop: shop.id,
          repeat,
          elapsed_ms: elapsed,
          actions: input.actions,
          persisted: true,
          public: false,
        })
        save()
      })
    }
  }
}

for (let repeat = 0; repeat < runs; repeat++) {
  test(`close day photo ${repeat}`, async ({ page }) => {
    await enter(page)
    const response = await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: {
          name: 'Impact Day Shop',
          category: 'Tea stall',
          currency: 'SGD',
          timezone: 'Asia/Singapore',
        },
        products: [
          { name: 'Chai', price: 1500, unit: 'cup' },
          { name: 'Samosa', price: 2000, unit: 'item' },
        ],
      },
    })
    expect(response.ok()).toBe(true)
    const proposal = await response.json()
    const approval = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
    expect(approval.ok()).toBe(true)
    const { business_id: bid } = await approval.json()
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).tap()
    await page.getByRole('button', { name: 'Grow', exact: true }).tap()
    const started = performance.now()
    const input = inputs(started)
    await input.tap(page.getByRole('button', { name: /^Close the day/ }), 'Close the day')
    const dialog = page.getByRole('dialog', { name: 'Close the day' })
    await input.tap(
      dialog.getByRole('button', { name: /Till or POS report/ }),
      'Till or POS report',
    )
    await dialog
      .locator('input[type=file]')
      .setInputFiles(resolve('scripts/impact/fixtures/tea.png'))
    input.record(
      'file_selection',
      'Synthetic tea menu used as transport image; fixture ignores pixels',
    )
    await expect(dialog.getByText(/\d+ lines$/)).toBeVisible()
    await input.tap(dialog.getByRole('button', { name: /^Review/ }), 'Review')
    await expect(dialog).toContainText('Offline mode')
    expect(await (await page.request.get(`/api/v1/businesses/${bid}/sales`)).json()).toEqual([])
    await input.tap(dialog.getByRole('button', { name: 'Save day' }), 'Save day')
    await expect(dialog.getByText('Day closed', { exact: true })).toBeVisible()
    const elapsed = performance.now() - started
    const sales = await (await page.request.get(`/api/v1/businesses/${bid}/sales`)).json()
    expect(sales).toHaveLength(2)
    rows.push({
      flow: 'close_day_photo',
      repeat,
      elapsed_ms: elapsed,
      actions: input.actions,
      persisted_lines: sales.length,
      fixture: true,
    })
    if (repeat === 0) {
      await dialog.getByRole('button', { name: 'Done', exact: true }).tap()
      await page.getByRole('button', { name: /^Close the day/ }).tap()
      const capture = page.getByRole('dialog', { name: 'Close the day' })
      const buttons = await capture.getByRole('button').allTextContents()
      const textInputs = await capture.getByRole('textbox').count()
      expect(textInputs).toBe(0)
      expect(buttons.some((label) => /type|manual/i.test(label))).toBe(false)
      rows.push({
        flow: 'close_day_typed',
        status: 'unavailable',
        actions: [],
        text_inputs: textInputs,
        buttons,
        reason: 'No typed entry control in Close the day',
      })
    }
    save()
  })
}
