import { expect, test, type Page } from '@playwright/test'
import { paynowPayload, validPaynow } from '../src/features/owner-tools/links.js'
import { readFileSync } from 'node:fs'
import { localOnly } from './stories/support.js'

// Region persona: the shop's location decides money, payments, rides
// and the language offered after sign-in. Offline fixtures; these walk a fresh phone, so the
// suite-wide "language already chosen" storage is cleared.
const FRESH = { cookies: [], origins: [] }
const TIONG_BAHRU = { lat: 1.2847, lng: 103.832 }

// The first-run explainer (tests/first-run.spec.ts) is seen; the language step is what's tested.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const app of ['owner', 'customer'])
      localStorage.setItem(`chalkboard.explainer.${app}.v1`, '1')
  })
})

/** Sign in to the owner preview and land on the language step. */
async function ownerSignIn(page: Page) {
  await localOnly(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
}

async function agree(page: Page) {
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
}

/** A saved shop made through the same review the app uses; no currency or timezone is sent,
 * only the phone's zone header the app adds to every request (src/api/timezone.ts). */
async function seed(page: Page, business: Record<string, unknown>, price: number) {
  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const prepared = await page.request.post('/api/v1/proposals', {
    headers: { 'X-Client-Timezone': zone },
    data: {
      kind: 'business',
      revision: 0,
      business: { phone: '', ...business },
      products: [{ name: 'Kopi', price, unit: 'cup', category: 'Drinks' }],
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  expect(proposal.snapshot.business.currency).toBeTruthy()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  return proposal.snapshot.business as { currency: string; timezone?: string }
}

async function openPayments(page: Page) {
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Payments & rides/ }).click()
  await expect(page.getByRole('heading', { name: 'Payments & rides', exact: true })).toBeVisible()
}

test('PayNow payloads match the backend SGQR builder', () => {
  // backend/app/payments.py paynow_payload, same inputs (tests/test_region.py checks the CRC).
  expect(paynowPayload('+6591234567', 'Kopi Corner', '4.50', 'Order 7')).toBe(
    '00020101021226380009SG.PAYNOW010100211+65912345670301052040000530370254044.505802SG' +
      '5911Kopi Corner6009Singapore62110107Order 763043F62',
  )
  expect(paynowPayload('201912345K', 'Kopi', '1.00')).toBe(
    '00020101021226370009SG.PAYNOW010120210201912345K0301052040000530370254041.005802SG' +
      '5904Kopi6009Singapore6304C48D',
  )
  for (const good of ['+6591234567', '201912345K', 'T08LL1234A'])
    expect(validPaynow(good)).toBe(true)
  for (const bad of ['91234567', '+919876543210', 'shop@bank']) expect(validPaynow(bad)).toBe(false)
})

// Read as text: the copy modules import React state, which the node test project cannot type-check.
test('Hindi copy keeps interface terms in Devanagari', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  expect(source('../src/features/connect/strings.ts')).toContain("connectType: 'पीओएस / ईआरपी'")
  expect(source('../src/features/passport/locales/indic.ts')).toContain('एक क्यूआर दूर है')
  expect(source('../src/features/customer/copyLocales.ts')).toContain('एआई')
})

test.describe('India', () => {
  test.use({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', storageState: FRESH })

  test('owner: the language step offers Hindi first with English, then rupees, UPI and Indian rides', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await ownerSignIn(page)
    const choices = page.getByRole('radiogroup', { name: 'अपनी भाषा चुनें' })
    await expect(choices).toBeVisible()
    await expect(choices.getByRole('radio', { name: 'हिन्दी' })).toBeChecked()
    await expect(choices.getByRole('radio', { name: 'English' })).toBeVisible()
    await expect(choices.getByRole('radio', { name: 'தமிழ்' })).toBeVisible()
    // Singapore's languages are not offered first in India.
    await expect(choices.getByRole('radio', { name: 'Bahasa Melayu' })).toHaveCount(0)
    await page.screenshot({ path: 'docs/qa/region/01-india-language-step.png' })
    // One tap changes the step's own words; another confirms.
    await choices.getByRole('radio', { name: 'English' }).check()
    await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await agree(page)

    const shop = await seed(page, { name: 'Courtyard Chai', category: 'Cafe' }, 1800)
    // Chrome still reports India's zone by its old name, Asia/Calcutta; both read as India.
    expect(shop.currency).toBe('INR')
    expect(shop.timezone).toMatch(/^Asia\/(Kolkata|Calcutta)$/)
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await expect(page.getByText('₹18.00').first()).toBeVisible()
    await expect(page.getByText(/S\$|SGD/)).toHaveCount(0)

    await openPayments(page)
    await expect(page.getByRole('textbox', { name: 'UPI ID', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /PayNow/ })).toHaveCount(0)
    for (const name of ['Rapido', 'Uber', 'Porter'])
      await expect(page.getByRole('checkbox', { name })).toBeChecked()
    for (const name of ['Grab', 'Gojek', 'Lalamove'])
      await expect(page.getByRole('checkbox', { name })).toHaveCount(0)
    await page.screenshot({ path: 'docs/qa/region/02-india-payments.png' })
  })

  test('customer in India never sees Singapore dollars', async ({ page }) => {
    test.setTimeout(60_000)
    await localOnly(page)
    await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    await page.goto('/explore/')
    const ask = page.getByRole('textbox', { name: 'Ask about anything nearby' })
    await expect(ask).toBeVisible({ timeout: 30_000 })
    await expect(ask).toHaveAttribute('placeholder', /₹30/)
    await ask.fill('coffee')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('article', { name: 'coffee' })).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'docs/qa/region/03-india-customer-ask.png' })
    const text = await page.evaluate(() => document.body.innerText)
    expect(text).not.toMatch(/S\$|SGD|Tiong Bahru/)
  })

  test('Hindi discovery and rescue use the phone neighborhood', async ({ page }) => {
    test.setTimeout(90_000)
    await localOnly(page)
    await page.setViewportSize({ width: 360, height: 844 })
    await page.addInitScript(() => {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language: 'hi', appearance: 'light' }),
      )
      localStorage.setItem('chalkboard.customer.journey', 'done')
    })
    await page.goto('/explore/')
    const areaChip = page
      .locator('button[aria-expanded="false"]')
      .filter({ hasText: 'Indiranagar' })
    await expect(areaChip).toBeVisible({ timeout: 30_000 })
    await expect(areaChip).toHaveText('Indiranagar')
    await expect(areaChip).toHaveAttribute('aria-label', /Indiranagar/)

    await page.goto('/explore/browse')
    await expect(page.getByText('Indiranagar, Bengaluru', { exact: true })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/Tiong Bahru|S\$|SGD/)

    await page.goto('/explore/chats')
    await expect(page.locator('body')).toContainText('एआई से पूछना')
    await expect(page.locator('body')).not.toContainText(/\bAI\b/)

    await page.goto('/explore/rescue')
    await expect(page.getByRole('heading', { name: 'रेस्क्यू' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('body')).toContainText('Indiranagar')
    await expect(page.locator('body')).toContainText('प्रकाशित जीवन-चक्र अध्ययन')
    await expect(page.locator('body')).not.toContainText(
      /Tiong Bahru|Too Good To Go|S\$|SGD|\bAI\b/,
    )
  })
})

test.describe('Singapore', () => {
  test.use({ locale: 'en-SG', timezoneId: 'Asia/Singapore', storageState: FRESH })

  test('owner: English first with Chinese, Malay and Tamil, then S$, PayNow and Grab', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await ownerSignIn(page)
    const choices = page.getByRole('radiogroup', { name: 'Choose your language' })
    await expect(choices.getByRole('radio', { name: 'English' })).toBeChecked()
    for (const name of ['简体中文', 'Bahasa Melayu', 'தமிழ்'])
      await expect(choices.getByRole('radio', { name })).toBeVisible()
    await expect(choices.getByRole('radio', { name: 'हिन्दी' })).toHaveCount(0)
    await page.getByRole('button', { name: 'More languages' }).click()
    await expect(choices.getByRole('radio', { name: 'हिन्दी' })).toBeVisible()
    await page.screenshot({ path: 'docs/qa/region/04-singapore-language-step.png' })
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await agree(page)

    const shop = await seed(page, { name: 'Kopi Corner', category: 'Cafe', ...TIONG_BAHRU }, 180)
    // Singapore time is the stored default, so the snapshot leaves it out (merchant.py).
    expect(shop.currency).toBe('SGD')
    expect(shop.timezone ?? 'Asia/Singapore').toBe('Asia/Singapore')
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await expect(page.getByText('S$1.80').first()).toBeVisible()
    await expect(page.getByText('₹')).toHaveCount(0)

    await openPayments(page)
    await expect(page.getByRole('textbox', { name: 'UPI ID', exact: true })).toHaveCount(0)
    for (const name of ['Grab', 'Gojek', 'Lalamove'])
      await expect(page.getByRole('checkbox', { name })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Rapido' })).toHaveCount(0)
    await page.getByRole('textbox', { name: 'PayNow mobile or UEN' }).fill('91234567')
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(page.getByText('Use +65 and 8 digits, or your UEN.')).toBeVisible()
    await page.getByRole('textbox', { name: 'PayNow mobile or UEN' }).fill('+6591234567')
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    const amount = page.getByRole('textbox', { name: 'Amount (S$)', exact: true })
    await amount.fill('4.50')
    await page.getByRole('button', { name: 'Create link', exact: true }).click()
    await expect(page.getByRole('img', { name: 'QR · Kopi Corner · S$4.50' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Save QR' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open UPI' })).toHaveCount(0)
    await page.screenshot({ path: 'docs/qa/region/05-singapore-paynow.png' })
  })

  test('customer: the language step comes right after sign-in and keeps the page', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await localOnly(page)
    await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    await page.goto('/explore/')
    await expect(page.getByRole('textbox', { name: 'Ask about anything nearby' })).toHaveAttribute(
      'placeholder',
      /S\$3/,
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: 'Profile and preferences' }).click()
    await page.getByRole('button', { name: /Continue with Google/ }).click()
    // The dialog is named by its heading, which follows the language picked.
    const step = page.getByRole('dialog')
    await expect(step).toHaveAccessibleName('Choose your language')
    await expect(step.getByRole('radio', { name: 'English' })).toBeChecked()
    await step.getByRole('radio', { name: '简体中文' }).check()
    await expect(step.getByRole('heading', { name: '选择语言' })).toBeVisible()
    await page.screenshot({ path: 'docs/qa/region/06-singapore-customer-language.png' })
    await step.getByRole('button', { name: '继续' }).click()
    await expect(page.getByRole('dialog', { name: /选择语言|Choose your language/ })).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
    // Chosen once: a reload never asks again.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
    await expect(page.getByRole('radiogroup')).toHaveCount(0)
  })
})
