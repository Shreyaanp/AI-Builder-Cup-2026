import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resolveApp } from '../src/app/router.ts'
import { pagesEnglish, pagesHindi } from '../src/features/frontdoors/howItWorksCopy.ts'

// /how-it-works and /features: phone first, light and dark, English and Hindi. The new landing
// (/landing-preview) has its own spec: landing-v2.spec.ts.
test.skip(({ isMobile }) => !isMobile, 'Phone pages')

async function open(page: Page, path: string, language: 'en' | 'hi', appearance: 'light' | 'dark') {
  // Public pages: no API and no third-party request.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.fallback()
      : route.abort()
  })
  await page.addInitScript(
    ([language, appearance]) =>
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language, appearance })),
    [language, appearance],
  )
  await page.goto(path)
}

const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )

test('both hosts serve the pages; the landing stays the landing', () => {
  for (const host of ['chalkboard.shreyaan.work', 'business.chalkboard.shreyaan.work'])
    for (const path of ['/how-it-works', '/features', '/landing-preview/'])
      expect(resolveApp(new URL(`https://${host}${path}`))).toBe('pages')
  expect(resolveApp(new URL('https://chalkboard.shreyaan.work/'))).toBe('landing')
  expect(resolveApp(new URL('https://business.chalkboard.shreyaan.work/'))).toBe('business')
})

for (const width of [360, 390, 412]) {
  test(`${width}px: /how-it-works splits shops and customers, one lazy muted video each`, async ({
    page,
  }) => {
    // The first page of a cold dev server can take a while to compile.
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 800 })
    await open(page, '/how-it-works', 'en', 'light')
    const t = pagesEnglish
    await expect(page.getByRole('heading', { level: 1, name: t.howTitle })).toBeVisible({
      timeout: 50_000,
    })
    await expect(page.getByText(t.lead)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: t.shopsLine })).toBeAttached()
    await expect(page.getByRole('heading', { level: 2, name: t.customersLine })).toBeAttached()
    for (const [flow, captions] of [
      ['vendor', t.vendorCaptions],
      ['customer', t.customerCaptions],
    ] as const) {
      const video = page.getByTestId(`${flow}-video`)
      await expect(video).toHaveJSProperty('muted', true)
      await expect(video).toHaveAttribute('playsinline', '')
      await expect(video).toHaveAttribute('controls', '')
      await expect(video).toHaveAttribute('poster', `/how-it-works/${flow}-en.jpg`)
      await expect(
        video.locator('xpath=../..').getByRole('button', { name: t.sound }),
      ).toBeVisible()
      // The steps are the video's captions, without the end card. Phones leave the list out (the
      // video already tells each step), so it stays in the page but is not shown.
      const label = flow === 'vendor' ? t.forShops : t.forCustomers
      const list = page.getByRole('list', { name: `${label}: ${t.steps}`, includeHidden: true })
      await expect(list).toBeHidden()
      await expect(list.getByRole('listitem', { includeHidden: true })).toHaveText(
        captions.slice(0, -1),
      )
      for (const caption of captions) expect(caption.split(/\s+/).length).toBeLessThanOrEqual(8)
    }
    // Nothing downloads until the customer video nears the screen.
    const customer = page.getByTestId('customer-video')
    expect(await customer.getAttribute('src')).toBeNull()
    await customer.scrollIntoViewIfNeeded()
    await expect(customer).toHaveAttribute('src', '/how-it-works/customer-en.mp4')
    await expect(page.getByRole('link', { name: t.tryDemo })).toHaveAttribute(
      'href',
      'https://business.chalkboard.shreyaan.work/demo',
    )
    await expect(page.getByRole('link', { name: t.findPlaces })).toHaveAttribute(
      'href',
      '/explore/',
    )
    await noOverflow(page)
  })
}

for (const appearance of ['light', 'dark'] as const) {
  test(`Hindi, ${appearance}: both pages read in Hindi with Hindi videos; no a11y violations`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const t = pagesHindi
    await open(page, '/how-it-works', 'hi', appearance)
    await expect(page.getByRole('heading', { level: 1, name: t.howTitle })).toBeVisible()
    await expect(page.getByTestId('vendor-video')).toHaveAttribute(
      'poster',
      '/how-it-works/vendor-hi.jpg',
    )
    // Phones hide the step list: the video tells the steps; the list keeps the Hindi text.
    const steps = page.getByRole('list', {
      name: `${t.forShops}: ${t.steps}`,
      includeHidden: true,
    })
    await expect(steps).toBeHidden()
    await expect(steps.getByRole('listitem', { includeHidden: true }).first()).toHaveText(
      t.vendorCaptions[0]!,
    )
    await noOverflow(page)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([])
    await page.screenshot({
      path: `output/playwright/how-it-works-hi-${appearance}.png`,
      fullPage: true,
    })

    await page.goto('/features')
    await expect(page.getByRole('heading', { level: 1, name: t.featuresTitle })).toBeVisible()
    for (const [title] of [...t.shopFeatures, ...t.customerFeatures])
      await expect(page.getByRole('heading', { level: 3, name: title })).toBeAttached()
    await noOverflow(page)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([])
    await page.screenshot({
      path: `output/playwright/features-hi-${appearance}.png`,
      fullPage: true,
    })
  })
}

test('/features (English, dark): two grids, a trust strip and links to the videos', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await open(page, '/features', 'en', 'dark')
  const t = pagesEnglish
  await expect(page.getByRole('heading', { level: 1, name: t.featuresTitle })).toBeVisible()
  await expect(page.getByRole('region', { name: t.shopsLine }).getByRole('listitem')).toHaveCount(
    t.shopFeatures.length,
  )
  await expect(
    page.getByRole('region', { name: t.customersLine }).getByRole('listitem'),
  ).toHaveCount(t.customerFeatures.length)
  await expect(page.getByTestId('trust-strip').getByRole('listitem')).toHaveCount(4)
  await expect(page.getByTestId('trust-strip')).toContainText(t.trustItems[0]![0]!)
  await expect(page.getByRole('link', { name: t.watch }).first()).toHaveAttribute(
    'href',
    '/how-it-works#vendor',
  )
  await noOverflow(page)
  await page.screenshot({ path: 'output/playwright/features-en-dark.png', fullPage: true })
})

test('every demo video and poster ships, small enough for a phone (< 3 MB), with a voice', async ({
  request,
}) => {
  for (const flow of ['vendor', 'customer'])
    for (const lang of ['en', 'hi']) {
      const video = await request.get(`/how-it-works/${flow}-${lang}.mp4`)
      expect(video.ok(), `${flow}-${lang}.mp4`).toBe(true)
      const body = await video.body()
      expect(body.length).toBeLessThan(3_000_000)
      // An MP4 with a voiceover carries a sound track ('soun' handler) beside the picture.
      expect(body.includes('soun'), `${flow}-${lang}.mp4 has a voiceover`).toBe(true)
      const poster = await request.get(`/how-it-works/${flow}-${lang}.jpg`)
      expect(poster.ok(), `${flow}-${lang}.jpg`).toBe(true)
    }
})

// OB-17: the buttons were far too big. Every jump pill and action button is one 48 px row,
// its label stays inside it, and the row stays inside the screen, in English and Hindi.
for (const width of [360, 390, 412, 1280]) {
  test(`OB-17 ${width}px: /how-it-works buttons are 48 px and their labels fit`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    for (const language of ['en', 'hi'] as const) {
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/how-it-works', language, 'light')
      const buttons = page.locator('.hw-jump a, .hw-cta .MuiButton-root, .hw-sound')
      await expect(buttons.first()).toBeVisible({ timeout: 50_000 })
      const boxes = await buttons.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return {
            label: (el.textContent ?? '').trim(),
            height: Math.round(r.height),
            right: r.right,
            spill: el.scrollWidth - el.clientWidth,
          }
        }),
      )
      expect(boxes.length).toBeGreaterThanOrEqual(6)
      for (const box of boxes) {
        expect(box.height, `${language} ${box.label} height`).toBe(48)
        expect(box.spill, `${language} ${box.label} label fits`).toBeLessThanOrEqual(1)
        expect(box.right, `${language} ${box.label} on screen`).toBeLessThanOrEqual(width)
      }
      await noOverflow(page)
    }
  })
}

for (const width of [360, 390]) {
  test(`${width}px: the new "/" front door fits and shows both primary actions`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?app=landing&landing=new', { waitUntil: 'domcontentloaded' })
    const t = pagesEnglish
    await expect(page.getByRole('heading', { level: 1, name: t.hero })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: t.businessShort }).first()).toBeInViewport()
    await expect(page.getByRole('link', { name: t.findShort }).first()).toBeInViewport()
    await noOverflow(page)
  })
}

test('classic landing remains at "/" when selected', async ({ page }) => {
  await page.goto('/?app=landing&landing=classic')
  await expect(
    page.getByRole('heading', { name: 'Small shops. Big neighbourhood energy.' }),
  ).toBeVisible({ timeout: 20_000 })
})
