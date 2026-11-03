import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { LOCALE_NAMES } from '../src/i18n/locales.js'
import { localOnly } from './stories/support.js'

// OB-270: 127.0.0.1 is the business app; only the local fixture backend is used.
const introHi = 'बोलें। आपकी दुकान लाइव हो जाए।'
const skipHi = 'छोड़ें'
const welcomeEn = 'Your shop, online in one conversation'
const welcomeHi = 'एक बातचीत में आपकी दुकान ऑनलाइन'

test.use({ locale: 'en-GB', storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' })
test.beforeEach(async ({ page }) => localOnly(page))

const skipIntro = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('chalkboard.explainer.owner.v1', '1'))

for (const parameter of ['lang', 'hl'])
  test(`business ${parameter}=hi opens Hindi, leaves the address and survives a reload`, async ({
    page,
  }) => {
    await page.goto(`/?app=business&${parameter}=hi&source=public`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(introHi)
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
    await expect(page).toHaveURL(/\?app=business&source=public$/)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(introHi)
    await page.getByRole('button', { name: skipHi, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(welcomeHi)
  })

test('the sign-in picker switches language and a manual choice beats an English phone', async ({
  page,
}) => {
  await skipIntro(page)
  await page.goto('/?app=business')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(welcomeEn)
  const picker = page.getByRole('button', { name: 'Language', exact: true })
  const box = (await picker.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(48)
  expect(box.height).toBeGreaterThanOrEqual(48)
  await picker.click()
  await page.getByRole('menuitem', { name: LOCALE_NAMES.hi, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(welcomeHi)
  await page.goto('/?app=business')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(welcomeHi)
  expect(await page.evaluate(() => navigator.language)).toBe('en-GB')
})

test('the intro has the same picker', async ({ page }) => {
  await page.goto('/?app=business')
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await page.getByRole('menuitem', { name: LOCALE_NAMES.hi, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(introHi)
})

test('an explicit handoff beats a saved choice; unsupported codes keep it', async ({ page }) => {
  await skipIntro(page)
  await page.goto('/?app=business&lang=hi')
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await page.goto('/?app=business&lang=unsupported')
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await expect(page).toHaveURL(/\?app=business$/)
  await page.goto('/?app=business&lang=en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('the public business links carry the chosen language', async ({ page }) => {
  await page.goto('/?app=landing&landing=classic')
  await page.getByRole('button', { name: /^Language:/ }).click()
  await page.getByRole('menuitem', { name: LOCALE_NAMES.hi, exact: true }).click()
  const links = page.locator('a[href^="https://business.chalkboard.shreyaan.work"]')
  await expect(links).toHaveCount(4)
  for (const link of await links.all()) {
    const url = new URL((await link.getAttribute('href'))!)
    expect(url.searchParams.get('lang')).toBe('hi')
    expect(['/', '/demo']).toContain(url.pathname)
  }
})

test('a business language parameter does not touch the customer preference', async ({ page }) => {
  await page.goto('/?app=business&lang=hi')
  expect(
    await page.evaluate(() => localStorage.getItem('chalkboard.customer.preferences')),
  ).toBeNull()
  await page.goto('/?app=customer&lang=hi')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
