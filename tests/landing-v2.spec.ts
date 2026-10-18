import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { landingVariant, resolveApp } from '../src/app/router.ts'
import { pagesEnglish, pagesHindi } from '../src/features/frontdoors/howItWorksCopy.ts'

// The new landing (LandingV2.tsx): at /landing-preview, and at "/" once LANDING_VARIANT=new.
test.skip(({ isMobile }) => !isMobile, 'Phone first')

async function open(page: Page, path: string, language: 'en' | 'hi', appearance: 'light' | 'dark') {
  // A public page: no API and no third-party request.
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

test('the classic landing stays the default; the server or ?landing= picks the new one', () => {
  const home = new URL('https://chalkboard.shreyaan.work/')
  expect(resolveApp(home)).toBe('landing')
  expect(landingVariant(home, undefined)).toBe('classic')
  expect(landingVariant(home, 'classic')).toBe('classic')
  expect(landingVariant(home, 'new')).toBe('new')
  expect(landingVariant(new URL('https://chalkboard.shreyaan.work/?landing=new'), null)).toBe('new')
  expect(landingVariant(new URL('https://chalkboard.shreyaan.work/?landing=classic'), 'new')).toBe(
    'classic',
  )
  expect(resolveApp(new URL('https://business.chalkboard.shreyaan.work/landing-preview'))).toBe(
    'pages',
  )
})

for (const width of [360, 390, 412]) {
  test(`${width}px: says what it does first, two actions side by side, then one cup of chai`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 800 })
    await open(page, '/landing-preview', 'en', 'light')
    const t = pagesEnglish
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.hero, { timeout: 50_000 })
    await expect(page.getByRole('note')).toHaveText(t.previewBanner)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.getByText(t.lead)).toBeVisible()

    // The first screen: what it is, who it is for, and both actions, side by side.
    const hero = page.locator('.l2-hero')
    const business = hero.getByRole('link', { name: t.businessShort })
    const find = hero.getByRole('link', { name: t.findShort })
    await expect(business).toHaveAttribute('href', 'https://business.chalkboard.shreyaan.work')
    await expect(find).toHaveAttribute('href', '/explore/')
    const [a, b] = [(await business.boundingBox())!, (await find.boundingBox())!]
    expect(Math.abs(a.y - b.y)).toBeLessThan(2)
    expect(a.y + a.height).toBeLessThan(800)
    expect(a.height).toBeGreaterThanOrEqual(48)

    // What it does: three big tiles, in plain words.
    for (const [title] of t.does)
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
    // The first tile starts on the first screen: no big empty gap under the hero.
    const firstTile = (await page.locator('.l2-tile').first().boundingBox())!
    expect(firstTile.y).toBeLessThan(800)

    // One cup of chai, stall to chain.
    const stops = page.getByRole('region', { name: t.storyTitle }).getByRole('listitem')
    await expect(stops).toHaveCount(t.story.length)
    await expect(stops.first()).toContainText(t.story[0]![1]!)

    // The trust promises are big tags, two by two.
    const tags = page.getByTestId('trust-strip').getByRole('listitem')
    await expect(tags).toHaveCount(4)
    const [first, second] = [(await tags.nth(0).boundingBox())!, (await tags.nth(1).boundingBox())!]
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
    expect(first.height).toBeGreaterThanOrEqual(96)

    // Nothing points at the code.
    const text = await page.locator('body').innerText()
    for (const word of ['docs/', 'Source', 'Measured', 'p50', '.md', 'github'])
      expect(text, word).not.toContain(word)
    await noOverflow(page)

    // The mock the owner approves, at rest (reduced motion shows every part in place).
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.hero)
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({ content: '.l2-dock { display: none }' })
    await page.screenshot({
      path:
        width === 390
          ? 'docs/landing-preview-390.png'
          : `output/playwright/landing-v2-${width}.png`,
      fullPage: true,
    })
  })
}

test('the videos: one phone, shops or customers, and a voiceover on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '/landing-preview', 'en', 'light')
  const t = pagesEnglish
  const region = page.getByRole('region', { name: t.videosTitle })
  await region.scrollIntoViewIfNeeded()
  const shops = region.getByRole('button', { name: t.forShops })
  const customers = region.getByRole('button', { name: t.forCustomers })
  await expect(shops).toHaveAttribute('aria-pressed', 'true')
  await expect(region.getByTestId('vendor-video')).toHaveAttribute(
    'data-src',
    '/how-it-works/vendor-en.mp4',
  )
  await customers.click()
  await expect(customers).toHaveAttribute('aria-pressed', 'true')
  const video = region.getByTestId('customer-video')
  await expect(video).toHaveAttribute('poster', '/how-it-works/customer-en.jpg')
  await expect(region.getByText(t.customersLine)).toBeVisible()
  await region.getByRole('button', { name: t.sound }).click()
  await expect(video).toHaveJSProperty('muted', false)
  await expect(video).toHaveAttribute('src', '/how-it-works/customer-en.mp4')
  await expect(region.getByRole('button', { name: t.sound })).toHaveCount(0)
})

test('the thumb bar: the two actions follow the reader, then step aside at the end', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '/landing-preview', 'en', 'light')
  const dock = page.locator('.l2-dock')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(dock).not.toHaveClass(/\bon\b/)
  await page.getByRole('region', { name: pagesEnglish.storyTitle }).scrollIntoViewIfNeeded()
  await expect(dock).toHaveClass(/\bon\b/)
  await expect(dock.getByRole('link', { name: pagesEnglish.businessShort })).toBeVisible()
  await page
    .getByRole('heading', { level: 2, name: pagesEnglish.finalTitle })
    .scrollIntoViewIfNeeded()
  await expect(dock).not.toHaveClass(/\bon\b/)
})

for (const appearance of ['light', 'dark'] as const) {
  test(`Hindi, ${appearance}: all Hindi, Hindi video, no a11y violations`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/landing-preview', 'hi', appearance)
    const t = pagesHindi
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.hero)
    for (const [title] of t.does)
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
    await expect(page.getByTestId('vendor-video')).toHaveAttribute(
      'poster',
      '/how-it-works/vendor-hi.jpg',
    )
    await expect(page.getByTestId('trust-strip')).toContainText(t.trustItems[0]![0]!)
    await noOverflow(page)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([])
    await page.screenshot({
      path: `output/playwright/landing-v2-hi-${appearance}.png`,
      fullPage: true,
    })
  })
}

test('"/" shows the classic landing by default and the new one with ?landing=new', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '/?app=landing', 'en', 'light')
  await expect(page.locator('.lp-title')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.l2')).toHaveCount(0)
  await page.goto('/?app=landing&landing=new')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(pagesEnglish.hero)
  // Only the preview carries the banner and noindex.
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})
