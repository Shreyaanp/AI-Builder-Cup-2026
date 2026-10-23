import { expect, test, type Page } from '@playwright/test'
import { cleanAreaText } from '../src/features/discover/areaText.js'
import { categoryArt } from '../src/features/frontdoors/photos.js'
import { discoverCopy, translations } from '../src/features/discover/strings.js'
import { LOCALES } from '../src/i18n/locales.js'

// A-8, A-32, A-34, A-35, A-36, A-37: the customer Ask answer cards and their copy.
// The first page load of a cold dev server is slow.
test.describe.configure({ timeout: 60_000 })

const cut = "If you're looking for a great brew, **Nothing Before Coffee Cafe"

test('A-8: a cut-off markdown answer never shows marks or ends inside a mark or a word', () => {
  expect(cleanAreaText(cut)).toBe("If you're looking for a great brew…")
  expect(cleanAreaText('**Third Wave Coffee** is open now. Try **Black Baza')).toBe(
    'Third Wave Coffee is open now.',
  )
  expect(cleanAreaText('Whole answer with **bold** and a [link](https://x.test).')).toBe(
    'Whole answer with bold and a link.',
  )
  expect(cleanAreaText('Try these:\n* **Toit** is lively\n* **Glen’s** is calm')).toBe(
    'Try these:\n• Toit is lively\n• Glen’s is calm',
  )
  const capped = `${'Good coffee is easy to find here. '.repeat(17)}Another cafe called Nothing Bef`
  expect(capped.length).toBeGreaterThanOrEqual(580)
  expect(cleanAreaText(capped).endsWith('here.')).toBe(true)
})

const googlePlace = {
  id: 'g1',
  name: 'Blue Tokai Coffee Roasters UB City Table Spaces Cubbon Road Extension',
  source: 'google',
  category: 'cafe',
  lat: 12.9719,
  lng: 77.6412,
  distance_m: 300,
  open_now: true,
  rating: 4.5,
  user_rating_count: 120,
  currency: 'INR',
  items: [],
  matched: [],
  sold_out: [],
  locally_made: false,
  demo: false,
  demo_shop: false,
  photo_url: '/api/v1/place-photo?name=places%2Fg1%2Fphotos%2Fp&sig=x',
  photo_authors: ['Mohammed Tahoor'],
  halal: null,
  google_maps_uri: 'https://maps.google.com/?cid=1',
}

const ours = (id: string, name: string, price: number) => ({
  id,
  name,
  source: 'chalkboard',
  category: 'Cafe',
  lat: 12.9719,
  lng: 77.6412,
  distance_m: 450,
  open_now: true,
  currency: 'INR',
  items: [{ name: 'Filter coffee', price, unit: 'cup', available: true }],
  matched: [{ name: 'Filter coffee', price, unit: 'cup', available: true }],
  sold_out: [],
  demo_shop: true,
})

async function answerWith(page: Page, area: string | null, places = 4) {
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' } }),
    )
  })
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/place-photo?**', (route) =>
    route.fulfill({ status: 404, json: { detail: 'PHOTO_NOT_AVAILABLE' } }),
  )
  await page.route('**/api/v1/discover/ask', (route) =>
    route.fulfill({
      json: {
        intent: { keywords: ['coffee'], followups: [], sort: 'best' },
        mode: 'keywords',
        groups: [
          {
            id: 'best',
            places: Array.from({ length: places }, (_, i) => ours(`ours-${i}`, `Kapi ${i}`, 1500)),
          },
          { id: 'more', places: [googlePlace] },
        ],
        ...(area === null ? {} : { area: { status: 'ok', text: area, sources: [] } }),
      },
    }),
  )
}

async function ask(page: Page, question: string) {
  const composer = page.getByRole('textbox', { name: 'Ask about anything nearby' })
  await composer.fill(question)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

test('A-8: the Google Maps answer card shows clean text, not raw markdown', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await answerWith(page, cut, 1)
  await page.goto('/explore/')
  await ask(page, 'Coffee near me')
  const card = page.getByRole('region', { name: 'Google Maps', exact: true })
  await expect(card).toBeVisible()
  await expect(card).toContainText("If you're looking for a great brew…")
  expect(await card.innerText()).not.toMatch(/[*_`#[\]]/)
})

test('A-37: a photo credit is labelled as a credit and a long place name wraps cleanly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await answerWith(page, null, 1)
  await page.goto('/explore/')
  await ask(page, 'Coffee near me')
  const row = page.getByRole('link', { name: /Blue Tokai/ })
  await expect(row).toBeVisible()
  const credit = row.getByTestId('photo-credit')
  await expect(credit).toHaveText('Photo by Mohammed Tahoor')
  await expect(row).toContainText('Google Maps')
  await expect(row).not.toContainText('Google Maps · ')
  const name = row.getByRole('heading', { level: 4 })
  await expect(name).toHaveAttribute('title', /Cubbon Road Extension$/)
  // Two lines at most, and the row never grows sideways.
  const box = await name.boundingBox()
  expect(box!.height).toBeLessThan(48)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('A-35: after a follow-up the first new card is not under the sticky header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await answerWith(page, null, 4)
  // The follow-up's answer is held back, as on a real connection: the page is still short
  // when the app scrolls to it.
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  let calls = 0
  await page.route('**/api/v1/discover/ask', async (route) => {
    if (++calls === 2) await held
    await route.fallback()
  })
  await page.goto('/explore/')
  await ask(page, 'Coffee near me')
  await expect(page.getByRole('article', { name: 'Coffee near me' })).toContainText('Kapi 0')
  await ask(page, 'Cheaper?')
  const turn = page.getByRole('article', { name: 'Cheaper?' })
  await expect(turn).toBeVisible()
  release()
  await expect(turn).toContainText('Kapi 0')
  const header = await page.locator('header[data-app-header]').first().boundingBox()
  const bottom = header!.y + header!.height
  // The question sits right under the header: nothing of the earlier answer is left behind it.
  await expect.poll(async () => (await turn.boundingBox())!.y).toBeGreaterThanOrEqual(bottom)
  expect((await turn.boundingBox())!.y).toBeLessThanOrEqual(bottom + 24)
  // The follow-up's question and its first card are both on screen, none under the header.
  const first = await turn.getByRole('link', { name: /Kapi 0/ }).boundingBox()
  expect(first!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
  expect(first!.y + first!.height).toBeLessThanOrEqual(844)
})

test('A-34: tapping New conversation on a touch screen leaves no tooltip stuck on screen', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await answerWith(page, null, 1)
  await page.goto('/explore/')
  await ask(page, 'Coffee near me')
  await expect(page.getByRole('article', { name: 'Coffee near me' })).toContainText('Kapi 0')
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  const reset = page.getByRole('button', { name: 'New conversation' })
  // A tap also fires a mouse hover that never ends; fake timers play out the tooltip's open
  // delay (100 ms) without waiting.
  await page.clock.install()
  await reset.dispatchEvent('mouseover')
  await page.clock.runFor(2000)
  await expect(reset).toBeVisible()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await context.close()
})

test('A-36: the Browse search box suggests nothing tied to one country', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done')
    localStorage.setItem(
      'chalkboard.discover.filters',
      JSON.stringify({ place: { lat: 12.9719, lng: 77.6412, label: 'Bengaluru' } }),
    )
  })
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: [], google_unavailable: false } }),
  )
  await page.goto('/explore/browse')
  const box = page.getByRole('searchbox', { name: /Search nearby/ })
  await expect(box).toBeVisible()
  const placeholder = (await box.getAttribute('placeholder')) ?? ''
  expect(placeholder).not.toMatch(/teh|tarik/i)
  for (const locale of LOCALES) {
    const hint = discoverCopy(locale).hint
    expect(hint, locale).not.toMatch(
      /teh|tarik|तारिक|তারিক|తారిక్|ತಾರಿಕ್|拉茶|テータリック|타릭|ชาชัก/i,
    )
  }
  expect(Object.keys(translations).length).toBeGreaterThan(5)
})

test('A-32: florist, tailor, hardware and salon get their own picture, never the coffee cup', () => {
  expect(categoryArt('Florist')).toBe('/art/category-florist.svg')
  expect(categoryArt('Tailor')).toBe('/art/category-tailor.svg')
  expect(categoryArt('Hardware')).toBe('/art/category-hardware.svg')
  expect(categoryArt('Salon')).toBe('/art/category-salon.svg')
  expect(categoryArt('Cafe')).toBe('/art/category-kopi.svg')
  expect(categoryArt('Something unknown')).toBe('/art/category-shop.svg')
})

test('A-32: the demo shop list names the item next to its price, with the right picture', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/explore/demo')
  const rows = page
    .getByRole('list', { name: /Browse shops/ })
    .last()
    .getByRole('listitem')
  await expect(rows).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    // A price always follows the item it is for ("Filter coffee ₹60.00"), never a bare "Cafe · ₹60.00".
    await expect(rows.nth(i)).toContainText(/[A-Za-z] ₹\d/)
    await expect(rows.nth(i)).not.toContainText(/· ₹\d/)
  }
  const tailor = rows.filter({ hasText: 'Needle Courtyard' })
  await expect(tailor.locator('img').first()).toHaveAttribute('src', /category-tailor\.svg$/)
})
