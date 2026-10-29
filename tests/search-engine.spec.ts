import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { publish } from './qa/support.js'
import { enter } from './stories/support.js'

// Track H: one search engine. A customer asks in their own words and meaning finds the shop
// (no shared keyword), the shop page shows "Similar nearby", and what they opened comes back as
// a personal pick with its reason. Offline the engine runs on the fixture embedder.
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

async function seedCafe(page: Page, name: string) {
  const response = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      // Coordinates in the fields are never trusted from a client; the owner's map pin is.
      owner_location: { lat: INDIRANAGAR.lat, lng: INDIRANAGAR.lng, accuracy_m: 0, source: 'pin' },
      business: {
        name,
        category: 'Cafe',
        location: INDIRANAGAR.label,
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        phone: '',
      },
      products: [{ name: 'Kopi', price: 1800, unit: 'cup', category: 'Drinks' }],
    },
  })
  expect(response.ok()).toBe(true)
  const proposal = await response.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok(), await approved.text()).toBe(true)
  const { business_id: businessId } = (await approved.json()) as { business_id: string }
  await publish(page, businessId)
}

async function ask(page: Page, text: string) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

async function axe(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`search engine story (${scheme}): meaning, similar nearby, then a personal pick`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: 'light' })
    const shot = (name: string) =>
      page.screenshot({
        path: `docs/stories/search-${name}${isMobile ? '' : '-desktop'}${scheme === 'dark' ? '-dark' : ''}.png`,
      })
    await enter(page)
    const name = `Courtyard Chai ${Date.now().toString().slice(-6)}`
    const nearbyName = `Nearby Kopi ${Date.now().toString().slice(-6)}`
    await seedCafe(page, name)
    await seedCafe(page, nearbyName)
    const asks: Record<string, unknown>[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/discover/ask')) asks.push(request.postDataJSON())
    })

    // 1. No word in common with "Kopi": the engine finds it by meaning.
    await page.goto('/explore/')
    // Customer pages keep their own light/dark choice (light by default).
    if (scheme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await ask(page, 'a hot brew')
    // (The local test database holds many fixture cafés; any of them is a correct answer.)
    const card = page.locator('a[href^="/explore/s/"]').filter({ hasText: 'Kopi' }).first()
    await expect(card).toContainText(/₹18(?![.\d])/, { timeout: 20_000 })
    const id = decodeURIComponent((await card.getAttribute('href'))!.split('/').pop()!)
    await page.waitForTimeout(900)
    await shot('1-meaning')
    await axe(page)

    // 2. The shop page: "Similar nearby", by the whole shop or by one of its items.
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/explore/s/${encodeURIComponent(id)}`))
    const similar = page.getByTestId('similar-nearby')
    await similar.scrollIntoViewIfNeeded()
    await expect(similar.getByRole('heading', { name: 'Similar nearby' })).toBeVisible({
      timeout: 15_000,
    })
    const shop = similar.getByRole('button', { name: 'Like this shop' })
    await expect(shop).toHaveAttribute('aria-pressed', 'true')
    await expect(similar.getByRole('link').first()).toBeVisible()
    expect(await similar.getByRole('link').count()).toBeGreaterThan(0)
    const links = similar.getByRole('link')
    await expect(links.first()).not.toHaveAttribute('href', `/explore/s/${id}`)
    await similar.getByRole('button', { name: 'Kopi', exact: true }).click()
    await expect(similar.getByRole('button', { name: 'Kopi', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      similar.getByRole('link').first().or(similar.getByText('Nothing similar nearby yet.')),
    ).toBeVisible()
    await page.waitForTimeout(500)
    await shot('2-similar')
    await axe(page)

    // 3. Back in the conversation: the shop they opened is now a personal pick, with why.
    await page.getByRole('link', { name: 'Back', exact: true }).click()
    await page.getByRole('button', { name: 'New conversation' }).click()
    await ask(page, 'kopi')
    const because = page
      .getByTestId('pick-because')
      .filter({ hasText: 'You looked at this before' })
    await expect(because.first()).toBeVisible({ timeout: 20_000 })
    expect(asks.at(-1)).toMatchObject({ opened: [id] })
    const first = page.locator('a[href^="/explore/s/"]').first()
    await expect(first).toHaveAttribute('href', `/explore/s/${id}`)
    await page.waitForTimeout(900)
    await shot('3-for-you')
    await axe(page)
  })
}
