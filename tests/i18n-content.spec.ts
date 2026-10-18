import { expect, test, type Browser, type Page } from '@playwright/test'

// Customer content in the customer's language: the shop's category and menu sections read in
// Tamil, Hindi, Kannada or Japanese (a built-in glossary offline; the model, batched and cached
// per shop, live), while the owner's own item names stay exactly as written. At 360px long
// Tamil/Kannada words wrap instead of being cut.

async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
}

async function sharedBakery(page: Page) {
  await localOnly(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: {
        name: 'Butter Window Bakery',
        category: 'Bakery',
        location: 'Koramangala, Bengaluru',
        hours: '07:00–20:00',
        currency: 'INR',
        halal: 'yes',
        vegetarian_options: true,
        locally_made: true,
        payment_methods: ['cash', 'UPI'],
      },
      products: [
        { name: 'Milk bread', price: 5500, unit: 'piece', category: 'Bread' },
        { name: 'Multigrain loaf', price: 12000, unit: 'piece', category: 'Bread' },
        { name: 'Chocolate cake', price: 9500, unit: 'slice', category: 'Cakes' },
        { name: 'Filter coffee', price: 3000, unit: 'cup', category: 'Coffee' },
      ],
    },
  })
  expect(prepared.ok(), await prepared.text()).toBeTruthy()
  const proposal = await prepared.json()
  const saved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(saved.ok()).toBeTruthy()
  const { business_id: id } = await saved.json()
  expect(
    (await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })).ok(),
  ).toBeTruthy()
  return id as string
}

async function customerIn(browser: Browser, baseURL: string | undefined, locale: string) {
  const context = await browser.newContext({
    baseURL,
    locale,
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 1,
    timezoneId: 'Asia/Kolkata',
  })
  const page = await context.newPage()
  await localOnly(page)
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  return { context, page }
}

const CASES = [
  { locale: 'ta-IN', code: 'ta', category: 'பேக்கரி', sections: ['ரொட்டி', 'கேக்குகள்', 'காபி'] },
  { locale: 'hi-IN', code: 'hi', category: 'बेकरी', sections: ['ब्रेड', 'केक', 'कॉफ़ी'] },
  { locale: 'kn-IN', code: 'kn', category: 'ಬೇಕರಿ', sections: ['ಬ್ರೆಡ್', 'ಕೇಕ್‌ಗಳು', 'ಕಾಫಿ'] },
  { locale: 'ja-JP', code: 'ja', category: 'ベーカリー', sections: ['パン', 'ケーキ', 'コーヒー'] },
]

test('the shop page reads in the customer’s language; owner item names stay as written', async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'phone', 'One 360px phone pass covers the layout')
  test.setTimeout(120_000)
  const id = await sharedBakery(page)
  for (const { locale, code, category, sections } of CASES) {
    const { context, page: customer } = await customerIn(browser, baseURL, locale)
    try {
      const blockedFonts: string[] = []
      customer.on('response', (response) => {
        if (response.url().includes('/@fs/') && response.status() >= 400)
          blockedFonts.push(`${response.status()} ${response.url()}`)
      })
      const response = customer.waitForResponse((r) => r.url().includes(`/public/shops/${id}`))
      await customer.goto(`/explore/s/${id}`)
      // The page asks once, in its language.
      expect((await response).url()).toContain(`lang=${code}`)
      await expect(customer.getByRole('heading', { name: 'Butter Window Bakery' })).toBeVisible()
      await expect(customer.getByText(category, { exact: false }).first()).toBeVisible()
      for (const section of sections)
        await expect(customer.getByRole('region', { name: section, exact: true })).toBeVisible()
      // The owner's names are untouched (in the menu; Similar nearby repeats them as choices).
      const [bread, cakes] = sections.map((name) =>
        customer.getByRole('region', { name, exact: true }),
      )
      await expect(bread.getByText('Milk bread', { exact: true })).toBeVisible()
      await expect(cakes.getByText('Chocolate cake', { exact: true })).toBeVisible()
      // 360px: nothing scrolls sideways and every fact chip is fully on screen (wrapped).
      expect(
        await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
      const chips = customer.getByRole('list').first().locator('li')
      for (const box of await chips.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().toJSON() as DOMRect),
      )) {
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(360)
      }
      // Linked node_modules must still serve the locale font files (especially Tamil at 360px).
      await expect.poll(() => blockedFonts).toEqual([])
      await customer.screenshot({ path: `docs/stories/i18n-${code}-shop.png`, fullPage: true })
    } finally {
      await context.close()
    }
  }
})

test('English stays the source: no translation is asked for', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Covered once')
  const id = await sharedBakery(page)
  const shop = await (await page.request.get(`/api/v1/public/shops/${id}`)).json()
  expect(shop.category).toBe('Bakery')
  expect(shop.language).toBeUndefined()
  const tamil = await (await page.request.get(`/api/v1/public/shops/${id}?lang=ta`)).json()
  expect(tamil.category).toBe('பேக்கரி')
  expect(tamil.products.map((p: { name: string }) => p.name)).toEqual(
    shop.products.map((p: { name: string }) => p.name),
  )
})
