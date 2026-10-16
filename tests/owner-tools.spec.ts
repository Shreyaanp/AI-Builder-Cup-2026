import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import {
  normalizeAmount,
  paymentLink,
  riderLink,
  validUpi,
} from '../src/features/owner-tools/links.js'
import { localOnly } from './stories/support.js'
import { openTool, ownerTools, preparePayment } from './owner-tools-support.js'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('UPI boundaries and provider universal links preserve exact values', () => {
  for (const value of ['0', '-240', '1e2', 'NaN', '1.234', '10000000.01', '1,000'])
    expect(normalizeAmount(value)).toBeNull()
  expect(normalizeAmount('0.01')).toBe('0.01')
  expect(normalizeAmount('10000000')).toBe('10000000.00')
  for (const value of ['a@b', 'shop', 'shop@bank?am=1', 'shop @bank'])
    expect(validUpi(value)).toBe(false)
  const link = paymentLink('shop@bank', 'Tea & toast', '240', 'Order #4 & tea')!
  expect(new URL(link.url).searchParams.get('tn')).toBe('Order #4 & tea')
  const pickup = { lat: 12.9716, lng: 77.5946, name: 'Tea & Toast' }
  const ride = new URL(riderLink('uber', pickup, 'Market Road #2 & gate 3'))
  expect(ride.searchParams.get('pickup[latitude]')).toBe('12.9716')
  expect(ride.searchParams.get('pickup[longitude]')).toBe('77.5946')
  expect(ride.searchParams.get('dropoff[formatted_address]')).toBe('Market Road #2 & gate 3')
  expect(
    new URL(riderLink('uber', pickup, '12.98, 77.61')).searchParams.get('dropoff[latitude]'),
  ).toBe('12.98')
  expect(riderLink('rapido', pickup, 'Market')).toBe('https://www.rapido.bike/')
  expect(riderLink('porter', pickup, 'Market')).toBe('https://porter.in/')
})

for (const appearance of ['light', 'dark']) {
  test(`payments, rider handoffs and guide: ${appearance}`, async ({ page }, info) => {
    if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(
      (appearance) =>
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ appearance, language: 'en' }),
        ),
      appearance,
    )
    await ownerTools(page, true)
    const uri = await preparePayment(page)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.screenshot({
      path: `docs/stories/payments-${info.project.name}-${appearance}.png`,
      fullPage: true,
    })
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            ;(window as unknown as { copied: string }).copied = value
          },
        },
      }),
    )
    await page.getByRole('button', { name: 'Copy link', exact: true }).click()
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(uri)
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible()
    await page.getByText('Send a rider', { exact: true }).click()
    await page.getByRole('textbox', { name: 'Drop address or pin' }).fill('12.98, 77.61')
    const uber = new URL(
      (await page.getByRole('link', { name: 'Uber', exact: true }).getAttribute('href'))!,
    )
    expect(uber.searchParams.get('dropoff[latitude]')).toBe('12.98')
    expect(uber.searchParams.has('pickup[latitude]')).toBe(true)
    await expect(page.getByRole('link', { name: 'Rapido · Open home' })).toHaveAttribute(
      'href',
      'https://www.rapido.bike/',
    )
    await expect(page.getByRole('link', { name: 'Porter · Open home' })).toHaveAttribute(
      'href',
      'https://porter.in/',
    )
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await openTool(page, 'Talk to your coach')
    const forecast = page.getByRole('button', { name: /^Forecast demand for / })
    await expect(forecast).toBeVisible()
    const sentence = (await forecast.textContent())!
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({
      path: `docs/stories/guide-${info.project.name}-${appearance}.png`,
      fullPage: true,
    })
    await forecast.click()
    await expect(page.getByRole('log')).toContainText(sentence)
    await expect(page.getByRole('button', { name: 'Stop reply', exact: true })).toHaveCount(0)
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Send a payment link for ₹240 to the customer')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(
      page.getByRole('log').getByRole('link', { name: 'Open UPI', exact: true }),
    ).toHaveAttribute('href', /am=240.00/)
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await expect(
      page.getByRole('log').getByRole('link', { name: 'Open UPI', exact: true }),
    ).toHaveAttribute('href', /am=240.00/)
    await page.goto('/?app=landing')
    await expect(
      page.getByRole('heading', { name: 'For shop owners. For neighbours.', level: 1 }),
    ).toBeVisible()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.screenshot({
      path: `docs/stories/landing-${info.project.name}-${appearance}.png`,
      fullPage: true,
    })
  })
}

test('settings errors recover, no-pin rides explain next step, all guide chips send their own sentence', async ({
  page,
}) => {
  await ownerTools(page)
  await openTool(page, 'Payments & rides')
  const upi = page.getByRole('textbox', { name: 'UPI ID', exact: true })
  await upi.fill('bad@')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(upi).toBeFocused()
  await expect(page.getByText('Use a UPI ID like shop@bank.')).toBeVisible()
  await upi.fill('shop@bank')
  await page.getByRole('checkbox', { name: 'Rapido', exact: true }).uncheck()
  await page.route(
    /\/api\/v1\/businesses\/[^/]+\/update\?/,
    (route) => route.fulfill({ status: 503 }),
    { times: 1 },
  )
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save. Try again.')
  await expect(upi).toHaveValue('shop@bank')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.getByRole('button', { name: 'Create link', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Amount (INR)' })).toBeFocused()
  await expect(page.getByText(/Enter ₹0.01/)).toBeVisible()
  await page.getByText('Send a rider', { exact: true }).click()
  await expect(page.getByText('Add a shop pin in your shop details first.')).toBeVisible()
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  expect(shop.fields.upi_id).toBe('shop@bank')
  expect(shop.fields.rider_providers).toEqual(['uber', 'porter'])
  const sent: string[] = []
  await page.route('**/api/v1/coach/stream', (route) => {
    sent.push(route.request().postDataJSON().message)
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"kind":"ready","mode":"offline"}\n\ndata: {"kind":"reply","text":"Received"}\n\ndata: {"kind":"turn_complete"}\n\n',
    })
  })
  for (let i = 0; i < 7; i++) {
    await openTool(page, 'Talk to your coach')
    const chips = page
      .locator('main')
      .getByRole('button')
      .filter({ hasText: /^(Help me|Forecast demand|Find suppliers|What are customers)/ })
    await expect(chips).toHaveCount(7)
    const text = (await chips.nth(i).textContent())!
    await chips.nth(i).click()
    await expect(page.getByRole('log')).toContainText(text)
    await expect.poll(() => sent.length).toBe(i + 1)
    expect(sent[i]).toBe(text)
  }
})

test('help preserves a typed coach draft and browser Back closes the guide', async ({ page }) => {
  await ownerTools(page)
  const composer = page.getByRole('textbox', { name: 'Message', exact: true })
  const coach = page.getByRole('button', { name: 'Coach', exact: true })
  await composer.fill('My unfinished question')
  await openTool(page, 'Talk to your coach')
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await coach.click()
  await expect(composer).toHaveValue('My unfinished question')
  await openTool(page, 'Talk to your coach')
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/feature=guide/)
  await coach.click()
  await expect(composer).toHaveValue('My unfinished question')
  await composer.fill('')
  await openTool(page, 'Talk to your coach')
  await page.goBack()
  await expect(page).not.toHaveURL(/feature=guide/)
  await coach.click()
  await expect(composer).toBeVisible()
})

test('native sharing and clipboard failure preserve a selectable link', async ({ page }) => {
  await ownerTools(page)
  const uri = await preparePayment(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        ;(window as unknown as { shared: ShareData }).shared = data
      },
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Blocked')
        },
      },
    })
  })
  await page.getByRole('button', { name: 'Share link', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { shared: ShareData }).shared.text)).toBe(
    uri,
  )
  await page.getByRole('button', { name: 'Copy link', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Could not share' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Copy link', exact: true })).toHaveValue(uri)
})

test('15 locale copy contracts preserve placeholders and render Indic/CJK screens', async ({
  page,
}) => {
  await page.goto('/?app=landing')
  const values = await page.evaluate(async () => {
    const path = '/src/features/owner-tools/copy.ts'
    const mod = await import(path)
    return { english: mod.english, translations: mod.translations }
  })
  for (const locale of LOCALES.filter((value) => value !== 'en')) {
    const row = values.translations[locale]
    expect(Object.keys(row)).toEqual(Object.keys(values.english))
    for (const [key, value] of Object.entries(values.english) as [string, string][]) {
      expect(row[key].length).toBeGreaterThan(0)
      expect(row[key].match(/\{\w+\}/g) ?? []).toEqual(value.match(/\{\w+\}/g) ?? [])
    }
  }
  for (const locale of ['hi', 'ja']) {
    await page.evaluate(
      (language) =>
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ language, appearance: 'dark' }),
        ),
      locale,
    )
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
})

test('guide and payment settings render in all 15 locales', async ({ page }, info) => {
  test.setTimeout(300_000)
  await ownerTools(page)
  const labels = await page.evaluate(async () => {
    const copyPath = '/src/features/owner-tools/copy.ts'
    const shellPath = '/src/features/v1/locales/index.ts'
    const englishPath = '/src/features/v1/strings.ts'
    const copy = await import(copyPath)
    const shell = await import(shellPath)
    const english = await import(englishPath)
    return {
      tools: { en: copy.english, ...copy.translations },
      shell: { en: english.en, ...shell.translations },
    }
  })
  for (const language of LOCALES) {
    const t = labels.tools[language]
    await page.evaluate(
      (language) =>
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ language, appearance: 'dark' }),
        ),
      language,
    )
    await page.goto('/?feature=guide')
    await page
      .getByRole('button', { name: labels.shell[language].continuePreview, exact: true })
      .click()
    await expect(page.getByRole('heading', { name: t.guideTitle, exact: true })).toBeVisible()
    await expect(page.locator('main .MuiChip-root:visible')).toHaveCount(7)
    if (language === 'hi' || language === 'ja') {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '24px'
      })
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({
        path: `docs/stories/guide-${info.project.name}-${language}.png`,
        fullPage: true,
      })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    await page.evaluate(async () => {
      const path = '/src/features/owner-tools/entry.ts'
      const entry = await import(path)
      entry.openOwnerFeature('payments')
    })
    await expect(page.getByRole('heading', { name: t.payTitle, exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: t.upiId, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    if (language === 'hi' || language === 'ja') {
      await page.screenshot({
        path: `docs/stories/payments-${info.project.name}-${language}.png`,
        fullPage: true,
      })
    }
  }
})
