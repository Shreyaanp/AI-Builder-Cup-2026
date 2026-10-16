import { createShop } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Welcome → consent in whatever language the page is in, using that locale's labels. */
async function consentScreen(page: Page, continueLabel: string, consentTitle: string) {
  await page.goto('/')
  await page.getByRole('button', { name: continueLabel }).click()
  await expect(page.getByRole('heading', { name: consentTitle })).toBeVisible()
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true)
}

const PHONE_LANGUAGES = [
  { locale: 'ja-JP', lang: 'ja', cont: 'ローカルプレビューを続ける', consent: '始める前に' },
  {
    locale: 'ms-MY',
    lang: 'ms',
    cont: 'Teruskan pratonton setempat',
    consent: 'Sebelum kita mula',
  },
  { locale: 'th-TH', lang: 'th', cont: 'ต่อด้วยตัวอย่างในเครื่อง', consent: 'ก่อนเริ่มใช้งาน' },
  {
    locale: 'ta-SG',
    lang: 'ta',
    cont: 'உள்ளக முன்னோட்டத்தில் தொடருங்கள்',
    consent: 'தொடங்கும் முன்',
  },
  { locale: 'en-SG', lang: 'en', cont: 'Continue local preview', consent: 'Before we start' },
]

for (const { locale, lang, cont, consent } of PHONE_LANGUAGES) {
  test.describe(`phone language ${locale}`, () => {
    test.use({ locale })

    test('the app follows the phone language without overflow', async ({ page }) => {
      await consentScreen(page, cont, consent)
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang)
      await noHorizontalOverflow(page)
      if (lang === 'ja' || lang === 'th') {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(results.violations).toEqual([])
      }
    })
  })
}

test('systemLocale maps APAC browser tags and falls back to English', async ({ page }) => {
  await page.goto('/')
  const mapped = await page.evaluate(async () => {
    // Served by the Vite dev server; a variable keeps TypeScript from resolving the URL.
    const module = '/src/i18n/locales.ts'
    const { systemLocale } = (await import(module)) as typeof import('../src/i18n/locales.js')
    return [['zh-SG'], ['zh-TW'], ['in-ID'], ['tl'], ['fr-FR'], ['fr-FR', 'ko-KR']].map((tags) =>
      systemLocale(tags),
    )
  })
  expect(mapped).toEqual(['zh-Hans', 'zh-Hans', 'id', 'fil', 'en', 'ko'])
})

test('the Settings override wins over the phone and survives reload', async ({ page }) => {
  await consentScreen(page, 'Continue local preview', 'Before we start')
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: '日本語' }).click()
  await expect(page.getByRole('combobox', { name: '言語' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'ローカルプレビューを続ける' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ja')
})

test('the customer page follows the customer’s phone language', async ({ page, browser }) => {
  await consentScreen(page, 'Continue local preview', 'Before we start')
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await createShop(page, 'name: Ah Ming Kopi')
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Customer page/ }).click()
  // Onboarding put the shop live by itself: the page is already shared.
  await expect(page.getByRole('switch', { name: 'Share customer page' })).toBeChecked()
  const url = await page.getByRole('link', { name: 'Open page' }).getAttribute('href')

  const customer = await browser.newContext({ locale: 'ja-JP' })
  const customerPage = await customer.newPage()
  await customerPage.goto(new URL(url!, page.url()).toString())
  await expect(customerPage.getByRole('heading', { name: 'Ah Ming Kopi' })).toBeVisible()
  // No menu yet (onboarding never asks it): customers can chat with the shop meanwhile.
  await expect(customerPage.getByTestId('menu-coming-soon')).toContainText('メニューは準備中です')
  expect(await customerPage.evaluate(() => document.documentElement.lang)).toBe('ja')
  await customer.close()
})
