import { expect, test, type Page } from '@playwright/test'

// Release batch B3: the customer's place (audit A-7, A-9, A-11, A-24, A-33). Google and the
// phone's location are mocked; nothing leaves the machine.
const INDIRANAGAR = { lat: 12.9784, lng: 77.6408 }
const TIONG_BAHRU = { lat: 1.2847, lng: 103.832 }

async function localOnly(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

async function freshVisit(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 })
  await localOnly(page)
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.goto('/explore/')
  await expect(page.getByRole('search').getByRole('textbox')).toBeVisible({ timeout: 20_000 })
}

test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata' })

test('A-7 a fresh visit has one input, the Ask bar, and a quiet area chip', async ({ page }) => {
  await freshVisit(page)
  // The chip names the default area; no second card asks for the same thing.
  await expect(page.getByRole('button', { name: /Indiranagar/ }).first()).toBeVisible()
  await expect(page.getByText('Start with your neighbourhood')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use my location' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'City or area' })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(1)
  await expect(page.getByRole('search').getByRole('textbox')).toBeVisible()
})

for (const width of [360, 390]) {
  test(`A-33 the area chip opens the area sheet with focus at ${width}`, async ({ page }) => {
    await freshVisit(page, width)
    // The page behind an open sheet is hidden from the accessibility tree: find the chip by label.
    const chip = page.locator('button[aria-label^="Area: Indiranagar"]')
    // The area name is whole at 360, not "Indira…".
    const label = chip.locator('span').filter({ hasText: /^Indiranagar$/ })
    await expect(label).toBeVisible()
    expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    await chip.click()
    await expect(chip).toHaveAttribute('aria-expanded', 'true')
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('heading', { name: 'City or area' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Use my location' })).toBeVisible()
    await expect(sheet.getByRole('textbox', { name: 'City or area' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
    await expect(chip).toBeFocused()
  })
}

test('A-33 choosing an area in the sheet changes the chip', async ({ page }) => {
  await freshVisit(page)
  await page.route('**/api/v1/discover/place?q=*', (route) =>
    route.fulfill({
      json: { lat: 12.9352, lng: 77.6245, label: 'Koramangala, Bengaluru, Karnataka, India' },
    }),
  )
  await page.getByRole('button', { name: /Area: Indiranagar/ }).click()
  const field = page.getByRole('dialog').getByRole('textbox', { name: 'City or area' })
  await field.fill('Koramangala')
  await field.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The neighbourhood, not the whole address.
  await expect(page.getByRole('button', { name: 'Area: Koramangala. Change' })).toBeVisible()
})

async function useMyLocation(page: Page, label: string) {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 12.9716, longitude: 77.6, accuracy: 15 })
  await page.route('**/api/v1/discover/place?lat=*', (route) =>
    route.fulfill({ json: { lat: 12.9716, lng: 77.6, label } }),
  )
  await page.getByRole('button', { name: /Area: / }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('A-9 "Use my location" shows the neighbourhood name', async ({ page }) => {
  await freshVisit(page)
  await useMyLocation(page, 'Ashok Nagar')
  await expect(page.getByRole('button', { name: 'Area: Ashok Nagar. Change' })).toBeVisible()
  await expect(page.getByText(/shops around Ashok Nagar|near Ashok Nagar/i).first()).toBeVisible()
})

test('A-9 a house number or full address is never shown as the area', async ({ page }) => {
  await freshVisit(page)
  // What the server used to send: the whole street address with its PIN.
  await useMyLocation(
    page,
    "67/1, KG Halli, D' Souza Layout, Ashok Nagar, Bengaluru, Karnataka 560001, India",
  )
  await expect(page.getByRole('button', { name: 'Area: Nearby. Change' })).toBeVisible()
  const text = (await page.locator('main').innerText()) + (await page.title())
  expect(text).not.toMatch(/67\/1|560001|KG Halli|D' Souza/)
})

test('A-11 Browse shows each Google place at its real distance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await page.addInitScript((place) => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { ...place, label: 'Tiong Bahru' } }),
    )
  }, TIONG_BAHRU)
  const answered = page.waitForResponse(
    (response) => response.url().includes('/api/v1/discover?') && response.status() === 200,
  )
  await page.goto('/explore/browse')
  type Row = {
    id: string
    name: string
    source: string
    lat: number
    lng: number
    distance_m: number
  }
  const { places } = (await (await answered).json()) as { places: Row[] }
  const google = places.filter((row) => row.source === 'google')
  expect(google.length).toBeGreaterThanOrEqual(2)

  const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const rad = Math.PI / 180
    const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
    return Math.hypot(x, (b.lat - a.lat) * rad) * 6_371_000
  }
  for (const row of google)
    expect(Math.abs(row.distance_m - metres(TIONG_BAHRU, row))).toBeLessThan(5)
  // Not one distance for every row (the audit saw "10 m" on all of them).
  expect(new Set(google.map((row) => row.distance_m)).size).toBeGreaterThanOrEqual(2)

  const rows = page.getByRole('list', { name: /around me/i }).getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 20_000 })
  const shown = new Set<string>()
  for (const row of google) {
    const card = rows.filter({ hasText: row.name }).first()
    await expect(card).toBeVisible()
    const text = (await card.innerText()).replace(/\s+/g, ' ')
    const rounded = Math.round(row.distance_m / 10) * 10
    const expected = rounded < 1000 ? `${rounded} m` : `${(row.distance_m / 1000).toFixed(1)} km`
    expect(text).toContain(expected)
    shown.add(expected)
  }
  expect(shown.size).toBeGreaterThanOrEqual(2)
})

test('A-24 Near you now keeps its room when the area has no shops', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/discover?**', async (route) => {
    await held
    await route.fulfill({ json: { mode: 'demo', google_unavailable: false, places: [] } })
  })
  await page.addInitScript((place) => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { ...place, label: 'Indiranagar' } }),
    )
  }, INDIRANAGAR)
  await page.goto('/explore/')
  const today = page.getByRole('button', { name: /Today.s 7/ })
  await expect(today).toBeVisible({ timeout: 20_000 })
  const loading = page.getByRole('list', { name: 'Near you now' })
  await expect(loading).toHaveAttribute('aria-busy', 'true')
  const before = (await today.boundingBox())!.y
  release()
  await expect(page.getByText('No Chalkboard shops here yet.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Near you now' })).toBeVisible()
  // Nothing below the section moved when the skeletons gave way.
  expect(Math.abs((await today.boundingBox())!.y - before)).toBeLessThanOrEqual(1)
})
