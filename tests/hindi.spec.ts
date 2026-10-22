import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { enter, image, localOnly, otherOwnersWords, seedShop, share } from './stories/support.js'

// Hindi end to end at 360px. The owner app set to Hindi and a customer
// whose phone is in Hindi walk the main screens; each must read in Hindi: no English UI words
// (brands, units and the owner's own words excepted), ₹ prices, Hindi dates, and nothing wider
// than the phone. Offline fixtures only: live Gemini replies are checked by hand (see the doc).
test.skip(({ isMobile }) => !isMobile, 'One 360px phone pass')
test.use({
  viewport: { width: 360, height: 780 },
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  reducedMotion: 'reduce',
})

const SHOTS = 'docs/qa/hindi'
/** Words that stay as they are in Hindi: brands, payment rails, acronyms and units. */
const BRANDS = [
  'Chalkboard',
  'Google Maps',
  'Google',
  'Gemini',
  'TimesFM',
  'Excel',
  'Open-Meteo',
  'CC BY 4.0',
  'UPI ID',
  'UPI',
  'POS',
  'ERP',
  'SAP',
  'IDoc',
  'QR',
  'AI',
  'Swiggy',
  'Rapido',
  'Uber',
  'Porter',
  'Z',
]
/** The owner's own words (seedShop, the item read off the photo) and demo map places. */
const OWNER_WORDS = [
  'Courtyard Chai · Bengaluru',
  'Indiranagar, Bengaluru',
  'Your eighth chai is free',
  'Kaya toast',
  'Kopi',
  'Chai',
  'Cafe',
  'Breakfast',
  'courtyard@okaxis',
  'Tiong Bahru Kopi',
  'Tiong Bahru Bakery',
  'Chinatown Hawker Centre',
  'Tiong Bahru',
  // Release 3's area fallback (#54) for a rupee phone with no location yet.
  'Indiranagar',
]

/** Visible text, labels, placeholders and alt text that still contain English words. */
async function englishLeft(page: Page, more: string[] = []) {
  return page.evaluate(
    ({ keep }) => {
      const found = new Set<string>()
      const check = (text: string | null | undefined) => {
        if (!text) return
        let rest = text
        for (const word of keep) rest = rest.split(word).join(' ')
        if (/[A-Za-z]{2,}/.test(rest)) found.add(text.trim().slice(0, 120))
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue
        const box = parent.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        check(node.textContent)
      }
      for (const el of Array.from(
        document.querySelectorAll('[aria-label],[placeholder],[title],img[alt]'),
      )) {
        for (const name of ['aria-label', 'placeholder', 'title', 'alt'])
          check(el.getAttribute(name))
      }
      return [...found]
    },
    // Longest first, so a shop name goes before a word inside it.
    { keep: [...more, ...OWNER_WORDS, ...BRANDS].sort((a, b) => b.length - a.length) },
  )
}

/** Hindi only, nothing wider than the phone, and a screenshot for the QA doc. */
async function readsInHindi(page: Page, name: string, more: string[] = []) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForTimeout(300)
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  expect(await page.evaluate(() => document.documentElement.lang), name).toBe('hi')
  expect.soft(await englishLeft(page, more), `${name}: English words`).toEqual([])
  expect
    .soft(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${name}: sideways scroll at 360px`,
    )
    .toBe(true)
}

async function ownerInHindi(page: Page) {
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
  await page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'मुख्य मेन्यू' }).getByRole('button', { name, exact: true })

async function growCard(page: Page, name: RegExp) {
  await tab(page, 'बढ़ाएँ').click()
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function closeSheet(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('the owner app reads in Hindi: Today, coach, Shop, Grow tools, You, privacy', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ownerInHindi(page)
  await expect(page.getByRole('link', { name: 'सामग्री पर जाएँ' })).toBeAttached()
  await readsInHindi(page, '01-today')

  await test.step('coach text turn', async () => {
    await page.getByLabel('संदेश', { exact: true }).fill('आज कितने कप चाय बिकी?')
    await page.getByRole('button', { name: 'भेजें', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('ऑफ़लाइन नमूना')
    await readsInHindi(page, '02-coach-reply')
  })

  await test.step('menu photo', async () => {
    // A photo is ignored while the reply is still finishing: the attach button is the idle signal.
    await expect(page.getByRole('button', { name: 'फ़ोटो या दस्तावेज़ जोड़ें' })).toBeEnabled()
    await page
      .locator('input[type=file][accept*="image"]')
      .first()
      .setInputFiles(await image(page))
    // #87: a chat photo is confirmed in one line first ("यह फ़ोटो क्या है?"), then routed.
    await page
      .getByRole('group', { name: 'यह फ़ोटो क्या है?' })
      .getByRole('button', { name: 'मेन्यू' })
      .click({ timeout: 60_000 })
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 })
    await readsInHindi(page, '03-menu-photo')
    await closeSheet(page)
  })

  await test.step('Shop: ₹ prices', async () => {
    await tab(page, 'दुकान').click()
    await expect(page.getByText('₹18.00')).toBeVisible()
    await readsInHindi(page, '04-shop')
  })

  await test.step('Grow: Hindi dates', async () => {
    await tab(page, 'बढ़ाएँ').click()
    await expect(page.getByRole('button', { name: /^हफ़्ते का सार/ })).toContainText('अक्टू')
    await readsInHindi(page, '05-grow')
  })

  await test.step('Close the day: photo read and review', async () => {
    await growCard(page, /^दिन बंद करें/)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /बिलिंग या POS रिपोर्ट/ }).click()
    await dialog
      .locator('input[type=file]')
      .first()
      .setInputFiles(await image(page))
    await dialog.getByRole('button', { name: /^जाँचें/ }).click({ timeout: 20_000 })
    await readsInHindi(page, '06-close-day-review')
    await closeSheet(page)
  })

  await test.step('Plan tomorrow: units in Hindi', async () => {
    await growCard(page, /^कल की योजना/)
    await expect(page.getByLabel('तैयार स्टॉक (कप)')).toBeVisible()
    await readsInHindi(page, '07-plan-tomorrow')
    await closeSheet(page)
  })

  await test.step('rescue offer', async () => {
    await growCard(page, /^बचे माल के ऑफ़र/)
    await readsInHindi(page, '08-rescue')
    await closeSheet(page)
  })

  await test.step('purchase order', async () => {
    const purchaseCard = page
      .getByRole('button')
      .filter({ has: page.getByText('खरीद पर्चियाँ', { exact: true }) })
    await expect(purchaseCard).toHaveCount(1)
    await purchaseCard.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // The sandbox supplier's name comes from the imported SAP document (data, not interface copy).
    await readsInHindi(page, '09-purchase-order', ['SAP supplier'])
    await closeSheet(page)
  })

  await test.step('payment link: ₹ amount and QR', async () => {
    await tab(page, 'बढ़ाएँ').click()
    await page.getByRole('button', { name: /^भुगतान और राइड/ }).click()
    await page.getByRole('textbox', { name: 'UPI ID' }).fill('courtyard@okaxis')
    await page.getByRole('button', { name: 'सेटिंग सहेजें' }).click()
    await expect(page.getByText('सेटिंग सहेजी गई')).toBeVisible()
    await page.getByRole('textbox', { name: 'राशि (₹)' }).fill('120')
    await page.getByRole('button', { name: 'लिंक बनाएँ' }).click()
    await expect(page.getByRole('img', { name: /₹120\.00/ })).toBeVisible()
    await readsInHindi(page, '10-payment-link')
  })

  await test.step('You', async () => {
    await tab(page, 'आप').click()
    await expect(page.getByText('Cafe · 1 दुकान', { exact: true })).toBeVisible()
    await readsInHindi(page, '11-you')
  })

  let shops: string[] = []
  await test.step('privacy and the playbook', async () => {
    await page.getByRole('button', { name: /^गोपनीयता और आपका डेटा/ }).click()
    // Every local owner is a trust reviewer: the queue names other shops (owner words), and its
    // reasons read in Hindi.
    await page.getByRole('button', { name: 'सभी दुकानें जाँचें' }).click()
    await expect(page.getByText(/समीक्षा के लिए|समीक्षा के लिए कुछ नहीं/).first()).toBeVisible()
    const trust = (await (await page.request.get('/api/v1/trust')).json()) as {
      queue?: { shop?: string; shops?: string[][]; reasons?: { other?: string }[] }[]
    }
    shops = (trust.queue ?? []).flatMap((item) => [
      item.shop ?? '',
      ...(item.shops ?? []).flat(),
      ...(item.reasons ?? []).map((reason) => reason.other ?? ''),
    ])
    shops = shops.filter(Boolean)
    await readsInHindi(page, '12-privacy', shops)
    await page.getByRole('button', { name: 'देखें यह क्या जानता है' }).click()
    await expect(page.getByText('Indiranagar, Bengaluru में Cafe की दुकान।')).toBeVisible()
    await readsInHindi(page, '13-playbook', shops)
    await closeSheet(page)
  })

  await test.step('face check', async () => {
    await page.getByRole('button', { name: 'पुष्टि करें कि यह आप हैं' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await readsInHindi(page, '14-face-check', shops)
  })
})

test('a Hindi customer: front door, Ask, results, shop page, chat, passport', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  const id = new URL(await share(page)).pathname.split('/').pop()!
  const others = await otherOwnersWords(page, { lat: 12.9716, lng: 77.6412 }, id)
  const context = await browser.newContext({
    baseURL,
    locale: 'hi-IN',
    viewport: { width: 360, height: 780 },
    timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce',
  })
  const customer = await context.newPage()
  await localOnly(customer)
  try {
    await customer.goto('/explore/')
    // Release 3's front door (#60) opens on the Ask, with no welcome step to continue past.
    await expect(customer.getByRole('heading', { name: 'आस-पास क्या खोज रहे हैं?' })).toBeVisible()
    await readsInHindi(customer, '20-front-door', others)

    await customer.evaluate(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    await customer.goto('/explore/')
    // The Ask box, not #60's inline "where" field above it.
    await customer.getByRole('search').getByRole('textbox').fill('पास में चाय')
    await customer.keyboard.press('Enter')
    await expect(customer.getByText(/^नमूना जवाब/).first()).toBeVisible({ timeout: 20_000 })
    await readsInHindi(customer, '21-ask-results', others)

    await customer.goto(`/explore/s/${id}`)
    await expect(
      customer.getByRole('heading', { name: 'Courtyard Chai · Bengaluru', level: 1 }),
    ).toBeVisible()
    await expect(customer.getByText('कैफ़े').first()).toBeVisible()
    await expect(customer.getByText('₹18.00').first()).toBeVisible()
    await readsInHindi(customer, '22-shop-page', others)

    await customer.getByRole('button', { name: 'दुकान से बात करें' }).first().click()
    await expect(customer.getByRole('dialog')).toBeVisible()
    await readsInHindi(customer, '23-chat')
    await customer.keyboard.press('Escape')

    await customer.goto('/explore/passport')
    await expect(customer.getByText('आपका पहला स्टैंप बस एक क्यूआर दूर है')).toBeVisible()
    await readsInHindi(customer, '24-passport')
  } finally {
    await context.close()
  }
})
