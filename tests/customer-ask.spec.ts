import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { publish } from './qa/support.js'
import { enter, seedShop } from './stories/support.js'

// The customer front door is a conversation (owner decision, 16 Oct): ask, get cards with the
// exact item and price, follow up with context, and come back to the same place.
const INDIRANAGAR = { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' }

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

const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask about anything nearby' })

async function ask(page: Page, text: string) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

/** A deterministic answer with one Chalkboard shop, for UI-state tests. */
function answer(name = 'Fixture Kopi') {
  return {
    intent: {
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
    },
    mode: 'keywords',
    groups: [
      {
        id: 'best',
        places: [
          {
            id: 'demo-fixture-kopi',
            name,
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
          },
        ],
      },
    ],
    anchor: null,
  }
}

test('front door: the conversation opens with real local suggestions and Today’s 7', async ({
  page,
  isMobile,
}) => {
  await page.goto('/explore/')
  await expect(page.getByRole('heading', { name: 'What are you looking for nearby?' })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(page.getByRole('button', { name: /^Area: Indiranagar/ })).toBeVisible()
  // One primary path: the composer; chips are the same question, one tap away.
  await expect(composer(page)).toBeVisible()
  const chips = page.getByRole('list', { name: 'Ask about anything nearby' }).getByRole('button')
  await expect(chips.first()).toBeVisible()
  expect(await chips.count()).toBeLessThanOrEqual(4)
  await page.waitForTimeout(700)
  if (isMobile) await page.screenshot({ path: 'docs/stories/customer-ai-1-front-door.png' })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  // Today's 7 lives in the conversation, not as a dashboard section.
  await page.getByRole('button', { name: /Today’s 7 near you/ }).click()
  await expect(page.getByRole('region', { name: /^Today near/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New conversation' })).toBeVisible()
})

test('ask: a real shop answers with its exact item and price; back returns to the same place', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000)
  // A pinned shop (photo GPS in Indiranagar) is what discovery can place on the map.
  await enter(page)
  const name = `Courtyard Chai ${Date.now().toString().slice(-6)}`
  await seedShop(page, true, name)
  const id = (await (await page.request.get('/api/v1/businesses')).json())[0].id as string
  await publish(page, id)
  await page.goto('/explore/')
  await ask(page, 'kopi')
  await expect(page.getByText('Understanding what you need…')).toBeVisible()
  if (isMobile) await page.screenshot({ path: 'docs/stories/customer-ai-2-thinking.png' })
  const card = page.locator(`a[href="/explore/s/${id}"]`)
  await expect(card).toContainText('Kopi', { timeout: 15_000 })
  await expect(card).toContainText('₹18.00')
  await expect(card).toContainText(/\d+ (m|km)/)
  await expect(page.getByRole('img', { name: 'Map of these places' })).toBeVisible()
  await page.waitForTimeout(900)
  if (isMobile) await page.screenshot({ path: 'docs/stories/customer-ai-3-answer.png' })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  await card.click()
  await expect(page).toHaveURL(new RegExp(`/explore/s/${id}`))
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  // The conversation is still there: the question, its answer and the composer.
  await expect(page).toHaveURL(/\/explore\/$/)
  await expect(page.getByRole('article', { name: 'kopi' })).toBeVisible()
  await expect(card).toBeVisible()
})

test('follow-ups keep the context: cheaper, open now and near the station', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/discover/ask')) bodies.push(request.postDataJSON())
  })
  await page.goto('/explore/')
  await ask(page, 'kopi')
  await expect(page.getByRole('button', { name: 'Cheaper?' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Cheaper?' }).click()
  await expect(page.getByText('Cheapest first', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(bodies[1]).toMatchObject({ refine: 'price', context: { keywords: ['kopi'] } })
  // Typed follow-ups work too, and keep everything said before.
  await ask(page, 'open now?')
  await expect(page.getByText('Cheapest first · Open now', { exact: true })).toBeVisible({
    timeout: 15_000,
  })
  expect(bodies[2]).toMatchObject({ context: { keywords: ['kopi'], sort: 'price' } })
  await page.getByRole('button', { name: 'Near a station?' }).click()
  await expect(
    page.getByText('Cheapest first · Open now · Near Indiranagar Metro', { exact: true }),
  ).toBeVisible({ timeout: 15_000 })
  // Only the latest answer offers follow-ups; older answers stay quiet.
  await expect(page.getByRole('button', { name: 'Cheaper?' })).toHaveCount(0)
  await page.screenshot({ path: 'docs/stories/customer-ai-4-follow-ups.png' })
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(
    page.getByRole('heading', { name: 'What are you looking for nearby?' }),
  ).toBeVisible()
  await expect(page.getByText('Cheapest first', { exact: false })).toHaveCount(0)
})

test('errors keep the conversation: retry, cancel, stop and offline recovery', async ({
  page,
  context,
}) => {
  let fail = true
  await page.route('**/api/v1/discover/ask', (route) =>
    fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: answer() }),
  )
  await page.goto('/explore/')
  await ask(page, 'kopi')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('That didn’t work.')
  await page.screenshot({ path: 'docs/stories/customer-ai-5-error.png' })
  fail = false
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('a[href="/explore/s/demo-fixture-kopi"]')).toContainText('₹18.00')
  // Cancel removes only the failed turn.
  fail = true
  await ask(page, 'bread')
  await page.getByRole('alert').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('article', { name: 'bread' })).toHaveCount(0)
  await expect(page.locator('a[href="/explore/s/demo-fixture-kopi"]')).toBeVisible()
  // Offline: said plainly, then tried again by itself when the connection is back.
  fail = false
  await context.setOffline(true)
  await ask(page, 'tea')
  await expect(page.getByRole('alert')).toContainText('You’re offline.')
  await page.screenshot({ path: 'docs/stories/customer-ai-6-offline.png' })
  await context.setOffline(false)
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('a[href="/explore/s/demo-fixture-kopi"]')).toHaveCount(2)
  // Stop while thinking leaves a clear, retryable state.
  await page.unroute('**/api/v1/discover/ask')
  await page.route('**/api/v1/discover/ask', async () => {
    /* Never answers: the customer stops it. */
  })
  await ask(page, 'cake')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByText('Stopped.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('nothing found is a next step, not a dead end', async ({ page }) => {
  await page.route('**/api/v1/discover/ask', (route) =>
    route.fulfill({
      json: {
        ...answer(),
        intent: { ...answer().intent, keywords: ['snow', 'boots'] },
        groups: [],
      },
    }),
  )
  await page.goto('/explore/')
  await ask(page, 'snow boots')
  await expect(
    page.getByRole('article').getByText('Nothing nearby matches “snow boots” yet.'),
  ).toBeVisible()
  await page.screenshot({ path: 'docs/stories/customer-ai-7-empty.png' })
  await page.getByRole('link', { name: 'Browse everything nearby' }).click()
  await expect(page).toHaveURL(/\/explore\/browse/)
})

for (const mode of ['light', 'dark'] as const)
  test(`conversation answer is axe clean in ${mode}`, async ({ page, isMobile }) => {
    await page.addInitScript(
      (appearance) =>
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance })),
      mode,
    )
    await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: answer() }))
    await page.goto('/explore/')
    await ask(page, 'kopi')
    await expect(page.locator('a[href="/explore/s/demo-fixture-kopi"]')).toBeVisible()
    await page.waitForTimeout(900)
    await page.screenshot({
      path: `docs/stories/customer-ai-8-answer-${isMobile ? 'phone' : 'desktop'}-${mode}.png`,
    })
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })

test('speed: first answer text appears quickly with the offline fixture', async ({ page }) => {
  test.setTimeout(60_000)
  await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: answer('Fast Kopi') }))
  await page.goto('/explore/')

  const firstWordRuns: number[] = []
  const completeRuns: number[] = []
  const tapRuns: number[] = []

  for (let i = 0; i < 5; i++) {
    await composer(page).fill('kopi')

    const t0 = Date.now()
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const card = page.locator('a[href="/explore/s/demo-fixture-kopi"]').last()
    await expect(card).toBeVisible({ timeout: 15_000 })
    const tFirstWord = Date.now() - t0
    firstWordRuns.push(tFirstWord)

    await expect(card).toContainText('Fast Kopi')
    const tComplete = Date.now() - t0
    completeRuns.push(tComplete)

    const tTap = Date.now()
    await card.hover()
    await card.click()
    await expect(page).toHaveURL(/\/explore\/s\/demo-fixture-kopi/)
    const tTapDuration = Date.now() - tTap
    tapRuns.push(tTapDuration)

    await page.goBack()
    await expect(composer(page)).toBeVisible()
  }

  console.log('BENCHMARK_RESULTS:', JSON.stringify({ firstWordRuns, completeRuns, tapRuns }))

  // Targets: first words < 700 ms, complete < 2500 ms
  for (const ms of firstWordRuns) expect(ms).toBeLessThan(700)
  for (const ms of completeRuns) expect(ms).toBeLessThan(2500)
})

