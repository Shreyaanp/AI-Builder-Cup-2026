import { mkdir } from 'node:fs/promises'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

const en = {
  continuePreview: 'Continue local preview',
  firstCustomers: 'Get your first customers',
  printPoster: 'Print a poster',
  downloadPdf: 'Download PDF',
  shareWhatsApp: 'Share on WhatsApp',
  scanStamps: 'Scan for stamps',
  shareMessage: (name: string) => `See ${name}’s menu and prices`,
  qrAlt: (name: string) => `QR code for ${name}’s customer page`,
}
const hi = {
  continuePreview: 'स्थानीय प्रीव्यू जारी रखें',
  firstCustomers: 'अपने पहले ग्राहक पाएँ',
  printPoster: 'पोस्टर प्रिंट करें',
  downloadPdf: 'PDF डाउनलोड करें',
  shareWhatsApp: 'WhatsApp पर भेजें',
  scanStamps: 'स्टैंप के लिए स्कैन करें',
  shareMessage: (name: string) => `${name} का मेन्यू और दाम देखें`,
  qrAlt: (name: string) => `${name} के ग्राहक पेज का QR कोड`,
}

test('phone: first customers, localized sharing, printable A4/A5 and stamp dismissal', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow.')
  test.setTimeout(240_000)
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(90_000)
  await localOnly(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await enter(page)
  const name = 'Courtyard Chai & Snacks'
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      revision: 0,
      // OB-168: a shared shop needs the owner's pin, not only address text.
      owner_location: { lat: 12.9716, lng: 77.5946, accuracy_m: 0, source: 'pin' },
      business: { name, category: 'Tea stall', location: 'Bengaluru', currency: 'INR' },
      products: [],
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  const saved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(saved.ok()).toBe(true)
  const { business_id: id } = await saved.json()
  let hasStamp: boolean | null = false
  await page.route('**/api/v1/businesses/*/today', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      json: { ...(await response.json()), has_customer_stamp: hasStamp },
    })
  })
  // The card waits for go-live even when the history confirms zero stamps.
  await page.reload()
  await page.getByRole('button', { name: en.continuePreview }).click()
  await expect(page.getByTestId('today')).toBeVisible()
  await expect(page.getByTestId('first-customers')).toHaveCount(0)
  expect(
    (await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })).ok(),
  ).toBe(true)
  await mkdir('output/playwright', { recursive: true })
  let failQr = true
  await page.route('**/api/v1/businesses/*/qr-key', async (route) => {
    if (failQr) {
      await route.fulfill({ status: 503, json: {} })
    } else await route.fallback()
  })
  for (const language of ['en', 'hi'] as const) {
    const t = language === 'hi' ? hi : en
    for (const appearance of ['light', 'dark'] as const) {
      await page.evaluate(
        ({ language, appearance }) =>
          localStorage.setItem(
            'niva.starter.preferences',
            JSON.stringify({ language, appearance }),
          ),
        { language, appearance },
      )
      await page.reload()
      await page.getByRole('button', { name: t.continuePreview }).click()
      const card = page.getByTestId('first-customers')
      await expect(card.getByRole('heading', { name: t.firstCustomers })).toBeVisible()
      const share = new URL(
        (await card.getByRole('link', { name: t.shareWhatsApp }).getAttribute('href'))!,
      )
      expect(share.origin + share.pathname).toBe('https://wa.me/')
      const text = share.searchParams.get('text')!
      expect(text).toContain(t.shareMessage(name))
      expect(text).toContain(`/s/${id}`)
      expect(text).not.toContain('source=qr')
      for (const width of [360, 390, 412, 1440]) {
        await page.setViewportSize({ width, height: 844 })
        if (width === 390 || width === 1440) {
          await card.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: `output/playwright/qr-card-${language}-${appearance}-${width}.png`,
          })
        }
        await card.getByRole('button', { name: t.printPoster }).click()
        const sheet = page.getByRole('dialog', { name: t.printPoster })
        if (language === 'en' && appearance === 'light' && width === 360) {
          await expect(sheet.getByRole('alert')).toBeVisible({ timeout: 15_000 })
          await expect(sheet.getByRole('button', { name: t.downloadPdf })).toBeDisabled()
          failQr = false
          await sheet.getByRole('button', { name: 'Try again', exact: true }).click()
        }
        await expect(sheet.getByRole('img', { name: t.qrAlt(name) })).toBeVisible()
        await expect(sheet.getByRole('button', { name: t.downloadPdf })).toBeEnabled()
        await expect(sheet.getByText(t.scanStamps)).toBeVisible()
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true)
        if (width === 1440) {
          await page.screenshot({
            path: `output/playwright/qr-desktop-${language}-${appearance}.png`,
          })
        }
        if (width === 390) {
          expect(
            (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
              .violations,
          ).toEqual([])
          await page.screenshot({ path: `output/playwright/qr-${language}-${appearance}.png` })
          await page.evaluate(() => {
            window.print = () => {
              document.body.dataset.printed = 'yes'
            }
          })
          await sheet.getByRole('button', { name: t.downloadPdf }).click()
          await expect(page.locator('body')).toHaveAttribute('data-printed', 'yes')
          for (const paper of ['A4', 'A5']) {
            await sheet.getByRole('button', { name: paper, exact: true }).click()
            await page.emulateMedia({ media: 'print' })
            const print = page.locator('.shop-qr-print')
            await expect(print).toBeVisible()
            await expect(page.locator('#root')).toBeHidden()
            expect(Math.round((await print.boundingBox())!.width)).toBe(paper === 'A4' ? 794 : 559)
            await page.screenshot({
              path: `output/playwright/qr-print-${language}-${appearance}-${paper}.png`,
              fullPage: true,
            })
            const pdf = await page.pdf({
              path: `output/playwright/qr-${language}-${appearance}-${paper}.pdf`,
              preferCSSPageSize: true,
            })
            expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
            const box = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'))
            expect(box).not.toBeNull()
            expect(Math.abs(Number(box![1]) - (paper === 'A4' ? 595.28 : 419.53))).toBeLessThan(1.5)
            expect(Math.abs(Number(box![2]) - (paper === 'A4' ? 841.89 : 595.28))).toBeLessThan(1.5)
            await page.emulateMedia({ media: 'screen' })
          }
        }
        // Print emulation hides the focused sheet controls; restore keyboard focus after it.
        await sheet.getByRole('button', { name: t.downloadPdf }).focus()
        await page.keyboard.press('Escape')
        await expect(sheet).toHaveCount(0)
        await expect(card.getByRole('button', { name: t.printPoster })).toBeFocused()
      }
    }
  }
  // Unknown history (switch off or failed load) never establishes zero stamps.
  for (const status of [true, null]) {
    hasStamp = status
    await page.reload()
    await page.getByRole('button', { name: hi.continuePreview }).click()
    await expect(page.getByTestId('today')).toBeVisible()
    await expect(page.getByTestId('first-customers')).toHaveCount(0)
  }
})
