import { expect, test, type Locator, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { explainerCopy } from '../src/features/first-run/copy'
import { frontCopy } from '../src/features/frontdoors/strings'
import { conversationCopy } from '../src/features/discover/conversationCopy'
import { discoverCopy } from '../src/features/discover/strings'
import { passportCopy } from '../src/features/passport/copy'
import { accountCopyFor } from '../src/features/customer/copy'
import { customerEnglish } from '../src/features/public/customerCopy'
import { customerTranslations } from '../src/features/public/customerLocales'
import { writeFileSync, mkdirSync } from 'node:fs'

const baseline = process.env.CUSTOMER_PACING_BASELINE === 'true'
const area = { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' }
const shopId = 'demo-pacing-chai'
const products = Array.from({ length: 8 }, (_, i) => ({ name: `Chai ${i + 1}`, unit: 'cup', price: 2000 + i * 100, available: true }))
const shop = { id: shopId, name: 'Corner Chai', category: 'Cafe', location: 'Indiranagar', hours: '08:00–20:00', phone: '', currency: 'INR', timezone: 'Asia/Kolkata', demo: true, stamps_enabled: true, stamps_needed: 8, reward_text: 'Free chai', products, facts: { vegetarian: true, payment_methods: ['cash'] }, open_now: true }
const picks = products.map((_, i) => ({ ...shop, id: i ? `demo-pacing-${i}` : shopId, name: i ? `Chai Stop ${i + 1}` : shop.name, lat: area.lat + i * 0.001, lng: area.lng, distance_m: 100 + i * 100, source: 'chalkboard', demo_shop: true, items: products.slice(0, 1), matched: products.slice(0, 1), sold_out: [], reasons: [] }))
const view = { signed_in: false, device_only: true, points: 0, demo_points: 10, total: 10, level: { key: 'newcomer', next: 'regular', next_requirement: { key: 'points', have: 10, need: 100 }, requirements: [{ key: 'points', have: 10, need: 100 }] }, streak: { weeks: 0, row: [], rain_checks: 0, visited_this_week: false }, stamps: [], shops: [], areas: [], quests: [], impact: { meals: 0, co2_kg: 0, saved: {} }, perks: [], leaderboard: false }

async function openDetails(page: Page, title: string) {
  const summary = page.locator('summary').filter({ hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
  if (baseline && !(await summary.count())) return
  await summary.click()
}

async function record(page: Page, scope: Locator, name: string, prefix: string) {
  await page.evaluate(async () => { await document.fonts.ready })
  const prose = await scope.locator('p').evaluateAll((paragraphs) => paragraphs.filter((p) => p.checkVisibility() && !p.closest('li')).map((p) => {
    const box = p.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(p)
    const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.top < box.bottom && r.bottom > box.top).map((r) => Math.round(r.top)))
    return { text: p.textContent, lines: tops.size }
  }))
  const lines = prose.reduce((sum, p) => sum + p.lines, 0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `output/playwright/customer-pacing/${prefix}-${name}.png`, fullPage: true })
  return { screen: name, lines, prose }
}

for (const language of ['en', 'hi'] as const) for (const appearance of ['light', 'dark'] as const) {
  test(`customer pacing: first open → Ask → results → shop → QR → Passport → sign-in → legal (${language}, ${appearance})`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'phone', 'One 390 px phone journey per locale and theme')
    test.setTimeout(120_000)
    const c = conversationCopy(language, 'INR')
    const d = discoverCopy(language)
    const p = passportCopy(language)
    const a = accountCopyFor(language)
    const publicCopy = language === 'en' ? customerEnglish : { ...customerEnglish, ...customerTranslations[language] }
    const tour = explainerCopy[language]
    const more = language === 'en' ? 'Show more' : 'और देखें'
    const agree = language === 'en' ? 'I agree' : 'मैं सहमत हूँ'
    const captures = []
    const prefix = `${baseline ? 'before' : 'after'}-${language}-${appearance}`
    const capture = async (name: string, scope = page.getByRole('main')) => captures.push(await record(page, scope, name, prefix))
    let followed = false
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
      const path = url.pathname
      if (!path.startsWith('/api/')) return route.continue()
      let json: unknown
      if (path.endsWith('/bootstrap')) json = { auth_mode: 'local', features: { guest_customer: true } }
      else if (path.endsWith('/customer/me')) json = { signed_in: false, guest: true, name: 'Guest', profile: { follows: followed ? [shopId] : [], preferences: { vegetarian: false, halal: false, budget: null, language: '' }, searches: [] } }
      else if (path.includes('/customer/follows/')) { followed = route.request().method() === 'PUT'; json = { follows: followed ? [shopId] : [], preferences: { vegetarian: false, halal: false, budget: null, language: '' }, searches: [] } }
      else if (path.endsWith('/discover/place')) json = area
      else if (path.endsWith('/discover/suggest')) json = { items: ['Chai'], shops: 8, open_now: 8, deals: 0, locally_made: 0 }
      else if (path.endsWith('/discover')) json = { mode: 'demo', places: picks, google_unavailable: false }
      else if (path.endsWith('/discover/ask')) json = { intent: { summary: ('Nearby chai. '.repeat(35)), keywords: ['chai'], category: '', max_price: null, halal: false, vegetarian: false, locally_made: false, open_now: false, followups: [], sort: 'best', near: '', deals: false }, mode: 'ai', groups: [{ id: 'best', places: picks }], anchor: null }
      else if (path === `/api/v1/public/shops/${shopId}`) json = shop
      else if (path.endsWith('/demo-qr')) json = { key: 'offline-fixture' }
      else if (path.endsWith('/passport/stamps') || path.endsWith('/passport/check')) json = { outcome: { verdict: 'stamped', points: 10, demo: true, first: true, level_before: 'newcomer', level_after: 'newcomer', quests_completed: [] }, passport: view }
      else if (path.includes('/passport')) json = view
      else if (path.endsWith('/customer/unread')) json = { count: 0 }
      else if (path.endsWith('/customer/guest')) json = {}
      else return route.fulfill({ status: 503, json: { detail: 'Offline fixture' } })
      return route.fulfill({ json })
    })
    await page.addInitScript(({ language, appearance }) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language, appearance }))
      localStorage.setItem('niva.language.chosen', '1')
      if (!sessionStorage.getItem('pacing-tour')) { localStorage.removeItem('chalkboard.explainer.customer.v1'); sessionStorage.setItem('pacing-tour', '1') }
    }, { language, appearance })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: area.lat, longitude: area.lng, accuracy: 10 })
    await page.goto('/explore/')
    await expect(page.getByRole('heading', { name: tour[3], exact: true })).toBeVisible()
    await capture('explainer', page.getByRole('dialog'))
    await page.getByRole('button', { name: tour[7], exact: true }).click()
    await page.getByRole('button', { name: tour[10], exact: true }).click()
    await expect(page.getByRole('heading', { name: tour[3], exact: true })).toBeVisible()
    await page.getByRole('button', { name: tour[7], exact: true }).click()
    await page.getByRole('button', { name: tour[7], exact: true }).click()
    await page.getByRole('button', { name: tour[8], exact: true }).click()
    await expect(page.getByRole('textbox', { name: d.place, exact: true })).toBeVisible()
    await capture('first-open')
    if (!baseline) await expect(page.getByRole('textbox', { name: c.composer, exact: true })).toBeHidden()
    await page.getByRole('textbox', { name: d.place, exact: true }).fill('Indiranagar')
    await page.getByRole('textbox', { name: d.place, exact: true }).press('Enter')
    const composer = page.getByRole('textbox', { name: c.composer, exact: true })
    await expect(composer).toBeVisible()
    await composer.fill('chai')
    await openDetails(page, c.nearbyNow)
    await expect(composer).toHaveValue('chai')
    await openDetails(page, c.nearbyNow)
    await capture('ask')
    await page.getByRole('button', { name: c.send, exact: true }).click()
    const results = page.getByRole('article', { name: 'chai', exact: true })
    await expect(results.getByText('Corner Chai', { exact: true })).toBeVisible()
    await capture('results')
    if (!baseline) {
      await expect(results.locator('li')).toHaveCount(5)
      await results.getByRole('button', { name: c.more, exact: true }).last().click()
      await expect(results.locator('li')).toHaveCount(8)
      await openDetails(page, c.composer)
      await expect(results.getByRole('button', { name: c.cheaper, exact: true })).toBeVisible()
    }
    await page.goto(`/explore/s/${shopId}`)
    await expect(page.getByRole('heading', { name: shop.name, exact: true })).toBeVisible()
    await capture('shop')
    if (!baseline) {
      await expect(page.getByRole('listitem')).toHaveCount(5)
      await page.getByRole('button', { name: more, exact: true }).click()
      await expect(page.getByRole('listitem')).toHaveCount(8)
    }
    await openDetails(page, publicCopy.factsLabel)
    const follow = page.getByRole('button', { name: a.followShop.replace('{shop}', shop.name), exact: true })
    await follow.click()
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
    await openDetails(page, publicCopy.factsLabel)
    await openDetails(page, publicCopy.factsLabel)
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
    await openDetails(page, p.stampBook)
    await capture('follow-stamps')
    await page.getByRole('button', { name: p.tryDemo, exact: true }).click()
    await expect(page.getByRole('heading', { name: p.firstTry, exact: true })).toBeVisible()
    await capture('qr', page.getByRole('dialog'))
    await page.getByRole('button', { name: p.done, exact: true }).click()
    await page.goto('/explore/passport')
    await expect(page.getByRole('heading', { name: p.title, exact: true })).toBeVisible()
    await capture('passport')
    await openDetails(page, p.stampBook)
    await expect(page.getByText(p.emptyBookBody, { exact: true })).toBeVisible()
    await openDetails(page, p.board)
    if (!baseline) await expect(page.getByText(p.emptyBookBody, { exact: true })).toBeHidden()
    await page.getByRole('button', { name: p.boardSignIn, exact: true }).click()
    await capture('sign-in', page.getByRole('dialog'))
    if (!baseline) {
      await page.getByRole('dialog').getByRole('button', { name: language === 'en' ? 'Privacy Notice' : 'गोपनीयता सूचना', exact: true }).click()
      await expect(page.getByRole('dialog').getByRole('button', { name: agree, exact: true })).toBeVisible()
      await capture('privacy', page.getByRole('dialog').last())
      await page.getByRole('button', { name: agree, exact: true }).click()
      await expect(page.getByRole('dialog').getByRole('button', { name: a.notNow, exact: true })).toBeVisible()
      await page.getByRole('dialog').getByRole('button', { name: language === 'en' ? 'Terms' : 'शर्तें', exact: true }).click()
      await capture('terms', page.getByRole('dialog').last())
      await page.getByRole('button', { name: agree, exact: true }).click()
    }
    await page.getByRole('button', { name: a.notNow, exact: true }).click()
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
    await page.goto('/explore/browse')
    await expect(page.getByRole('heading', { name: d.title, exact: true })).toBeVisible()
    await capture('browse')
    if (!baseline) {
      await openDetails(page, more)
      await expect(page.getByRole('switch', { name: d.open, exact: true })).toBeVisible()
    }
    mkdirSync('output/playwright/customer-pacing', { recursive: true })
    writeFileSync(`output/playwright/customer-pacing/${prefix}.json`, JSON.stringify(captures, null, 2))
    await expect(page.getByRole('heading', { name: frontCopy(language).location, exact: true })).toHaveCount(0)
  })
}
