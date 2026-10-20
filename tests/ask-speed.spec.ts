import { expect, test } from '@playwright/test'

// OB-97: Ask took about 8 s to show anything on production. The first result card has to be on
// screen within 1.5 s of Send and the answer has to stream in after it, not arrive in one piece.
// The server is replaced by a timed event stream (offline fixture): instant card at 100 ms, the
// answer's words at 450 ms and 800 ms, the complete answer at 1200 ms.
const INDIRANAGAR = { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' }

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript((area) => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
  }, INDIRANAGAR)
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
})

const intent = {
  summary: '',
  keywords: ['kopi'],
  category: '',
  max_price: null,
  halal: false,
  vegetarian: false,
  locally_made: false,
  open_now: false,
  followups: [],
  sort: 'best',
  near: '',
  deals: false,
}

const pick = {
  id: 'demo-fixture-kopi',
  name: 'Fixture Kopi',
  source: 'chalkboard',
  category: 'Cafe',
  lat: 12.972,
  lng: 77.642,
  distance_m: 120,
  open_now: true,
  currency: 'INR',
  items: [{ name: 'Kopi', price: 1800, unit: 'cup', available: true }],
  matched: [{ name: 'Kopi', price: 1800, unit: 'cup', available: true }],
  sold_out: [],
  demo_shop: true,
  deal: null,
}

const answer = (summary: string, mode: string) => ({
  intent: { ...intent, summary },
  mode,
  groups: [{ id: 'best', places: [pick] }],
  anchor: null,
})

test('OB-97: first result card within 1.5 s and the answer streams in after it', async ({
  page,
}) => {
  await page.addInitScript(
    ({ instant, complete }) => {
      const w = window as unknown as { __ask: string[] }
      w.__ask = []
      const real = window.fetch.bind(window)
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : ''
        if (!url.endsWith('/api/v1/discover/ask')) return real(input, init)
        const encoder = new TextEncoder()
        const frame = (event: string, data: unknown) =>
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        const steps: [number, string, unknown][] = [
          [100, 'instant', instant],
          [450, 'delta', { text: 'Kopi ' }],
          [800, 'delta', { text: 'nearby ' }],
          [1200, 'complete', complete],
        ]
        const body = new ReadableStream({
          start(controller) {
            let last = 0
            const next = (i: number) => {
              if (i === steps.length) return controller.close()
              const [at, event, data] = steps[i]
              setTimeout(() => {
                w.__ask.push(event)
                controller.enqueue(frame(event, data))
                next(i + 1)
              }, at - last)
              last = at
            }
            next(0)
          },
        })
        return Promise.resolve(
          new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
        )
      }
    },
    { instant: answer('', 'keywords'), complete: answer('Kopi nearby ', 'ai') },
  )

  await page.goto('/explore/')
  const composer = page.getByRole('textbox', { name: 'Ask about anything nearby' })
  await composer.fill('kopi')
  const sent = Date.now()
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  const card = page.getByText('Fixture Kopi').first()
  await expect(card).toBeVisible({ timeout: 1500 })
  expect(Date.now() - sent).toBeLessThan(1500)
  // The card is up before the complete answer has even been sent: it streamed.
  const seen = await page.evaluate(() => (window as unknown as { __ask: string[] }).__ask)
  expect(seen).not.toContain('complete')

  await expect(page.getByText('Kopi nearby')).toBeVisible()
  await page.waitForFunction(() =>
    (window as unknown as { __ask: string[] }).__ask.includes('complete'),
  )
  const order = await page.evaluate(() => (window as unknown as { __ask: string[] }).__ask)
  expect(order).toEqual(['instant', 'delta', 'delta', 'complete'])
})

// OB-92: the suggestion chips used to be added once /discover/suggest answered. On a slow
// connection that was after the page was scrolled to its end, so the new chips landed under the
// fixed composer. Their room is now held from the first frame, so they are already above the composer.
test('OB-92 late suggestions do not grow the Ask page under the composer', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/discover/suggest?**', async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('customer-chat-dock')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  release()
  await expect(page.locator('[data-chips]')).toBeVisible({ timeout: 20_000 })
  const after = await page.evaluate(() => ({
    chipsBottom: Math.max(
      ...Array.from(document.querySelectorAll('[data-chips] button')).map(
        (el) => el.getBoundingClientRect().bottom,
      ),
    ),
    dockTop: document.querySelector('[data-testid="customer-chat-dock"]')!.getBoundingClientRect()
      .top,
  }))
  // Measured while the chips are still dealing in: the rise must not reach the composer either.
  expect(after.chipsBottom, 'chips end above the composer').toBeLessThanOrEqual(after.dockTop)
})
