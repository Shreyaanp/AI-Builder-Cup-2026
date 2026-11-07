import { expect, test, type Page } from '@playwright/test'

// Release batch B2: the customer app never looks broken (audit 22 Oct: A-4, A-5, A-17, A-18,
// A-20). Local dev seeds the tour story shops before serving.
const SHOP = 'demo-story-singapore-bakery'

test.beforeEach(async ({ page, request }) => {
  const seeded = await request.get(`/api/v1/public/shops/${SHOP}`)
  expect(seeded.ok(), 'Local dev must seed the tour story before serving').toBeTruthy()
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
})

function countBootstrap(page: Page) {
  const seen = { count: 0 }
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/bootstrap') seen.count += 1
  })
  return seen
}

test('A-4: a page load reads the app configuration once, so a shared IP is not used up', async ({
  page,
}) => {
  const bootstrap = countBootstrap(page)
  await page.goto('/explore/saved')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Saved', level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(bootstrap.count).toBe(1)

  bootstrap.count = 0
  await page.goto(`/explore/s/${SHOP}`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(bootstrap.count).toBe(1)
})

test('A-4: a rate-limited shop read shows the app’s own error with a retry that works', async ({
  page,
}) => {
  let refuse = true
  await page.route(`**/api/v1/public/shops/${SHOP}`, (route) =>
    refuse
      ? route.fulfill({
          status: 429,
          headers: { 'Retry-After': '30' },
          json: { detail: 'RATE_LIMITED' },
        })
      : route.fallback(),
  )
  await page.goto(`/explore/s/${SHOP}`)
  await expect(
    page.getByRole('heading', { name: 'We couldn’t load this shop right now.' }),
  ).toBeVisible()
  await expect(page.getByText('Too Many Requests')).toHaveCount(0)
  refuse = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('heading', { name: 'We couldn’t load this shop right now.' }),
  ).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
})

test('A-5: a failing configuration read never offers the local preview; retry recovers', async ({
  page,
}) => {
  let failing = true
  const bootstrap = countBootstrap(page)
  await page.route('**/api/v1/bootstrap', (route) =>
    failing ? route.fulfill({ status: 503, json: { detail: 'unavailable' } }) : route.fallback(),
  )
  await page.goto('/explore/chats')
  await expect(
    page.getByText('Sign-in is unavailable right now. Browsing still works.'),
  ).toBeVisible({ timeout: 20_000 })
  // It was tried again before giving up.
  expect(bootstrap.count).toBeGreaterThan(1)
  await expect(page.getByText(/local preview/i)).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible()
  await expect(
    page.getByText('Sign-in is unavailable right now. Browsing still works.'),
  ).toHaveCount(0)
})

test('A-17: a server error in shop chat does not blame the connection', async ({ page }) => {
  let asks = 0
  await page.route(`**/api/v1/public/shops/${SHOP}/ask`, (route) => {
    asks += 1
    return route.fulfill({ status: 503, json: { detail: 'Could not answer right now.' } })
  })
  await page.goto(`/explore/s/${SHOP}`)
  await page.getByRole('button', { name: 'Chat with the shop' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Hours', exact: true }).click()
  await expect(
    dialog.getByText('The shop assistant is busy right now. Try again in a moment.'),
  ).toBeVisible()
  await expect(dialog.getByText(/connection/i)).toHaveCount(0)
  // One quiet second try before the customer sees the error.
  expect(asks).toBe(2)
})

test('A-18: offline, a screen that cannot open keeps the nav and opens itself back online', async ({
  page,
  context,
}) => {
  // The Passport screen's code never reached this phone (it was offline before it could).
  await page.route('**/src/features/passport/Passport.tsx*', (route) => route.abort())
  await page.goto('/explore/saved')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Passport' })
    .click()
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByText('Could not load this screen')).toHaveCount(0)
  await page.unroute('**/src/features/passport/Passport.tsx*')
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Passport', level: 1 })).toBeVisible({
    timeout: 15_000,
  })
})

test('A-18: offline, a recently opened shop and the Passport open from this phone', async ({
  page,
  context,
}) => {
  await page.goto(`/explore/s/${SHOP}`)
  const name = page.getByRole('heading', { level: 1 }).first()
  await expect(name).toBeVisible()
  const shopName = (await name.textContent())!.trim()
  await page.goto('/explore/passport')
  await expect(page.getByRole('heading', { name: 'Passport', level: 1 })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  await page.goto('/explore/saved')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  // The shop, reopened offline (a link inside the app).
  await page.evaluate((path) => {
    history.pushState(null, '', path)
    dispatchEvent(new PopStateEvent('popstate'))
  }, `/explore/s/${SHOP}`)
  await expect(page.getByRole('heading', { name: shopName, level: 1 })).toBeVisible()
  await expect(page.getByText('Couldn’t refresh — showing the last menu we loaded.')).toBeVisible()
  await expect(page.getByText('We couldn’t load this shop right now.')).toHaveCount(0)

  // The Passport tab, offline: what this phone kept, said plainly, with the nav.
  await page.evaluate(() => {
    history.pushState(null, '', '/explore/passport')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Passport', level: 1 })).toBeVisible()
  await expect(page.getByText('You’re offline. Showing what you saw last.')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByText('Your passport couldn’t load.')).toHaveCount(0)
  await context.setOffline(false)
})

test('A-20: a shared shop link opens the shop on a new phone, not the intro', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  try {
    await page.route('**/*', (route) =>
      ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
        ? route.fallback()
        : route.abort(),
    )
    await page.goto(`/explore/s/${SHOP}`)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Chat with the shop' }).first()).toBeVisible()
    await expect(page.getByText('Find local shops near you')).toHaveCount(0)
    // The intro still waits for a later visit to the app's front door.
    await page.goto('/explore/')
    await expect(page.getByText('Find local shops near you')).toBeVisible()
  } finally {
    await context.close()
  }
})
