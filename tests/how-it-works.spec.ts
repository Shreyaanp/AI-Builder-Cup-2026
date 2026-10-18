import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

test.use({ viewport: { width: 390, height: 844 } })
test.skip(({ isMobile }) => !isMobile, 'Phone storyboard coverage')

test.beforeEach(async ({ page, baseURL }) => {
  // This page must work without any API or third-party service.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL!).origin && !url.pathname.startsWith('/api/')
      ? route.continue()
      : route.abort()
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      'niva.starter.preferences',
      JSON.stringify({ language: 'en', appearance: 'light' }),
    )
  })
})

test('silent 40-second autoplay, pause, replay, scene selection and both host routes', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/how-it-works')
  await expect(page.getByRole('heading', { name: 'How it works', exact: true })).toBeVisible()
  const phone = page.locator('.how-phone')
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  await expect(pause).toBeVisible()
  await page.clock.runFor(8_000)
  await expect(phone).toHaveAttribute('data-scene', '0')
  await expect(phone.getByText('Your shop is live')).toBeVisible()
  await pause.click()
  const frozen = await phone.getAttribute('data-second')
  await page.clock.runFor(5_000)
  await expect(phone).toHaveAttribute('data-second', frozen!)
  expect(
    await phone.locator('.how-success').evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe('paused')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.clock.runFor(8_000)
  await expect(phone).toHaveAttribute('data-scene', '1')
  await expect(phone.getByText('Stamp collected')).toBeVisible()
  await page.clock.runFor(12_000)
  await expect(phone).toHaveAttribute('data-scene', '2')
  await expect(phone.getByText('Supplier confirmed')).toBeVisible()
  await expect(phone.getByText('Restocked', { exact: true })).toBeVisible()
  await page.clock.runFor(10_000)
  await expect(phone).toHaveAttribute('data-scene', '3')
  await expect(phone.getByText('Items added')).toBeVisible()
  await page.clock.runFor(2_000)
  await expect(phone).toHaveAttribute('data-scene', '0')
  await expect(phone).toHaveAttribute('data-second', '0')
  await page.getByRole('button', { name: 'Snap your till. Add your items.', exact: true }).click()
  await expect(phone).toHaveAttribute('data-scene', '3')
  await expect(phone.getByText('Items added')).toBeVisible()
  await page.clock.runFor(4_000)
  await expect(phone).toHaveAttribute('data-second', '30')
  await page.getByRole('button', { name: 'Replay', exact: true }).click()
  await expect(phone).toHaveAttribute('data-second', '0')
  await expect(pause).toBeVisible()
  await expect(page.getByRole('link', { name: 'Find places near me' })).toHaveAttribute(
    'href',
    '/explore',
  )
  await expect(page.getByRole('link', { name: 'For business', exact: true })).toHaveAttribute(
    'href',
    '/?app=business',
  )
  await expect(page.getByRole('link', { name: 'Try the demo shop' })).toHaveAttribute(
    'href',
    '/demo',
  )
  expect(await page.locator('audio, video').count()).toBe(0)
  const routes = await page.evaluate(async () => {
    const path = '/src/app/router.ts'
    const { resolveApp } = await import(path)
    return ['chalkboard.shreyaan.work', 'business.chalkboard.shreyaan.work'].map((host) =>
      resolveApp(new URL(`https://${host}/how-it-works`)),
    )
  })
  expect(routes).toEqual(['how-it-works', 'how-it-works'])
})

test('static frames, phone widths, light/dark, English/Hindi, keyboard and screenshots', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await mkdir('output/playwright/how-it-works', { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/how-it-works')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled()
  await expect(page.locator('.how-phone').getByText('Your shop is live')).toBeVisible()
  const captions = [
    'Speak. Your shop takes shape.',
    'Scan. Collect a stamp.',
    'Spot low stock. Restock in time.',
    'Snap your till. Add your items.',
  ]
  for (const appearance of ['light', 'dark']) {
    if (appearance === 'dark')
      await page.getByRole('button', { name: 'Use dark appearance' }).click()
    for (const [index, caption] of captions.entries()) {
      const dot = page.getByRole('button', { name: caption, exact: true })
      await dot.focus()
      await page.keyboard.press('Enter')
      await expect(dot).toHaveAttribute('aria-current', 'step')
      await expect(page.locator('figcaption')).toHaveText(caption)
      expect(caption.split(/\s+/).length).toBeLessThanOrEqual(8)
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({
        path: `output/playwright/how-it-works/en-${appearance}-${index + 1}-390.png`,
        fullPage: true,
      })
    }
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.getByRole('button', { name: 'हिन्दी', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'कैसे काम करता है' })).toBeVisible()
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        await page.locator('.how-phone').evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      if (width === 390) {
        await page.screenshot({
          path: `output/playwright/how-it-works/hi-${appearance}-390.png`,
          fullPage: true,
        })
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page.locator('.how-phone').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = ''
    })
    await page.getByRole('button', { name: 'English', exact: true }).click()
    for (const width of [360, 412]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({
      path: `output/playwright/how-it-works/en-${appearance}-desktop.png`,
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await page.clock.install()
  const second = await page.locator('.how-phone').getAttribute('data-second')
  await page.clock.runFor(45_000)
  await expect(page.locator('.how-phone')).toHaveAttribute('data-second', second!)
  const translations = await page.evaluate(async () => {
    const path = '/src/features/frontdoors/howItWorksCopy.ts'
    const { howEnglish, howTranslations } = await import(path)
    return { english: howEnglish, locales: howTranslations }
  })
  for (const values of Object.values(translations.locales) as Record<string, string>[]) {
    expect(Object.keys(values)).toEqual(Object.keys(translations.english))
    expect(
      Object.values(values).every((value) => typeof value === 'string' && value.length > 0),
    ).toBe(true)
  }
})
