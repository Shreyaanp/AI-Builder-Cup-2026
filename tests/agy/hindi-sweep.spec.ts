import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop } from '../stories/support.js'

test.use({
  viewport: { width: 390, height: 844 },
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  reducedMotion: 'reduce',
  hasTouch: true,
})

const ALLOW = [
  'Chalkboard',
  'Google',
  'Gemini',
  'TimesFM',
  'Excel',
  'Petpooja',
  'SAP',
  'IDoc',
  'ASN',
  'POS',
  'ERP',
  'UPI',
  'AI',
  'CSV',
  'JSON',
  'XML',
  'PO',
  // Data the owner or the sandbox wrote, not UI words.
  'Courtyard Chai · Bengaluru',
  'Open-Meteo',
  'Your eighth chai is free',
  'SAP supplier',
  'Milk shop (Supply demo)',
  'Milk',
  'Grocery',
  'Cafe',
  'Lantern Chai Corner (Demo) (Tour)',
  'Lantern Chai Corner (Demo)',
  'Tea stall',
  '1 Demo Lane, Indiranagar, Bengaluru (fictional address)',
  'Masala chai',
  'Ginger chai',
  'Bun maska',
  'Ragi biscuit',
]

async function hindiOnly(page: Page, label: string) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  const english = await page.evaluate((allow) => {
    const found = new Set<string>()
    const check = (value: string | null) => {
      if (!value) return
      let text = value
      for (const word of [...allow].sort((a, b) => b.length - a.length))
        text = text.replaceAll(word, ' ')
      if (/[A-Za-z]{4,}/.test(text)) found.add(value.trim().slice(0, 120))
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue
      const rect = parent.getBoundingClientRect()
      if (rect.width && rect.height) check(node.textContent)
    }
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>('[aria-label],[placeholder],[title],img[alt]'),
    ))
      for (const name of ['aria-label', 'placeholder', 'title', 'alt'])
        check(element.getAttribute(name))
    return [...found]
  }, ALLOW)
  expect(english, `${label}: English UI words`).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${label}: horizontal overflow at 390px`,
  ).toBe(true)
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'मुख्य मेन्यू' }).getByRole('button', { name, exact: true })

test('Hindi phone sweep: supply, reminders, onboarding, tour and demo', async ({ page }) => {
  test.setTimeout(150_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await page.evaluate(() =>
    localStorage.setItem(
      'niva.starter.preferences',
      JSON.stringify({ language: 'hi', appearance: 'light' }),
    ),
  )
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें', exact: true }).click()

  await tab(page, 'बढ़ाएँ').click()
  await page.getByRole('button', { name: /^खरीद/ }).click()
  await hindiOnly(page, 'खरीद और उधार शर्तें')
  await page.getByRole('button', { name: 'सामान मँगाने का डेमो देखें', exact: true }).click()
  await tab(page, 'बढ़ाएँ').click()
  await page.getByRole('button', { name: /^आपूर्ति/ }).click()
  await hindiOnly(page, 'माल की रवानगी, रसीद और ASN क्रम')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'आप', exact: true }).click()
  await page.getByRole('button', { name: 'फिर देखें', exact: true }).click()
  await hindiOnly(page, 'पहली शुरुआत का कार्ड 1')
  await page.getByRole('button', { name: 'आगे', exact: true }).click()
  await hindiOnly(page, 'पहली शुरुआत का कार्ड 2')
  await page.getByRole('button', { name: 'आगे', exact: true }).click()
  await hindiOnly(page, 'पहली शुरुआत का कार्ड 3')
  await page.getByRole('button', { name: 'शुरू करें', exact: true }).click()

  await expect(page.getByLabel('याद दिलाएँ')).toBeVisible()
  await hindiOnly(page, 'याद दिलाने की सेटिंग')

  await page.getByRole('button', { name: 'दौरा शुरू करें', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  await hindiOnly(page, 'दुकान का निर्देशित दौरा')
  await page.getByRole('button', { name: 'टूर बंद करें', exact: true }).click()

  await page.goto('/demo')
  await expect(page.getByText('डेमो दुकान - यहाँ कुछ भी असली नहीं है')).toBeVisible({
    timeout: 30_000,
  })
  await hindiOnly(page, 'डेमो दुकान')
})
