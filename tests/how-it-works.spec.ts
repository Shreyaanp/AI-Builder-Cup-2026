import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resolveApp } from '../src/app/router.ts'
import { pagesEnglish, pagesHindi } from '../src/features/frontdoors/howItWorksCopy.ts'

// /how-it-works, /features and /landing-preview: phone first, light and dark, English and Hindi.
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
      // The steps are the video's captions, without the end card.
      const label = flow === 'vendor' ? t.forShops : t.forCustomers
      const steps = page.getByRole('list', { name: `${label}: ${t.steps}` }).getByRole('listitem')
      await expect(steps).toHaveText(captions.slice(0, -1))
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
    await expect(
      page
        .getByRole('list', { name: `${t.forShops}: ${t.steps}` })
        .getByRole('listitem')
        .first(),
    ).toHaveText(t.vendorCaptions[0]!)
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
  await expect(page.getByTestId('trust-strip')).toContainText(t.free)
  await expect(page.getByRole('link', { name: t.watch }).first()).toHaveAttribute(
    'href',
    '/how-it-works#vendor',
  )
  await noOverflow(page)
  await page.screenshot({ path: 'output/playwright/features-en-dark.png', fullPage: true })
})

test('/landing-preview: labelled proposal, noindex, both videos inline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '/landing-preview', 'en', 'light')
  const t = pagesEnglish
  await expect(page.getByRole('note')).toHaveText(t.previewBanner)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(page.getByRole('heading', { level: 1, name: t.previewHero })).toBeVisible()
  await expect(page.getByTestId('vendor-video')).toBeAttached()
  await expect(page.getByTestId('customer-video')).toBeAttached()
  await expect(page.getByRole('link', { name: t.previewHow })).toHaveAttribute(
    'href',
    '/how-it-works',
  )
  // One story: a cup of chai, each step with the Google technology doing it.
  const steps = page.getByRole('region', { name: t.storyTitle }).getByRole('listitem')
  await expect(steps).toHaveCount(t.story.length)
  await expect(steps.first()).toContainText(t.story[0]![2]!)
  await expect(page.getByRole('region', { name: t.numbersTitle })).toContainText('132 ms')
  await noOverflow(page)
  // The mock the owner approves (docs/LANDING-PLAN.md).
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'docs/landing-preview-390.png', fullPage: true })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
})

test('every demo video and poster ships, small enough for a phone (< 3 MB)', async ({
  request,
}) => {
  for (const flow of ['vendor', 'customer'])
    for (const lang of ['en', 'hi']) {
      const video = await request.get(`/how-it-works/${flow}-${lang}.mp4`)
      expect(video.ok(), `${flow}-${lang}.mp4`).toBe(true)
      expect((await video.body()).length).toBeLessThan(3_000_000)
      const poster = await request.get(`/how-it-works/${flow}-${lang}.jpg`)
      expect(poster.ok(), `${flow}-${lang}.jpg`).toBe(true)
    }
})
