import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { canonicalCustomerPath, resolveApp, safeCustomerOrigin } from '../src/app/router.ts'
import { frontEnglish, frontTranslations } from '../src/features/frontdoors/strings.ts'
import { LOCALES } from '../src/i18n/locales.ts'

const shopId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const shopName = 'Neighbourhood Kopi'
const place = {
  id: shopId,
  name: shopName,
  source: 'chalkboard',
  category: 'kopi',
  lat: 1.2847,
  lng: 103.832,
  distance_m: 90,
  open_now: true,
  currency: 'SGD',
  demo: true,
  items: [{ name: 'Kopi', price: 180, unit: 'cup', available: true }],
  sold_out: ['Kaya toast'],
}

async function fixture(page: Page) {
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: [place], google_unavailable: false } }),
  )
  await page.route(`**/api/v1/public/shops/${shopId}`, (route) =>
    route.fulfill({
      json: {
        id: shopId,
        name: shopName,
        category: 'Kopi',
        location: 'Tiong Bahru, Singapore',
        hours: '07:00–19:00',
        phone: '',
        currency: 'SGD',
        open_now: true,
        products: [
          { name: 'Kopi', price: 180, unit: 'cup', available: true },
          { name: 'Kaya toast', price: 240, unit: 'set', available: false },
        ],
        facts: { halal: 'not_stated', payment_methods: ['cash', 'paynow'] },
      },
    }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
})

test('one host/path policy, legacy URLs and origin validation', () => {
  const cases = [
    ['https://chalkboard.shreyaan.work/', 'landing'],
    ['https://chalkboard.shreyaan.work/explore/map', 'customer'],
    ['https://business.chalkboard.shreyaan.work/', 'business'],
    ['https://legacy.run.app/', 'business'],
    ['http://127.0.0.1:3200/', 'business'],
    ['http://127.0.0.1:3200/?app=landing', 'landing'],
    ['http://127.0.0.1:3200/?app=customer', 'customer'],
  ]
  for (const [url, app] of cases) expect(resolveApp(new URL(url))).toBe(app)
  expect(canonicalCustomerPath('/discover')).toBe('/explore/')
  expect(canonicalCustomerPath(`/s/${shopId}`)).toBe(`/explore/s/${shopId}`)
  expect(safeCustomerOrigin('https://chalkboard.shreyaan.work')).toBe(
    'https://chalkboard.shreyaan.work',
  )
  expect(safeCustomerOrigin('https://user:password@customer.example')).toBeNull()
})

test('marketing has two paths, all sections, no splash or auth bootstrap', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?app=landing')
  await expect(
    page.getByRole('heading', { name: 'Small shops. Big neighbourhood energy.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Find places near me' }).first()).toHaveAttribute(
    'href',
    '/explore/',
  )
  await expect(page.getByRole('link', { name: 'For businesses' }).first()).toHaveAttribute(
    'href',
    'https://business.chalkboard.shreyaan.work',
  )
  await expect(page.getByText(/Social proof placeholder/)).toBeVisible()
  expect(await page.locator('[data-testid="brand-splash"]').count()).toBe(0)
  expect(await page.locator('link[rel="manifest"]').count()).toBe(0)
  expect(
    requests.some((url) => url.includes('/bootstrap') || /ChalkScene.*\.(tsx|js)/.test(url)),
  ).toBe(false)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('separate standalone manifests and real-loading splash', async ({ page }) => {
  await page.route('**/api/v1/discover?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.fulfill({ json: { mode: 'demo', places: [] } })
  })
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.goto('/explore/?app=customer')
  await expect(page.getByTestId('brand-splash')).toBeVisible()
  await expect(page.getByTestId('brand-splash')).toHaveCount(0)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/explore/manifest.webmanifest',
  )
  const customer = await (await page.request.get('/explore/manifest.webmanifest')).json()
  const business = await (await page.request.get('/manifest-business.webmanifest')).json()
  expect(customer.name).toBe('Chalkboard')
  expect(customer.scope).toBe('/explore/')
  expect(business.name).toBe('Chalkboard Business')
  expect(business.id).not.toBe(customer.id)
  for (const manifest of [customer, business]) {
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBeTruthy()
    const mask = manifest.icons.find((icon: { purpose: string }) => icon.purpose === 'maskable')
    expect(mask).toBeTruthy()
    expect((await page.request.get(mask.src)).ok()).toBe(true)
  }
  await page.goto('/?app=business')
  await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible()
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest-business.webmanifest',
  )
})

test('first customer journey: denied location, interests, coach mark and return', async ({
  page,
}) => {
  await fixture(page)
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok: unknown, denied: () => void) => denied() },
    }),
  )
  await page.goto('/?app=customer')
  await expect(page.getByText('Step 1 of 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('Location unavailable. Please choose an area.')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What are you in the mood for?' })).toBeFocused()
  await page.getByRole('button', { name: 'Kopi', exact: true }).click()
  await page.getByRole('button', { name: 'Explore my neighbourhood' }).click()
  await expect(page.getByText(/Tap a category to narrow/)).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What’s around me?' })).toBeVisible()
  await expect(page.getByText(/Tap a category to narrow/)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('chalkboard.customer.journey'))).toBe(
    'done',
  )
})

for (const mode of ['light', 'dark'] as const) {
  test(`customer home, shop and map: ${mode}, keyboard and 412px screenshots`, async ({
    page,
  }, info) => {
    await fixture(page)
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    if (info.project.name === 'phone') await page.setViewportSize({ width: 412, height: 915 })
    await page.goto('/explore/?app=customer')
    await expect(page.getByRole('heading', { name: 'What’s around me?' })).toBeVisible()
    await expect(page.getByRole('heading', { name: shopName })).toBeVisible()
    const capture = async (name: string) => {
      if (info.project.name === 'phone')
        await page.screenshot({ path: `docs/codex/customer-shots/${name}-${mode}.png` })
    }
    await capture('home')
    await page.getByRole('button', { name: 'Map view', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Map view' })).toBeVisible()
    await expect(page).toHaveURL(/view=map/)
    await capture('map')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Map view', exact: true })).toBeFocused()
    await page.getByRole('list').getByRole('link').filter({ hasText: shopName }).click()
    await expect(page).toHaveURL(new RegExp(`/explore/s/${shopId}$`))
    await expect(page.getByRole('heading', { name: shopName })).toBeVisible()
    await expect(page.getByText('Sold out', { exact: true })).toBeVisible()
    await capture('shop')
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'What’s around me?' })).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px'
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
    await page.goto(`/s/${shopId}?source=qr`)
    await expect(page).toHaveURL(new RegExp(`/explore/s/${shopId}\\?source=qr$`))
  })
}

test('all new copy has nine complete locale translations', () => {
  for (const locale of LOCALES.filter((value) => value !== 'en')) {
    expect(Object.keys(frontTranslations[locale] ?? {})).toEqual(Object.keys(frontEnglish))
    for (const key of Object.keys(frontEnglish) as (keyof typeof frontEnglish)[])
      expect(frontTranslations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String))
  }
})
