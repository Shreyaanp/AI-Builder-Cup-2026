// Production smoke check: run after every deploy, and against a --no-traffic tagged revision
// BEFORE traffic moves. Playwright from node, no test runner. See scripts/PROD-SMOKE.md.
//
//   node scripts/prod-smoke.mjs [customerUrl] [businessUrl]
//   node scripts/prod-smoke.mjs https://candidate---ogoogle-ai-xxxx.a.run.app   (one URL serves both)
//
// Env: SMOKE_CUSTOMER_URL / SMOKE_BUSINESS_URL override the defaults. Exit 1 on any FAIL.
import { chromium } from 'playwright'

const DEFAULT_CUSTOMER = 'https://chalkboard.shreyaan.work'
const DEFAULT_BUSINESS = 'https://business.chalkboard.shreyaan.work'
const [argCustomer, argBusiness] = process.argv.slice(2)
const strip = (u) => u.replace(/\/+$/, '')
const customer = strip(argCustomer || process.env.SMOKE_CUSTOMER_URL || DEFAULT_CUSTOMER)
// A single tagged-revision URL serves both hosts.
const business = strip(argBusiness || process.env.SMOKE_BUSINESS_URL || argCustomer || DEFAULT_BUSINESS)
// On a *.run.app URL the host does not pick the app, so public pages need ?app=.
const onTag = /.run.app$/.test(new URL(customer).hostname)
const pub = (path, app) => `${customer}${path}${onTag ? `?app=${app}` : ''}`
const startedAt = Date.now()
const BUDGET_MS = 3 * 60_000

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }
const ERROR_TEXT = /couldn.t|could not|went wrong|failed to|something broke/i

// The Today/Shop/Grow/You buttons from chalkboard-regression/vaudit.mjs.
const BUTTONS = [
  ['Coach', /^Reorder/i], ['Coach', /^Order$/i], ['Coach', /^Reply$/i], ['Coach', /close the day/i],
  ['Coach', /Forecast demand/i], ['Coach', /See all examples/i],
  ['Shop', /Turn on your page/i], ['Shop', /^Edit$/i], ['Shop', /View all/i], ['Shop', /Customer page/i],
  ['Shop', /Connect your system/i], ['Shop', /Photos/i], ['Shop', /Messages/i],
  ['Grow', /Open messages/i], ['Grow', /Create link/i], ['Grow', /Send a rider/i], ['Grow', /Rescue/i],
  ['Grow', /Prep plan/i],
  ['You', /Verify it/i], ['You', /Remind me/i], ['You', /New shop/i], ['You', /FreshMart/i],
]

let failures = 0
const report = (ok, name, reason) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${reason}`)
}
const timeLeft = () => BUDGET_MS - (Date.now() - startedAt)

const browser = await chromium.launch()
const all5xx = []

// A fresh page with error, dialog and 5xx collectors.
async function open(viewport, label) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const state = { errors: [], alerts: [], page, context }
  page.on('pageerror', (e) => state.errors.push(e.message.slice(0, 100)))
  page.on('dialog', (d) => {
    state.alerts.push(d.message().slice(0, 80))
    d.dismiss().catch(() => {})
  })
  page.on('response', (r) => {
    if (r.status() >= 500 || (r.status() === 429 && /demo\/workspace/.test(r.url()))) all5xx.push(`${r.status()} ${label} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 70)}`)
  })
  return state
}
const bodyText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const visible = (loc) => loc.first().isVisible().catch(() => false)

async function check(name, fn) {
  if (timeLeft() < 0) return report(false, name, 'skipped: 3 minute budget used up')
  try {
    const result = await fn()
    report(result.ok, name, result.reason)
  } catch (e) {
    report(false, name, `exception: ${String(e.message).split('\n')[0].slice(0, 110)}`)
  }
}

async function dismissIntro(page) {
  for (let i = 0; i < 3; i += 1) {
    const skip = page.getByRole('button', { name: /^(Skip|Close|Not now|Got it)$/i }).first()
    if (!(await visible(skip))) break
    await skip.click().catch(() => {})
    await page.waitForTimeout(500)
  }
}

let demoDown = ''
async function openDemo(s) {
  if (demoDown) throw new Error(demoDown)
  await s.page.goto(`${business}/demo`, { waitUntil: 'domcontentloaded' })
  try {
    await s.page.locator('nav').first().waitFor({ timeout: 12_000 })
  } catch {
    const t = await bodyText(s.page)
    demoDown = /could not open/i.test(t) ? 'demo could not open (see 429/5xx on /api/v1/demo/workspace)' : 'demo nav never appeared'
    throw new Error(demoDown)
  }
  await dismissIntro(s.page)
}

// 1. Landing and public pages, phone and desktop.
for (const [vpName, vp] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  const s = await open(vp, vpName)
  await check(`landing ${vpName}`, async () => {
    const res = await s.page.goto(pub('/', 'landing'), { waitUntil: 'domcontentloaded' })
    await s.page.waitForTimeout(2500)
    const demo = await s.page.locator('a[href*="/demo"]').count()
    const ok = res.status() === 200 && !s.errors.length && demo > 0
    return { ok, reason: `HTTP ${res.status()}, pageerrors=${s.errors.length}, demo links=${demo}` }
  })
  for (const path of ['/how-it-works', '/features', '/explore/']) {
    await check(`${path} ${vpName}`, async () => {
      s.errors.length = 0
      const res = await s.page.goto(pub(path, 'landing'), { waitUntil: 'domcontentloaded' })
      await s.page.waitForTimeout(2000)
      return { ok: res.status() === 200 && !s.errors.length, reason: `HTTP ${res.status()}, pageerrors=${s.errors.length}` }
    })
  }
  await s.context.close()
}

// 2. Business front door.
{
  const s = await open(PHONE, 'door')
  await check('business front door', async () => {
    await s.page.goto(`${business}/`, { waitUntil: 'domcontentloaded' })
    await s.page.waitForTimeout(3000)
    await dismissIntro(s.page)
    await s.page.waitForTimeout(1000)
    const google = await visible(s.page.getByText(/Continue with Google/i))
    const demo = await visible(s.page.getByText(/^Try demo$/i).or(s.page.getByRole('button', { name: /Try demo/i })))
    return { ok: google && demo, reason: `Continue with Google=${google}, Try demo=${demo}` }
  })
  await s.context.close()
}

// 3. /demo tabs and tour, phone and desktop.
for (const [vpName, vp] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  const s = await open(vp, vpName)
  await check(`demo tabs ${vpName}`, async () => {
    await openDemo(s)
    const missing = []
    for (const tab of ['Coach', 'Shop', 'Grow', 'You']) {
      const el = s.page.locator('nav').getByText(tab, { exact: true }).first()
      try {
        await el.click()
        await s.page.waitForTimeout(700)
      } catch {
        missing.push(tab)
      }
    }
    return { ok: !missing.length && !s.errors.length, reason: missing.length ? `could not tap ${missing.join(', ')}` : `all four tapped, pageerrors=${s.errors.length}` }
  })
  await check(`demo tour order ${vpName}`, async () => {
    if (!(await visible(s.page.locator('nav')))) await openDemo(s)
    await s.page.locator('nav').getByText('You', { exact: true }).first().click()
    await s.page.waitForTimeout(1000)
    const start = s.page.getByRole('button', { name: /Take the tour/i }).first()
    await start.scrollIntoViewIfNeeded().catch(() => {})
    await start.click()
    const next = s.page.getByRole('button', { name: /^Next$/ }).first()
    await next.waitFor({ timeout: 20_000 })
    for (let i = 0; i < 3; i += 1) {
      await next.click()
      await s.page.waitForTimeout(900)
    }
    await s.page.waitForTimeout(2500)
    const t = await bodyText(s.page)
    const failed = /Couldn.t load the demo order/i.test(t)
    const loading = /Loading the demo order/i.test(t)
    return { ok: !failed && !loading, reason: failed ? 'step 4 says "Couldn\'t load the demo order"' : loading ? 'step 4 still loading the order' : 'step 4 shows the order' }
  })
  await s.context.close()
}

// 4. Every Today/Shop/Grow/You button opens something (phone).
{
  const s = await open(PHONE, 'buttons')
  await openDemo(s).catch(() => {})
  for (const [tab, label] of BUTTONS) {
    await check(`demo button ${tab}/${label.source}`, async () => {
      if (!demoDown && timeLeft() < 20_000) throw new Error('3 minute budget nearly used up')
      s.errors.length = 0
      s.alerts.length = 0
      await s.page.keyboard.press('Escape')
      const navTab = s.page.locator('nav').getByText(tab, { exact: true }).first()
      if (!(await visible(navTab))) await openDemo(s)
      await navTab.click()
      await s.page.waitForTimeout(1000)
      const el = s.page.getByRole('button', { name: label }).or(s.page.getByRole('link', { name: label })).first()
      await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
      if (!(await visible(el))) return { ok: false, reason: 'button not found' }
      const before = await bodyText(s.page)
      const url = s.page.url()
      await el.click()
      await s.page.waitForTimeout(1800)
      const after = await bodyText(s.page)
      const alertEl = await s.page.getByRole('alert').allInnerTexts().catch(() => [])
      const errAlert = alertEl.find((a) => ERROR_TEXT.test(a))
      const opened = after !== before || s.page.url() !== url
      await s.page.keyboard.press('Escape')
      const ok = opened && !errAlert && !s.alerts.length && !s.errors.length
      return { ok, reason: !opened ? 'nothing opened' : errAlert ? `error alert: ${errAlert.slice(0, 60)}` : s.alerts.length ? `dialog: ${s.alerts[0]}` : s.errors.length ? `pageerror: ${s.errors[0]}` : 'opened, no error alerts' }
    })
  }
  await s.context.close()
}

// 5. Customer side.
{
  const s = await open(PHONE, 'customer')
  await check('customer /explore/demo', async () => {
    const res = await s.page.goto(pub('/explore/demo', 'customer'), { waitUntil: 'domcontentloaded' })
    await s.page.waitForTimeout(4000)
    const t = await bodyText(s.page)
    return { ok: res.status() === 200 && t.length > 80 && !s.errors.length && !ERROR_TEXT.test(t.slice(0, 400)), reason: `HTTP ${res.status()}, ${t.length} chars, pageerrors=${s.errors.length}` }
  })
  await check('demo shop stamp card', async () => {
    const link = s.page.locator('a[href*="/explore/"], a[href*="/s/"], a[href*="/shop"]').first()
    if (!(await visible(link))) return { ok: false, reason: 'no demo shop link on /explore/demo' }
    await link.click()
    await s.page.waitForTimeout(4000)
    const card = s.page.getByLabel(/stamp/i).or(s.page.getByText(/stamp/i))
    const found = await visible(card)
    return { ok: found, reason: found ? 'stamp card visible' : `no stamp card at ${s.page.url().replace(/^https?:\/\/[^/]+/, '')}` }
  })
  await s.context.close()
}

// 6. Voice websocket opens (the browser sends the allowed Origin).
{
  const s = await open(PHONE, 'voice')
  await check('voice websocket', async () => {
    await s.page.goto(`${business}/`, { waitUntil: 'domcontentloaded' })
    const wsUrl = `${business.replace(/^http/, 'ws')}/api/v1/voice`
    const result = await s.page.evaluate(
      (u) =>
        new Promise((resolve) => {
          const ws = new WebSocket(u)
          const timer = setTimeout(() => resolve('timeout after 10s'), 10_000)
          ws.onopen = () => { clearTimeout(timer); ws.close(); resolve('open') }
          ws.onerror = () => { clearTimeout(timer); resolve('error before open') }
        }),
      wsUrl,
    )
    return { ok: result === 'open', reason: `${wsUrl.replace(/^wss?:\/\//, '')}: ${result}` }
  })
  await s.context.close()
}

// 7. No 5xx anywhere.
report(!all5xx.length, 'no 5xx (or demo 429) responses', all5xx.length ? [...new Set(all5xx)].slice(0, 6).join('; ') : 'none seen')

await browser.close()
const secs = Math.round((Date.now() - startedAt) / 1000)
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'} in ${secs}s (customer ${customer}, business ${business})`)
if (secs > BUDGET_MS / 1000) console.log('WARNING: over the 3 minute budget')
process.exit(failures ? 1 : 0)
