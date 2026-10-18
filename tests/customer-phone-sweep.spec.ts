import { expect, test, type Page } from '@playwright/test'

async function prepare(
  page: Page,
  width: number,
  colorScheme: 'light' | 'dark',
  language: 'en' | 'hi' | 'ta',
) {
  await page.setViewportSize({ width, height: 800 })
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.addInitScript(
    ({ language, colorScheme }) => {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language, appearance: colorScheme }),
      )
      localStorage.setItem('niva.language.chosen', '1')
      localStorage.setItem('chalkboard.customer.journey', 'done')
      localStorage.setItem('chalkboard.explainer.customer.v1', '1')
    },
    { language, colorScheme },
  )
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.route('**/api/v1/public/shops/*', (route) =>
    route.fulfill({
      json: {
        id: 'demo-shop-1',
        name: 'Corner Cup',
        category: 'cafe',
        location: 'Tiong Bahru',
        hours: '08:00 – 17:00',
        reward_text: 'Free coffee',
        stamps_needed: 8,
        currency: 'SGD',
        open_now: true,
        demo: true,
        products: [
          { name: 'Filter coffee', price: 500, unit: '', available: true, category: 'Coffee' },
        ],
        facts: {},
      },
    }),
  )
  await page.route('**/api/v1/public/passport/**', (route) =>
    route.fulfill({
      json: {
        signed_in: false,
        device_only: true,
        points: 0,
        total: 0,
        stamps: [],
        shops: [],
        areas: [],
        quests: [],
        perks: [],
        leaderboard: false,
      },
    }),
  )
  await page.route('**/api/v1/customer/passport?**', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Sign in required' } }),
  )
  await page.route('**/api/v1/public/passport/check', (route) =>
    route.fulfill({ status: 403, json: { detail: 'bad key' } }),
  )
}

async function checkLayout(page: Page, label: string) {
  const issues = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const found: string[] = []
    if (document.documentElement.scrollWidth > width) {
      const offenders = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.right > width + 1)
        .slice(0, 5)
        .map(
          ({ el, rect }) =>
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)}:${Math.round(rect.left)}..${Math.round(rect.right)}`,
        )
      const drawers = Array.from(document.querySelectorAll<HTMLElement>('.MuiDrawer-root')).map(
        (root) => {
          const style = getComputedStyle(root)
          const rect = root.getBoundingClientRect()
          const paper = root.querySelector<HTMLElement>('.MuiDrawer-paper')
          const paperStyle = paper ? getComputedStyle(paper) : null
          return `drawer:${Math.round(rect.width)}/${style.width}/${style.visibility}/${style.display};paper:${paper ? Math.round(paper.getBoundingClientRect().width) : 0}/${paperStyle?.width ?? ''}`
        },
      )
      found.push(
        `horizontal overflow ${width}/${window.innerWidth}/${window.visualViewport?.width}: ${offenders.join(', ')} ${drawers.join('; ')}`,
      )
    }
    const bars = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const position = getComputedStyle(el).position
      if (position === 'sticky' && el.getBoundingClientRect().height > 0) {
        const color = getComputedStyle(el).backgroundColor
        const alpha = color.startsWith('rgba(')
          ? Number(color.split(',').at(-1)?.replace(')', ''))
          : 1
        if (alpha < 1) found.push('sticky bar has a transparent background')
      }
      return position === 'fixed' && el.getBoundingClientRect().height > 0
    })
    const dialog = document.querySelector('[role="dialog"]')
    const content = Array.from(
      document.querySelectorAll<HTMLElement>(
        'main h1, main h2, main h3, main p, main li, main button, main a',
      ),
    ).filter(
      (el) =>
        el.getClientRects().length > 0 && (!dialog || el.closest('[role="dialog"]') === dialog),
    )
    for (const bar of bars) {
      const a = bar.getBoundingClientRect()
      for (const item of content) {
        if (bar === item || bar.contains(item) || item.contains(bar)) continue
        const b = item.getBoundingClientRect()
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX <= 1 || overlapY <= 1) continue
        const stack = document.elementsFromPoint(
          Math.max(a.left, b.left) + overlapX / 2,
          Math.max(a.top, b.top) + overlapY / 2,
        )
        const barIndex = stack.findIndex((node) => node === bar || bar.contains(node))
        const itemIndex = stack.findIndex((node) => node === item || item.contains(node))
        if (barIndex < 0 || itemIndex < 0 || barIndex > itemIndex) continue
        found.push(
          `fixed content overlap: ${item.tagName.toLowerCase()}.${String(item.className).slice(0, 32)} under ${bar.tagName.toLowerCase()}.${String(bar.className).slice(0, 32)}`,
        )
        break
      }
    }
    return found
  })
  expect(issues, label).toEqual([])
}

function answer() {
  const item = { name: 'Kopi', price: 1800, unit: 'cup', available: true }
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
            name: 'Fixture Kopi',
            source: 'chalkboard',
            category: 'Cafe',
            lat: 12.972,
            lng: 77.642,
            distance_m: 120,
            open_now: true,
            currency: 'INR',
            items: [item],
            matched: [item],
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

const matrix = [360, 390, 412].flatMap((width) =>
  (['light', 'dark'] as const).flatMap((colorScheme) =>
    (['en', 'hi', 'ta'] as const).map((language) => ({ width, colorScheme, language })),
  ),
)

test.describe('customer phone sweep', () => {
  test.setTimeout(60_000)
  const screens = [
    ['/explore/', 'Ask'],
    ['/explore/browse', 'Browse'],
    ['/explore/passport', 'Passport'],
    ['/explore/s/demo-shop-1', 'Shop'],
  ] as const

  for (const { width, colorScheme, language } of matrix) {
    for (const [path, label] of screens) {
      test(`${label} fits ${width}px ${colorScheme} ${language}`, async ({ page }) => {
        test.skip(!test.info().project.name.includes('phone'), 'phone project only')
        await prepare(page, width, colorScheme, language)
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('main'), label).toBeVisible({ timeout: 20_000 })
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await checkLayout(page, label)
      })
    }
  }

  for (const { width, colorScheme, language } of matrix) {
    test(`Results fit ${width}px ${colorScheme} ${language}`, async ({ page }) => {
      test.skip(!test.info().project.name.includes('phone'), 'phone project only')
      await prepare(page, width, colorScheme, language)
      await page.route('**/api/v1/discover/ask', (route) => route.fulfill({ json: answer() }))
      await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
      const composer = page.locator('form[role="search"] textarea:not([readonly])')
      await expect(composer).toBeVisible({ timeout: 20_000 })
      await composer.fill('coffee')
      await composer.press('Enter')
      await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await checkLayout(page, 'Results')
    })
  }

  for (const { width, colorScheme, language } of matrix) {
    test(`Profile sheet fits ${width}px ${colorScheme} ${language}`, async ({ page }) => {
      test.skip(!test.info().project.name.includes('phone'), 'phone project only')
      await prepare(page, width, colorScheme, language)
      await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
      const profileLabel = {
        en: 'Profile and preferences',
        hi: 'प्रोफ़ाइल और पसंद',
        ta: 'சுயவிவரமும் விருப்பங்களும்',
      }[language]
      const profile = page.getByRole('button', { name: profileLabel, exact: true })
      await expect(profile).toBeVisible({ timeout: 20_000 })
      await profile.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'Profile sheet').toBe(0)
    })
  }

  for (const { width, colorScheme, language } of matrix) {
    test(`QR stamp sheet fits ${width}px ${colorScheme} ${language}`, async ({ page }) => {
      test.skip(!test.info().project.name.includes('phone'), 'phone project only')
      await prepare(page, width, colorScheme, language)
      await page.route('**/api/v1/public/passport/check', (route) =>
        route.fulfill({ status: 403, json: { detail: 'bad key' } }),
      )
      await page.goto('/explore/s/demo-shop-1?source=qr&k=made-up-key', {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await checkLayout(page, 'QR stamp sheet')
    })
  }
})
