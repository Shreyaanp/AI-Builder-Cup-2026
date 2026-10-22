import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, otherOwnersWords } from './stories/support.js'

// Singapore languages end to end at 360px. A Singapore shop (pin
// in Tiong Bahru, no currency sent) with the owner app set in turn to English, Mandarin, Malay
// and Tamil, and a customer whose phone is in that language. Every screen must read in its
// language (brands, units and the owner's own words excepted), show S$ and never ₹, and fit the
// phone. Offline fixtures only: live Gemini replies were checked by hand (see the doc).
test.skip(({ isMobile }) => !isMobile, 'One 360px phone pass')
test.use({
  viewport: { width: 360, height: 780 },
  locale: 'en-SG',
  timezoneId: 'Asia/Singapore',
  reducedMotion: 'reduce',
})

const SHOTS = 'docs/qa/sg-languages'
const SHOP = 'Kopi Corner'
const TIONG_BAHRU = { lat: 1.2847, lng: 103.832 }
/** Kopi at S$1.80; Tamil puts a space after the symbol (S$ 1.80), as Intl does for ta-SG. */
const PRICE = /S\$\s?1\.80/

/** Words that stay as they are in every language: brands, payment rails, acronyms and units. */
const BRANDS = [
  'Chalkboard',
  'Google Maps',
  'Google',
  'Gemini',
  'Open-Meteo',
  'CC BY 4.0',
  'PayNow',
  'GrabPay',
  'GrabFood',
  'NETS',
  'UEN',
  'Grab',
  'Gojek',
  'Lalamove',
  'foodpanda',
  'POS',
  'ERP',
  'QR',
  'AI',
  'GST',
  'S$',
]
/** The owner's own words (the seeded shop) and demo map places. */
const OWNER_WORDS = [
  `${SHOP} · Tiong Bahru`,
  SHOP,
  'Your tenth kopi is free',
  'Kaya toast',
  'Teh tarik',
  'Kopi',
  'Cafe',
  'Drinks',
  'Breakfast',
  'Tiong Bahru Kopi',
  'Tiong Bahru Bakery',
  'Chinatown Hawker Centre',
  'Tiong Bahru',
  'Chinatown',
  'Singapore',
]
/** English UI words that are not Malay: Malay is written in Latin script too, so it is checked
 * for these instead of for any Latin letters. */
const ENGLISH =
  /\b(the|and|your|you|with|for|this|that|save|settings|today|customers?|payments?|prices?|add|close|review|check|share|week|sold|open now|ask|chat|stamps?|privacy|delete|edit|back|next|continue)\b/i

type Lang = {
  code: 'en' | 'zh-Hans' | 'ms' | 'ta'
  phone: string
  preview: string
  nav: { main: string; shop: string; grow: string; you: string }
  message: string
  send: string
  payTitle: RegExp
  paynowId: string
  save: string
  amount: string
  create: string
  chat: string
  passport: string
  /** A customer question typed in the language. */
  ask: string
}

const LANGS: Lang[] = [
  {
    code: 'en',
    phone: 'en-SG',
    preview: 'Continue local preview',
    nav: { main: 'Main', shop: 'Shop', grow: 'Grow', you: 'You' },
    message: 'Message',
    send: 'Send',
    payTitle: /^Payments & rides/,
    paynowId: 'PayNow mobile or UEN',
    save: 'Save settings',
    amount: 'Amount (S$)',
    create: 'Create link',
    chat: 'Chat with the shop',
    passport: 'Your first stamp is one QR away',
    ask: 'kopi nearby',
  },
  {
    code: 'zh-Hans',
    phone: 'zh-SG',
    preview: '继续本地预览',
    nav: { main: '主导航', shop: '店铺', grow: '成长', you: '我' },
    message: '消息',
    send: '发送',
    payTitle: /^收款与骑手/,
    paynowId: 'PayNow 手机号或 UEN',
    save: '保存设置',
    amount: '金额（S$）',
    create: '创建链接',
    chat: '和店家聊聊',
    passport: '扫一个二维码，就有第一枚印章',
    ask: '附近的咖啡',
  },
  {
    code: 'ms',
    phone: 'ms-SG',
    preview: 'Teruskan pratonton setempat',
    nav: { main: 'Navigasi utama', shop: 'Kedai', grow: 'Berkembang', you: 'Anda' },
    message: 'Mesej',
    send: 'Hantar',
    payTitle: /^Bayaran & penghantar/,
    paynowId: 'Nombor mudah alih PayNow atau UEN',
    save: 'Simpan tetapan',
    amount: 'Jumlah (S$)',
    create: 'Cipta pautan',
    chat: 'Sembang dengan kedai',
    passport: 'Setem pertama anda hanya satu QR lagi',
    ask: 'kopi berdekatan',
  },
  {
    code: 'ta',
    phone: 'ta-SG',
    preview: 'உள்ளக முன்னோட்டத்தில் தொடருங்கள்',
    nav: {
      main: 'முதன்மை வழிசெலுத்தல்',
      shop: 'கடை',
      grow: 'வளர்ச்சி',
      you: 'நீங்கள்',
    },
    message: 'செய்தி',
    send: 'அனுப்புங்கள்',
    payTitle: /^பணம் மற்றும் ரைடர்/,
    paynowId: 'PayNow கைபேசி எண் அல்லது UEN',
    save: 'அமைப்பைச் சேமி',
    amount: 'தொகை (S$)',
    create: 'இணைப்பு உருவாக்கு',
    chat: 'கடையுடன் பேசுங்கள்',
    passport: 'உங்கள் முதல் முத்திரை ஒரு QR தூரத்தில்',
    ask: 'அருகில் காபி',
  },
]

/** Visible text, labels, placeholders and alt text not in the language. */
async function leftovers(page: Page, code: Lang['code'], more: string[] = []) {
  if (code === 'en') return []
  return page.evaluate(
    ({ keep, latin, english }) => {
      const pattern = latin ? /[A-Za-z]{2,}/ : new RegExp(english, 'i')
      const found = new Set<string>()
      const check = (text: string | null | undefined) => {
        if (!text) return
        let rest = text
        for (const word of keep) rest = rest.split(word).join(' ')
        if (pattern.test(rest)) found.add(text.trim().slice(0, 120))
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue
        // The language list names every language in its own script.
        if (parent.closest('[translate="no"]')) continue
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
    {
      // Longest first, so a shop name goes before a word inside it.
      keep: [...more, ...OWNER_WORDS, ...BRANDS].sort((a, b) => b.length - a.length),
      latin: code !== 'ms',
      english: ENGLISH.source,
    },
  )
}

/** In the language, Singapore money, nothing wider than the phone, and a screenshot. */
async function readsIn(page: Page, lang: Lang, name: string, more: string[] = []) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForTimeout(300)
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${lang.code}-${name}.png` })
  expect(await page.evaluate(() => document.documentElement.lang), name).toBe(lang.code)
  expect.soft(await leftovers(page, lang.code, more), `${lang.code} ${name}: leftovers`).toEqual([])
  const text = await page.evaluate(() => document.body.innerText)
  expect.soft(text, `${lang.code} ${name}: rupees in Singapore`).not.toMatch(/₹|INR|UPI/)
  expect
    .soft(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${lang.code} ${name}: sideways scroll at 360px`,
    )
    .toBe(true)
}

/** A saved Singapore shop: its pin decides the money, so no currency or timezone is sent. */
async function seedSingapore(page: Page) {
  const prepared = await page.request.post('/api/v1/proposals', {
    headers: { 'X-Client-Timezone': 'Asia/Singapore' },
    data: {
      kind: 'business',
      revision: 0,
      // OB-168: a shared shop needs the owner's pin, not only address text.
      owner_location: { ...TIONG_BAHRU, accuracy_m: 0, source: 'pin' },
      business: {
        name: SHOP,
        category: 'Cafe',
        location: 'Tiong Bahru',
        ...TIONG_BAHRU,
        halal: 'yes',
        phone: '',
        payment_methods: ['paynow', 'cash'],
        delivery: 'grab',
        weekly_hours: [{ day: 'thu', open: '07:00', close: '20:00', closed: false }],
        reward_text: 'Your tenth kopi is free',
        stamps_needed: 10,
      },
      products: [
        { name: 'Kopi', price: 180, unit: 'cup', category: 'Drinks' },
        { name: 'Kaya toast', price: 250, unit: 'set', category: 'Breakfast' },
      ],
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  expect(proposal.snapshot.business.currency).toBe('SGD')
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
  const id = ((await approved.json()) as { business_id: string }).business_id
  const shared = await page.request.post(`/api/v1/businesses/${id}/share`, {
    data: { public: true },
  })
  expect(shared.ok()).toBe(true)
  return id
}

async function ownerIn(page: Page, lang: Lang) {
  await localOnly(page)
  await enter(page)
  const id = await seedSingapore(page)
  await page.evaluate(
    (code) =>
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language: code, appearance: 'light' }),
      ),
    lang.code,
  )
  await page.reload()
  await page.getByRole('button', { name: lang.preview }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', lang.code)
  return id
}

for (const lang of LANGS) {
  test.describe(lang.code, () => {
    const tab = (page: Page, name: string) =>
      page
        .getByRole('navigation', { name: lang.nav.main })
        .getByRole('button', { name, exact: true })

    test(`owner in ${lang.code}: Today, coach, Shop, Grow, PayNow, You, customer page`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const id = await ownerIn(page, lang)
      await readsIn(page, lang, '01-today')

      await test.step('coach text turn', async () => {
        await page.getByLabel(lang.message, { exact: true }).fill(lang.ask)
        await page.getByRole('button', { name: lang.send, exact: true }).click()
        await expect(page.getByRole('log')).toContainText(lang.ask)
        await page.waitForTimeout(2500)
        await readsIn(page, lang, '02-coach-reply', [lang.ask])
      })

      await test.step('Shop: S$ prices', async () => {
        await tab(page, lang.nav.shop).click()
        await expect(page.getByText(PRICE).first()).toBeVisible()
        await readsIn(page, lang, '03-shop')
      })

      await test.step('Grow', async () => {
        await tab(page, lang.nav.grow).click()
        await readsIn(page, lang, '04-grow')
      })

      await test.step('PayNow QR in S$', async () => {
        await page.getByRole('button', { name: lang.payTitle }).click()
        await page.getByRole('textbox', { name: lang.paynowId }).fill('+6591234567')
        await page.getByRole('button', { name: lang.save, exact: true }).click()
        await page.getByRole('textbox', { name: lang.amount, exact: true }).fill('4.50')
        await page.getByRole('button', { name: lang.create, exact: true }).click()
        await expect(page.getByRole('img', { name: /S\$\s?4\.50/ })).toBeVisible()
        await readsIn(page, lang, '05-paynow', ['+6591234567'])
      })

      await test.step('You', async () => {
        await tab(page, lang.nav.you).click()
        await readsIn(page, lang, '06-you')
      })

      // The customer page of the same shop, in the same language.
      await test.step('public shop page', async () => {
        const others = await otherOwnersWords(page, TIONG_BAHRU, id)
        await page.goto(`/explore/s/${id}`)
        await expect(page.getByRole('heading', { name: SHOP, level: 1 })).toBeVisible()
        await expect(page.getByText(PRICE).first()).toBeVisible()
        await readsIn(page, lang, '07-public-page', others)
      })
    })

    test(`customer in ${lang.code}: Ask, results, shop page, chat, passport`, async ({
      browser,
      page,
      baseURL,
    }) => {
      test.setTimeout(120_000)
      await localOnly(page)
      await enter(page)
      const id = await seedSingapore(page)
      const others = await otherOwnersWords(page, TIONG_BAHRU, id)
      const context = await browser.newContext({
        baseURL,
        locale: lang.phone,
        viewport: { width: 360, height: 780 },
        timezoneId: 'Asia/Singapore',
        reducedMotion: 'reduce',
        storageState: {
          cookies: [],
          origins: [
            {
              origin: new URL(baseURL!).origin,
              localStorage: [
                { name: 'niva.language.chosen', value: '1' },
                // The first-run explainer was already seen (playwright.config.ts does the same).
                { name: 'chalkboard.explainer.customer.v1', value: '1' },
                { name: 'chalkboard.customer.journey', value: 'done' },
                {
                  name: 'niva.starter.preferences',
                  value: JSON.stringify({ language: lang.code, appearance: 'light' }),
                },
              ],
            },
          ],
        },
      })
      const customer = await context.newPage()
      await localOnly(customer)
      try {
        await customer.goto('/explore/')
        // Release 3's front door: the first textbox is the inline "where"; the Ask box is the search.
        const ask = customer.getByRole('search').getByRole('textbox')
        await expect(ask).toBeVisible({ timeout: 30_000 })
        await expect(ask).toHaveAttribute('placeholder', /S\$/)
        await readsIn(customer, lang, '20-ask-home', others)
        await ask.fill(lang.ask)
        await customer.keyboard.press('Enter')
        await expect(customer.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
        await customer.waitForTimeout(1500)
        await readsIn(customer, lang, '21-ask-results', [lang.ask, ...others])

        await customer.goto(`/explore/s/${id}`)
        await expect(customer.getByRole('heading', { name: SHOP, level: 1 })).toBeVisible()
        await expect(customer.getByText(PRICE).first()).toBeVisible()
        await readsIn(customer, lang, '22-shop-page', others)

        await customer.getByRole('button', { name: lang.chat }).first().click()
        await expect(customer.getByRole('dialog')).toBeVisible()
        await readsIn(customer, lang, '23-chat')
        await customer.keyboard.press('Escape')

        await customer.goto('/explore/passport')
        await expect(customer.getByText(lang.passport)).toBeVisible()
        await readsIn(customer, lang, '24-passport')
      } finally {
        await context.close()
      }
    })
  })
}
