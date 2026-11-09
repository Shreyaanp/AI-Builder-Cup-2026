import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Trust and demo copy, from the 3 Nov first-run persona study: OB-269 (#674), OB-272 (#677),
// OB-271 (#676), OB-274 (#679), OB-247 (#632). SHOTS=<folder> saves every state for the PR.
test.setTimeout(120_000)

const shots = process.env.SHOTS
type Lang = 'en' | 'hi'

async function snap(page: Page, name: string, lang: Lang) {
  if (shots) await page.screenshot({ path: `${shots}/${name}-${lang}.png` })
}

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `trust-${info.testId}-${Date.now()}` })
  await context.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
})

async function useLanguage(page: Page, lang: Lang) {
  if (lang === 'hi')
    await page.addInitScript(() => {
      localStorage.setItem('chalkboard.owner.preferences', JSON.stringify({ language: 'hi' }))
      localStorage.setItem('chalkboard.owner.language.chosen', '1')
    })
}

async function openDemo(page: Page, lang: Lang = 'en') {
  await page.setViewportSize({ width: 390, height: 844 })
  await useLanguage(page, lang)
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: lang === 'hi' ? 'छोड़ें' : 'Skip', exact: true })
    .click({ timeout: 60_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

const tab = (page: Page, name: string) => page.locator(`[data-tour="nav-${name}"]`).click()

async function openImport(page: Page) {
  await tab(page, 'shop')
  await page.locator('[data-tour="menu"]').click()
  await page.locator('#import-panel, [aria-controls="import-panel"]').first().click()
  return page.locator('#import-panel input[type="file"][accept*=".xlsx"]')
}

const photo = () => ({
  name: 'my-menu.jpg',
  mimeType: 'image/jpeg',
  buffer: readFileSync('tests/stories/fixtures/bengaluru-board.jpg'),
})

test('OB-269 Privacy is not a draft and asks nobody to wait for a contact', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await page.getByRole('button', { name: /Privacy & your data/ }).click()
  await page
    .getByRole('button', { name: /privacy/i })
    .first()
    .waitFor()
  await page.getByRole('button', { name: 'Privacy notice' }).click()
  const notice = page.getByRole('dialog').last()
  await expect(notice).toContainText('What we collect')
  await expect(notice).not.toContainText('pending legal review')
  await expect(notice).not.toContainText('to be published')
  await snap(page, 'privacy-notice', 'en')
})

test('OB-269 You does not promote the deferred face check', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await expect(page.getByRole('button', { name: /Privacy & your data/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Verify it’s you' })).toHaveCount(0)
  await expect(page.getByText(/face data/i)).toHaveCount(0)
  await snap(page, 'you-tab', 'en')
})

test('OB-272 the demo says what starting your own shop costs', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await expect(page.getByRole('button', { name: /New shop/ })).toContainText('Free to start')
  await snap(page, 'you-own-shop', 'en')
})

test('OB-272 the business sign-in page says it is free to start', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?app=business')
  await expect(page.getByTestId('cost-line')).toContainText('Start for free')
  const box = await page.getByTestId('cost-line').boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await snap(page, 'business-gate', 'en')
})

test('OB-271 FreshMart sells products, not a menu with samosas', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await page.getByRole('button', { name: /FreshMart/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('FreshMart')
  await tab(page, 'shop')
  const row = page.locator('[data-tour="menu"]')
  await expect(row).toContainText('Products')
  await expect(row).not.toContainText('Menu')
  await row.click()
  await expect(page.getByRole('dialog').last()).not.toContainText('Samosa')
  await snap(page, 'freshmart-products', 'en')
})

test('OB-271 a bakery demo shop reads bakery samples', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'you')
  await page.getByRole('button', { name: /Bakery/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bakery')
  const picker = await openImport(page)
  await picker.setInputFiles(photo())
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Chocolate cake', { timeout: 30_000 })
  await expect(review).not.toContainText('Masala dosa')
  await snap(page, 'bakery-sample', 'en')
})

for (const [lang, heading, note, wrong] of [
  ['en', 'This is a sample', 'The demo does not read your photo or file', 'From your photo'],
  ['hi', 'यह नमूना है', 'डेमो आपकी फ़ोटो या फ़ाइल नहीं पढ़ता', 'आपकी फ़ोटो से'],
] as const) {
  test(`OB-274 the demo photo import is labelled a sample (${lang})`, async ({ page }) => {
    await openDemo(page, lang)
    const picker = await openImport(page)
    await picker.setInputFiles(photo())
    const alert = page.getByRole('dialog').last().getByRole('alert').first()
    await expect(alert).toContainText(heading, { timeout: 30_000 })
    await expect(alert).toContainText(note)
    await expect(alert).not.toContainText(wrong)
    await expect(alert).not.toContainText('Sample read')
    await snap(page, 'photo-sample', lang)
  })
}

test('OB-269 the demo coach does not point at the face check', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'coach')
  await expect(page.getByTestId('today')).not.toContainText(/face|Verify it/i)
})

test('OB-247 every place the demo coach names for Google is really there', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  await expect(page.getByRole('button', { name: /Get on Google/ })).toBeVisible()
  await snap(page, 'grow-google', 'en')
})
