import { test, expect } from '@playwright/test'
import { hasSeen, remember } from '../src/features/first-run/seen.js'
import { explainerCopy } from '../src/features/first-run/copy.js'
import { LOCALES } from '../src/i18n/locales.js'
import { AxeBuilder } from '@axe-core/playwright'

test('shown once per device and app; unavailable storage still allows dismissal', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  expect(hasSeen('owner', storage)).toBe(false)
  expect(hasSeen('owner', storage)).toBe(false) // Rendering alone does not consume it.
  remember('owner', storage)
  expect(hasSeen('owner', storage)).toBe(true)
  expect(hasSeen('customer', storage)).toBe(false)
  remember('customer', storage)
  expect(hasSeen('customer', storage)).toBe(true)
  const blocked = {
    getItem: () => {
      throw Error('blocked')
    },
    setItem: () => {
      throw Error('blocked')
    },
  }
  expect(hasSeen('owner', blocked)).toBe(false)
  expect(() => remember('owner', blocked)).not.toThrow()
  for (const locale of LOCALES) {
    expect(explainerCopy[locale]).toHaveLength(11)
    expect(explainerCopy[locale].every((s) => s.length > 0 && !s.includes('??'))).toBe(true)
    for (const headline of explainerCopy[locale].slice(0, 6))
      expect(headline.split(/\s+/).length, `${locale}: ${headline}`).toBeLessThanOrEqual(6)
  }
})

for (const app of ['owner', 'customer'] as const) {
  test(`${app} phone: introduction, swipe, skip, reload and replay`, async ({ page }) => {
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (url.pathname.endsWith('/bootstrap'))
        return route.fulfill({ json: { auth_mode: 'local' } })
      if (url.pathname.endsWith('/me')) return route.fulfill({ json: { consent_current: true } })
      if (url.pathname.endsWith('/businesses')) return route.fulfill({ json: [] })
      return route.fulfill({ status: 503, json: { detail: 'Offline fixture' } })
    })
    await page.addInitScript(() => {
      localStorage.setItem('niva.language.chosen', '1')
      const app = location.pathname.startsWith('/explore') ? 'customer' : 'owner'
      localStorage.removeItem(`chalkboard.explainer.${app}.v1`)
      if (!localStorage.getItem('niva.starter.preferences'))
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ language: 'en', appearance: 'light' }),
        )
    })
    const path = app === 'owner' ? '/' : '/explore/'
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    const copy = explainerCopy.en
    const offset = app === 'owner' ? 0 : 3
    await expect(page.getByRole('heading', { name: copy[offset], exact: true })).toBeVisible()
    for (const width of [360, 390, 412, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      for (const button of await page.getByRole('dialog').getByRole('button').all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48)
      await page.screenshot({ path: `output/playwright/first-run-${app}-light-${width}.png` })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: copy[offset + 1], exact: true })).toBeVisible()
    await page.getByRole('dialog').evaluate((el) => {
      const target = el.querySelector('.MuiStack-root')!
      target.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [new Touch({ identifier: 1, target, clientX: 300, clientY: 300 })],
        }),
      )
      target.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          changedTouches: [new Touch({ identifier: 1, target, clientX: 80, clientY: 300 })],
        }),
      )
    })
    await expect(page.getByRole('heading', { name: copy[offset + 2], exact: true })).toBeVisible()
    await page.screenshot({ path: `output/playwright/first-run-${app}-light.png` })
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('heading', { name: copy[offset], exact: true })).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: copy[offset], exact: true })).toHaveCount(0)
    if (app === 'owner') {
      await page.getByRole('button', { name: /preview/i }).click()
      await page.getByRole('button', { name: 'You', exact: true }).click()
    } else {
      await page
        .getByRole('button', { name: /profile/i })
        .first()
        .click()
    }
    await page.getByRole('button', { name: 'See again', exact: true }).click()
    await expect(page.getByRole('heading', { name: copy[offset], exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: copy[offset], exact: true })).toHaveCount(0)
    for (const language of ['hi', 'ja'] as const) {
      await page.evaluate(
        ({ app, language }) => {
          localStorage.removeItem(`chalkboard.explainer.${app}.v1`)
          localStorage.setItem(
            'niva.starter.preferences',
            JSON.stringify({ language, appearance: 'dark' }),
          )
        },
        { app, language },
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(
        page.getByRole('heading', { name: explainerCopy[language][offset], exact: true }),
      ).toBeVisible()
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([])
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 1000 },
      ]) {
        await page.setViewportSize(viewport)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({
          path: `output/playwright/first-run-${app}-${language}-dark-${viewport.width}.png`,
        })
      }
      await page.getByRole('button', { name: explainerCopy[language][6], exact: true }).click()
    }
  })
}
