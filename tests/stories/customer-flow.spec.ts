import { test, expect, owner, publish, audit } from '../qa/support.js'
import { localOnly } from './support.js'

test('customer fixes: Follow failure is actionable and retry keeps the saved state honest', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
  await page.goto(`/explore/s/${id}`)
  await page.route('**/customer/follows/*', (route) => route.fulfill({ status: 503, json: {} }))
  const follow = page.getByRole('button', { name: /Follow Courtyard/ })
  await follow.click()
  await expect(page.getByRole('alert')).toContainText('Couldn’t update your followed shops')
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await page.unroute('**/customer/follows/*')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: /Unfollow Courtyard/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('customer fixes: failed chat load has recovery and cannot send into an empty thread', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
  const response = await page.request.post(`/api/v1/customer/shops/${id}/threads`, {
    data: { text: 'Is Kopi available?' },
  })
  const chat = await response.json()
  const path = `/api/v1/customer/shops/${id}/threads/${chat.thread.id}`
  await page.route(`**${path}`, (route) => route.fulfill({ status: 503, json: {} }))
  await page.goto(`/explore/chats/${id}/${chat.thread.id}`)
  await expect(page.getByRole('alert')).toContainText('Your chats couldn’t load')
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeDisabled()
  await page.unroute(`**${path}`)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('list')).toContainText('Is Kopi available?')
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeEnabled()
})

test('customer fixes: tips network failure preserves the draft without blaming moderation', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
  await page.goto(`/explore/s/${id}`)
  await page.route('**/customer/shops/*/tips', (route) => route.fulfill({ status: 500, json: {} }))
  await page.getByLabel('Your tip').fill('Try the warm kaya toast')
  await page.getByRole('button', { name: 'Post tip', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Tips can’t be checked right now')
  await expect(page.getByLabel('Your tip')).toHaveValue('Try the warm kaya toast')
  await page.unroute('**/customer/shops/*/tips')
  await page.getByRole('button', { name: 'Post tip', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Thanks! Your tip is live.')
})

test('customer fixes: changing Ask location uses the new coordinates and Browse has a way home', async ({
  page,
}) => {
  const searches: { lat: number; lng: number }[] = []
  await page.route('**/discover/ask', (route) => {
    searches.push(route.request().postDataJSON())
    return route.fulfill({
      json: { intent: { summary: '', followups: [] }, mode: 'keywords', groups: [] },
    })
  })
  await page.goto('/explore/')
  await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('Coffee')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(
    page.getByRole('article').getByText('Nothing nearby matches “Coffee” yet.'),
  ).toBeVisible()
  // Changing the area asks the open question again, for the new place.
  await page.getByRole('button', { name: /^Area: / }).click()
  await page.getByRole('textbox', { name: 'City or area' }).fill('Bengaluru')
  await page.getByRole('textbox', { name: 'City or area' }).press('Enter')
  await expect.poll(() => searches.length).toBe(2)
  expect(searches[1].lat).toBeCloseTo(12.97, 1)
  expect(searches[1].lng).toBeCloseTo(77.59, 1)
  await page.getByRole('link', { name: 'Browse everything nearby' }).click()
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('search')).toBeVisible()
})

test('customer fixes: inline sign-in explains a failed attempt and keeps the owner question', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.goto(`/explore/s/${id}`)
  await page.getByRole('button', { name: 'Chat with the shop' }).click()
  await page.getByLabel('Your question').fill('How much is Kopi?')
  await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
  await page.getByRole('button', { name: 'Ask the owner' }).last().click()
  await page.route('**/customer/session', (route) => route.fulfill({ status: 503, json: {} }))
  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect(page.getByRole('alert')).toContainText('Sign-in did not finish')
  await page.unroute('**/customer/session')
  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'How much is Kopi?',
  )
})

test('customer fixes: passport board errors offer retry and failed opt-in stays off', async ({
  page,
}) => {
  await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
  await page.addInitScript(() =>
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 12.97, lng: 77.59, label: 'Bengaluru' } }),
    ),
  )
  await page.route('**/customer/passport/board?*', (route) =>
    route.fulfill({ status: 503, json: {} }),
  )
  await page.goto('/explore/passport')
  const board = page.getByRole('region', { name: 'Regulars this week' })
  await expect(board.getByRole('alert')).toBeVisible()
  await page.unroute('**/customer/passport/board?*')
  await board.getByRole('button', { name: 'Try again' }).click()
  await expect(board.getByRole('alert')).toHaveCount(0)
  await page.route('**/customer/passport/leaderboard', (route) =>
    route.fulfill({ status: 503, json: {} }),
  )
  const join = board.getByRole('switch', { name: 'Join the board' })
  await join.click()
  await expect(board.getByRole('alert')).toBeVisible()
  await expect(join).not.toBeChecked()
})

test('customer fixes: Today refresh failure is visible with cached finds', async ({ page }) => {
  await page.goto('/explore/')
  const loaded = page.waitForResponse((r) => r.url().includes('/public/today?') && r.ok())
  await page.getByRole('button', { name: /Today’s 7 near you/ }).click()
  const today = page.getByRole('region', { name: /^Today/ })
  // Quiet or not depends on what earlier runs left in the shared local DB; it only has to load.
  await loaded
  await expect(today).toBeVisible()
  await expect(today.getByRole('alert')).toHaveCount(0)
  await page.route('**/public/today?*', (route) => route.fulfill({ status: 503, json: {} }))
  await page.getByRole('button', { name: 'Profile and preferences' }).click()
  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Signed in as')
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(today.getByRole('alert')).toContainText('Today’s finds couldn’t load')
  await page.unroute('**/public/today?*')
  await today.getByRole('button', { name: 'Try again' }).click()
  await expect(today.getByRole('alert')).toHaveCount(0)
})

test('customer fixes: a Today festival trail opens the passport quests', async ({ page }) => {
  await page.route('**/public/today?*', async (route) => {
    const response = await route.fetch()
    const feed = await response.json()
    feed.finds = [
      {
        id: 'festival-fixture',
        kind: 'festival',
        source: 'demo',
        demo: true,
        action: 'trail',
        score: 1,
        params: { festival: 'deepavali', stops: 3, ends: '2026-11-09', art: 'lamp' },
      },
    ]
    await route.fulfill({ response, json: feed })
  })
  await page.goto('/explore/')
  await page.getByRole('button', { name: /Today’s 7 near you/ }).click()
  await page.getByRole('link', { name: 'Start trail', exact: true }).click()
  await expect(page).toHaveURL(/\/explore\/passport#quests$/)
  await expect(page.locator('#quests')).toBeInViewport()
})

test('customer motion: shared entrances settle, reduced motion stays static', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/explore/')
  // Suggestions are dealt in like cards; the question is written in chalk.
  const chip = page.getByRole('list', { name: 'Ask about anything nearby' }).getByRole('listitem')
  await expect(chip.first()).toHaveCSS('animation-name', 'chalkDealIn')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('animation-name', 'chalkWrite')
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState === 'finished'),
  )
  await page.screenshot({ path: `docs/stories/customer-${info.project.name}-motion.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(chip.first()).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('animation-name', 'none')
  await page.screenshot({ path: `docs/stories/customer-${info.project.name}-reduced-motion.png` })
})

for (const mode of ['light', 'dark'] as const) {
  test(`customer journey: first visit, Ask, shop, owner chat, Saved, passport and tips (${mode})`, async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(150_000)
    const id = await owner(page)
    await publish(page, id)
    const context = await browser.newContext({
      baseURL,
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      viewport:
        info.project.name === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: info.project.name === 'phone',
      hasTouch: info.project.name === 'phone',
      reducedMotion: 'reduce',
    })
    try {
      await context.route('**/*', (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      await context.addInitScript(
        (mode) =>
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: mode })),
        mode,
      )
      const customer = await context.newPage()
      await localOnly(customer)
      // Ranking is a UI fixture here (see the Ask step), including the on-device instant ranking
      // from the area prefetch; Browse (which always sends `q`) still uses the real offline API.
      await customer.route(
        (url) => url.pathname === '/api/v1/discover' && !url.searchParams.has('q'),
        (route) => route.fulfill({ json: { places: [] } }),
      )
      const capture = async (step: string) => {
        await audit(customer)
        await customer.screenshot({
          path: `docs/stories/customer-${info.project.name}-${mode}-${step}.png`,
          animations: 'disabled',
        })
      }
      await customer.goto('/?app=landing')
      await expect(customer.getByRole('heading', { level: 1 })).toBeVisible()
      await expect
        .poll(() => customer.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe(mode === 'dark' ? 'rgb(23, 39, 31)' : 'rgb(251, 247, 236)')
      await capture('landing')
      await customer.getByRole('link', { name: 'Find places near me', exact: true }).first().click()
      await customer.getByRole('textbox', { name: 'City or area' }).fill('Bengaluru')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      await customer.getByRole('button', { name: 'Explore my neighbourhood' }).click()
      await expect(
        customer.getByRole('heading', { name: 'What are you looking for nearby?' }),
      ).toBeVisible()
      await capture('ask')
      await customer.getByRole('button', { name: /Today’s 7 near you/ }).click()
      await expect(customer.getByRole('region', { name: /^Today/ })).toBeVisible()
      await capture('ask-today')
      await customer.getByRole('button', { name: /^Area: / }).click()
      await customer.getByRole('textbox', { name: 'City or area' }).fill('Delhi')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      await expect(customer.getByRole('button', { name: /^Area: Delhi/ })).toBeVisible()
      await customer.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('tea')
      await customer.getByRole('button', { name: 'Send', exact: true }).click()
      await customer.getByRole('link', { name: 'Browse everything nearby' }).click()
      await expect(customer.getByRole('textbox', { name: 'City or area' })).toHaveValue('Delhi')
      await customer.getByRole('link', { name: 'Back', exact: true }).click()
      await expect(customer.getByRole('button', { name: /^Area: Delhi/ })).toBeVisible()
      await customer.getByRole('button', { name: 'New conversation' }).click()
      await customer.getByRole('button', { name: /^Area: / }).click()
      await customer.getByRole('textbox', { name: 'City or area' }).fill('Bengaluru')
      await customer.getByRole('textbox', { name: 'City or area' }).press('Enter')
      await expect(customer.getByRole('button', { name: /^Area: Bengaluru/ })).toBeVisible()
      // Ranking is a local UI fixture; the shop, facts, account and conversations use the real offline API.
      await customer.route('**/discover/ask', (route) =>
        route.fulfill({
          json: {
            intent: { summary: '', followups: [] },
            mode: 'keywords',
            groups: [
              {
                id: 'best',
                places: [
                  {
                    id,
                    name: 'Courtyard Chai · Bengaluru',
                    source: 'chalkboard',
                    category: 'Cafe',
                    lat: 12.9716,
                    lng: 77.5946,
                    distance_m: 300,
                    open_now: true,
                    currency: 'INR',
                    items: [],
                    matched: [{ name: 'Kopi', price: 1800, unit: 'cup', available: true }],
                  },
                ],
              },
            ],
          },
        }),
      )
      await customer.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('Kopi')
      await customer.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(customer.getByRole('link', { name: /Courtyard Chai/ })).toBeVisible()
      await capture('results')
      await customer.getByRole('link', { name: /Courtyard Chai/ }).click()
      await expect(customer.getByRole('heading', { name: 'Menu & prices' })).toBeVisible()
      await customer.getByRole('button', { name: /Follow Courtyard/ }).click()
      await capture('shop')
      await customer.getByRole('button', { name: 'Chat with the shop' }).click()
      await customer.getByLabel('Your question').fill('How much is Kopi?')
      await customer.getByRole('button', { name: 'Ask the shop assistant' }).click()
      await expect(customer.getByText(/Listed price/)).toBeVisible()
      await customer.getByRole('button', { name: 'Ask the owner' }).last().click()
      await customer.getByRole('button', { name: /Continue with Google/ }).click()
      await expect(customer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
        'How much is Kopi?',
      )
      await customer.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(customer).toHaveURL(/\/explore\/chats\//)
      const thread = customer.url().split('/').at(-1)
      expect(
        (
          await page.request.post(`/api/v1/businesses/${id}/inquiries/${thread}/messages`, {
            data: { text: 'Kopi is available today.' },
          })
        ).ok(),
      ).toBe(true)
      await expect(customer.getByRole('list')).toContainText('Kopi is available today.', {
        timeout: 12_000,
      })
      await capture('reply')
      await customer.getByRole('link', { name: 'Back', exact: true }).click()
      await expect(customer.getByRole('list', { name: 'Chats', exact: true })).toContainText(
        'Kopi is available today.',
      )
      await customer.getByRole('link', { name: 'Saved', exact: true }).click()
      await expect(customer.getByRole('region', { name: 'Following' })).toContainText(
        'Courtyard Chai',
      )
      await capture('saved')
      await customer.getByRole('link', { name: /Courtyard Chai/ }).click()
      const tip = customer.getByLabel('Your tip')
      await tip.fill('Try the warm kaya toast')
      await customer.getByRole('button', { name: 'Post tip', exact: true }).click()
      await expect(customer.getByRole('alert')).toContainText('Thanks! Your tip is live.')
      await tip.scrollIntoViewIfNeeded()
      await capture('tips')
      await customer.getByRole('link', { name: 'Back', exact: true }).first().click()
      await customer.getByRole('navigation').getByRole('link', { name: 'Passport' }).click()
      await expect(customer.getByText('Newcomer').first()).toBeVisible()
      await capture('passport')
      await customer.getByRole('navigation').getByRole('link', { name: 'Ask', exact: true }).click()
      await customer.getByRole('link', { name: 'Browse everything nearby' }).click()
      await customer.getByRole('switch', { name: 'Halal if known' }).check()
      await customer.getByRole('button', { name: 'Map view', exact: true }).click()
      await expect(customer.getByRole('dialog')).toBeVisible()
      await capture('map')
      await customer.getByRole('button', { name: 'List view', exact: true }).click()
      await capture('browse')
    } finally {
      await context.close()
    }
  })
}
