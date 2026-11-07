import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { publish } from '../qa/support.js'
import { enter } from './support.js'

// Story: a customer asks about the area ("best kopi near me", "parking near…"). Our shop that
// sells it comes first, Google's live local answer (Gemini grounding with Google Maps; labelled
// sample answer offline) follows with its Google Maps sources, and every place is on one map,
// pins and cards linked both ways. External hosts are blocked, so the map is the honest local
// fallback (straight-line distances); a real Google map needs the live browser key.
// Koramangala, so these shops never crowd other stories' Indiranagar answers (4.5 km away).
const AREA = { lat: 12.9352, lng: 77.6245, label: 'Koramangala' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript((area) => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
  }, AREA)
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
})

async function appearance(page: Page, mode: 'light' | 'dark') {
  await page.addInitScript(
    (value) =>
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: value })),
    mode,
  )
}

async function ask(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

async function axe(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
}

/** A shared shop selling kopi, pinned by its owner at a point of its own in Koramangala. The
 * customer asks from that point, so shops left by earlier runs (same menu) never tie with it. */
async function seeded(page: Page) {
  await enter(page)
  const name = `Courtyard Kopi ${Date.now().toString().slice(-6)}`
  const point = {
    lat: Number((AREA.lat + (Math.random() - 0.5) * 0.01).toFixed(6)),
    lng: Number((AREA.lng + (Math.random() - 0.5) * 0.01).toFixed(6)),
  }
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      revision: 0,
      owner_location: { ...point, accuracy_m: 0, source: 'pin' },
      business: {
        name,
        category: 'Cafe',
        location: 'Koramangala, Bengaluru',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        halal: 'not_stated',
        locally_made: true,
        phone: '',
        payment_methods: ['UPI', 'cash'],
        delivery: 'Pickup',
        weekly_hours: [{ day: 'thu', open: '07:00', close: '20:00', closed: false }],
        reward_text: 'Your eighth kopi is free',
        stamps_needed: 8,
      },
      products: [{ name: 'Kopi', price: 1800, unit: 'cup', category: 'Drinks' }],
    },
  })
  expect(prepared.ok(), await prepared.text()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok(), await approved.text()).toBe(true)
  const id = (await approved.json()).business_id as string
  await publish(page, id)
  await page.addInitScript(
    (area) => {
      localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
    },
    { ...point, label: AREA.label },
  )
  return { id, name }
}

for (const mode of ['light', 'dark'] as const)
  test(`area question: our shop first, Google Maps answer with sources, linked map (${mode})`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120_000)
    const device = isMobile ? 'phone' : 'desktop'
    await appearance(page, mode)
    const ours = await seeded(page)
    await page.goto('/explore/')
    await ask(page, 'Best kopi near me')

    // A shop of ours that sells kopi is the first answer, with the exact item and price.
    const first = page.locator('li[id^="pick-"]').first()
    const card = first.getByRole('link').first()
    await expect(card).toContainText(/₹18(?![.\d])/, { timeout: 20_000 })
    const id = (await first.getAttribute('id'))!.slice('pick-'.length)
    const name = (await first.getByRole('heading').textContent())!
    expect(id).toBe(ours.id)

    // Google's area answer, its Google Maps sources and the untranslated attribution.
    const google = page.getByRole('region', { name: 'Google Maps' })
    await expect(google).toContainText('Sample answer')
    await expect(google.getByRole('link', { name: /Sample filter coffee house/ })).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\//,
    )
    await expect(google.getByText('Google Maps', { exact: true })).toBeVisible()
    await expect(google).toContainText('Sample answer · demo map data')
    // Ours is above Google's answer on the page.
    const [ourTop, googleTop] = await Promise.all([
      card.evaluate((node) => node.getBoundingClientRect().top),
      google.evaluate((node) => node.getBoundingClientRect().top),
    ])
    expect(ourTop).toBeLessThan(googleTop)

    // One map: our shop numbered, Google places in their own colour, honest fallback label.
    const map = page.getByRole('group', { name: 'Map of these places' })
    await expect(map).toBeVisible()
    await expect(page.getByText('Map unavailable · straight-line distances')).toBeVisible()
    await expect(page.getByText('Chalkboard shops', { exact: true })).toBeVisible()
    await expect(page.getByText('Google places', { exact: true })).toBeVisible()
    // Pin → card: choosing our pin lights up its card. By keyboard, since pins of shops left
    // nearby by earlier runs (or the phone's bottom bar) can sit on top of it.
    const ourPin = map.getByRole('button', { name })
    await ourPin.focus()
    await ourPin.press('Enter')
    await expect(card).toHaveAttribute('data-selected', 'true')
    await map.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `docs/stories/maps-1-answer-${device}-${mode}.png` })
    await axe(page)

    // The full map: map on top, results in a draggable sheet (phone) or a side list (desktop).
    await page.getByRole('button', { name: 'Open map' }).click()
    const dialog = page.getByRole('dialog', { name: 'Map of results' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/^\d+ places$/)).toBeVisible()
    const coffee = dialog.getByRole('button', { name: /Sample filter coffee house/ }).last()
    if (isMobile) {
      const handle = dialog.getByRole('button', { name: 'Show list' })
      await expect(handle).toHaveAttribute('aria-expanded', 'false')
      await handle.click()
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
    }
    // Card → pin: tapping a row selects its pin.
    await coffee.click()
    await expect(coffee).toHaveAttribute('aria-pressed', 'true')
    await expect(
      dialog.getByRole('group', { name: 'Map of results' }).getByRole('button', {
        name: 'Sample filter coffee house',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.getByRole('link', { name: 'Open in Google Maps' })).toBeVisible()
    // Pin → row: tapping our pin selects our row, which opens the shop.
    await dialog
      .getByRole('group', { name: 'Map of results' })
      .getByRole('button', { name })
      .click()
    await expect(dialog.getByRole('button', { name: `${name} Kopi` })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(dialog.getByRole('link', { name: 'Open shop' })).toHaveAttribute(
      'href',
      `/explore/s/${id}`,
    )
    await page.waitForTimeout(500)
    await page.screenshot({ path: `docs/stories/maps-2-explorer-${device}-${mode}.png` })
    await axe(page)
    await dialog.getByRole('button', { name: 'Close map' }).first().click()
    await expect(dialog).toHaveCount(0)
  })

test('parking question: Google answer pins places even when we sell nothing for it', async ({
  page,
  isMobile,
}) => {
  await page.goto('/explore/')
  await ask(page, 'Is there parking near the market?')
  const google = page.getByRole('region', { name: 'Google Maps' })
  await expect(google).toContainText('car park', { timeout: 20_000 })
  await expect(page.getByRole('group', { name: 'Map of these places' })).toBeVisible()
  // A Google pin opens the full map focused on it.
  await page
    .getByRole('group', { name: 'Map of these places' })
    .getByRole('button', { name: 'Sample public car park' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Map of results' })
  await expect(
    dialog.getByRole('button', { name: /Sample public car park/ }).last(),
  ).toHaveAttribute('aria-pressed', 'true')
  if (isMobile) await page.screenshot({ path: 'docs/stories/maps-3-parking-phone.png' })
})

test('switch off or Google down: one honest line, our list and straight-line distances', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await seeded(page)
  let status: 'off' | 'unavailable' = 'off'
  await page.route('**/api/v1/discover/ask', async (route) => {
    // The app asks for a stream; this rewrite takes the one-shot JSON answer instead.
    const response = await route.fetch({
      headers: { ...route.request().headers(), accept: 'application/json' },
    })
    const body = await response.json()
    body.area = { status, text: '', sources: [], places: [], widget_token: null, demo: false }
    await route.fulfill({ response, json: body })
  })
  await page.goto('/explore/')
  await ask(page, 'Best kopi near me')
  await expect(page.locator('li[id^="pick-"]').first()).toContainText(/₹18(?![.\d])/, {
    timeout: 20_000,
  })
  await expect(page.getByText('Live Google Maps answers are off.', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Google Maps' })).toHaveCount(0)
  await expect(page.locator('li[id^="pick-"]').first()).toContainText(/\d+ (m|km)/)
  status = 'unavailable'
  await page.getByRole('button', { name: 'New conversation' }).click()
  await ask(page, 'Best kopi near me')
  await expect(
    page.getByText('Google Maps couldn’t answer just now.', { exact: false }),
  ).toBeVisible({
    timeout: 20_000,
  })
  await page.screenshot({ path: 'docs/stories/maps-4-fallback.png' })
})

for (const mode of ['light', 'dark'] as const)
  test(`browse map view shows pins on a street sketch, never a blank grid (${mode})`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(90_000)
    await appearance(page, mode)
    const ours = await seeded(page)
    // Browse for this run's shop by name: shops left nearby by earlier runs would overlap its pin.
    await page.goto(`/explore/browse?view=map&q=${encodeURIComponent(ours.name)}`)
    const map = page.getByRole('group', { name: 'Map of results' })
    await expect(map).toBeVisible({ timeout: 20_000 })
    const pin = map.getByRole('button', { name: ours.name })
    await expect(pin).toBeVisible({ timeout: 20_000 })
    await pin.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('status').getByRole('link', { name: 'Open shop' })).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: `docs/stories/maps-5-browse-${isMobile ? 'phone' : 'desktop'}-${mode}.png`,
    })
    await axe(page)
  })
