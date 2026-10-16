import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { canonicalCustomerPath, resolveApp, safeCustomerOrigin } from '../src/app/router.ts'
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
  expect(canonicalCustomerPath('/discover')).toBe('/explore/browse')
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
    page.getByRole('heading', { name: 'For shop owners. For neighbours.', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Find places near me' }).first()).toHaveAttribute(
    'href',
    '/explore/',
  )
  await expect(page.getByRole('link', { name: 'For businesses' }).first()).toHaveAttribute(
    'href',
    'https://business.chalkboard.shreyaan.work',
  )
  // The scroll story and bento are part of the page (visible immediately with reduced motion).
  await expect(
    page.getByRole('heading', { name: 'From chalkboard to every phone, in three moves.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Talk to your coach' })).toBeVisible()
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
  for (const category of ['Pharmacy', 'Hardware', 'Fashion', 'Beauty', 'Services', 'Other'])
    await expect(page.getByRole('button', { name: category, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Coffee & tea', exact: true }).click()
  await page.getByRole('button', { name: 'Explore my neighbourhood' }).click()
  // AI-first front door after the welcome; returning skips the welcome.
  await expect(page.getByRole('heading', { name: 'What are you looking for nearby?' })).toBeVisible(
    { timeout: 30_000 },
  )
  // The picked interest becomes a one-tap question.
  await expect(page.getByRole('button', { name: 'Coffee & tea', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What are you looking for nearby?' })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(page.getByText('Step 1 of 2', { exact: true })).toHaveCount(0)
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
    await page.goto('/explore/browse?app=customer')
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

test('all new copy has 15 complete locale translations', async ({ page }) => {
  await page.goto('/?app=landing')
  // Loaded through the Vite dev server: app modules use bundler-style imports.
  const { english, translations } = await page.evaluate(async () => {
    const path = '/src/features/frontdoors/strings.ts'
    const mod = (await import(path)) as {
      frontEnglish: Record<string, string>
      frontTranslations: Record<string, Record<string, string>>
    }
    return { english: mod.frontEnglish, translations: mod.frontTranslations }
  })
  for (const locale of LOCALES.filter((value) => value !== 'en')) {
    expect(Object.keys(translations[locale] ?? {})).toEqual(Object.keys(english))
    for (const key of Object.keys(english))
      expect(translations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String))
  }
})

for (const width of [360, 390, 412]) {
  test(`B35 landing fits ${width}px with readable cards and a vertical story`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?app=landing')
    await expect(page.locator('.lp-eyebrow')).toHaveCount(0)
    const business = page.locator('.lp-nav').getByRole('link', { name: 'For businesses' })
    await expect(business).toBeInViewport()
    const button = await business.boundingBox()
    expect(button!.height).toBeGreaterThanOrEqual(48)
    expect(button!.x + button!.width).toBeLessThanOrEqual(width)
    await expect(page.locator('.lp-steps li')).toHaveCount(3)
    for (const step of await page.locator('.lp-steps li').all()) await expect(step).toBeVisible()
    expect(
      await page.locator('.lp-story-pin').evaluate((el) => getComputedStyle(el).position),
    ).toBe('static')
    expect(await page.locator('.lp-fan-pin').evaluate((el) => getComputedStyle(el).position)).toBe(
      'static',
    )
    for (const card of await page.locator('.lp-tile, .lp-card').all()) {
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeVisible()
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const box = await card.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    if (width === 390) {
      // Reload with reduced motion so the typed illustration is complete in the proof.
      await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: 'docs/bugs/B35-hero.png' })
      await page.screenshot({ path: 'docs/bugs/B35-business-button.png' })
      await page
        .locator('.lp-tile.sold')
        .evaluate((el) => scrollTo(0, el.getBoundingClientRect().top + scrollY - 100))
      await page.screenshot({ path: 'docs/bugs/B35-bento.png' })
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const card of await page.locator('.lp-tile, .lp-card, .lp-steps li').all())
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
}

test('B35 desktop keeps its hero columns, bento and pinned story', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?app=landing')
  expect(
    await page
      .locator('.lp-hero')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
  ).toBe(2)
  expect(
    await page
      .locator('.lp-bento')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
  ).toBe(4)
  expect(await page.locator('.lp-story-pin').evaluate((el) => getComputedStyle(el).position)).toBe(
    'sticky',
  )
  await page.screenshot({ path: 'docs/bugs/B35-desktop.png' })
})

test('GAP 5 · landing headline does not overflow at 360px in all 15 locales', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const locales = [
    'ta',
    'en',
    'zh-Hans',
    'ms',
    'ja',
    'ko',
    'id',
    'th',
    'vi',
    'fil',
    'hi',
    'bn',
    'te',
    'mr',
    'kn',
  ]
  for (const locale of locales) {
    await page.addInitScript((l) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: l }))
    }, locale)
    await page.goto('/')
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(
      scrollWidth,
      `scrollWidth for locale ${locale} should not exceed 360`,
    ).toBeLessThanOrEqual(360)
    const h1Scroll = await h1.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(
      h1Scroll.scroll,
      `h1 scrollWidth for locale ${locale} should fit clientWidth`,
    ).toBeLessThanOrEqual(h1Scroll.client + 1)
  }
})

