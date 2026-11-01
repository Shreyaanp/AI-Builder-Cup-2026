import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

// Simplify batch 2 (SIMPLIFY-owner.md §2, §7): every owner feature has two equal paths. For each
// row of the shared map (appGuide.json, exported from backend/app/app_guide.py):
// (a) the screen entry is a visible name on its tab, reached in at most 2 taps (the tab, then
//     the row; a control inside the row is visible once that row is open);
// (b) the chat phrase, English and Hindi, sent in the public demo, answers about that feature (a
//     topic word per feature, tests/askTopics.json) with the same path, and following that path
//     finds the named element on screen.
// Nearby demand, Send a rider and Reminders were screen-only; the chat now opens them.

type Feature = { id: string; path: string[]; ask: string; ask_hi: string; screen: string }
const guide = JSON.parse(
  readFileSync(new URL('../src/features/v1/appGuide.json', import.meta.url), 'utf-8'),
) as { tabs: string[]; features: Feature[] }
const features = guide.features
const where = (feature: Feature) => feature.path.join(' → ')
// One word per feature its demo answer must contain, shared with test_app_guide_paths.py.
const TOPICS = JSON.parse(
  readFileSync(new URL('./askTopics.json', import.meta.url), 'utf-8'),
) as Record<string, { en: string; hi: string }>
const LANGS = ['en', 'hi'] as const
type Lang = (typeof LANGS)[number]
const phrase = (feature: Feature, lang: Lang) => (lang === 'en' ? feature.ask : feature.ask_hi)
/** The reply's closing line: the same path, in the phrase's language (labels stay English). */
const pathLine = (feature: Feature, lang: Lang) =>
  lang === 'en' ? `Next, open ${where(feature)}.` : `अब ${where(feature)} खोलें।`

// Rows that are reachable in 2 taps but still sit below the first view at 390 x 844. Moving them
// up is Batch 3 (Shop and You layout) and Batch 4 (Grow list and "More tools"), not this batch.
// The check is strict: once a row reaches the first view its test fails until it leaves this list.
const BELOW_FIRST_VIEW = new Set([
  // Batch 1's readable text sizes (#624) pushed these two below the fold.
  'Sold out today',
  'Photos',
  'Shop details',
  'Messages',
  'Link your billing app',
  'Orders',
  'Close the day',
  'Purchase orders',
  'Supply chain',
  'Stamps & perks',
  'Your week',
  'Privacy & your data',
  'Talk to your coach',
])

// The demo hides Get on Google (DemoApp passes hiddenFeatures) while its coach still names it:
// OB-247 (#632). Its reply is checked; the tile is only looked for outside the demo.
const NOT_IN_DEMO = new Set(['Get on Google'])

async function localOnly(page: Page, visitor: string) {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `two-paths-${visitor}` })
  await page
    .context()
    .route('**/*', (route) =>
      ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort(),
    )
}

// Grow puts Close the day first after 17:00; the first view is measured at 10:00 shop time. It is
// the last 10:00 already past: a clock ahead of the server makes the demo session look expired.
function morning() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  const today = new Date(`${day}T10:00:00+08:00`)
  return today.getTime() <= Date.now() ? today : new Date(today.getTime() - 24 * 3600_000)
}

async function openDemo(page: Page, visitor: string) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(morning())
  await localOnly(page, visitor)
  await page.goto('/demo')
  await expect(page.getByText('Demo shop – nothing here is real', { exact: true })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Skip', exact: true }).click()
}

async function tab(page: Page, name: string) {
  await page.locator(`[data-tour="nav-${name.toLowerCase()}"]`).click()
  // A tab opens at its top, as an owner arriving from another tab sees it.
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (el.scrollTop) el.scrollTop = 0
    })
    window.scrollTo(0, 0)
  })
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The named row or control: a tile (maybe after a count badge), switch, field or heading. */
function entry(scope: Page | Locator, label: string): Locator {
  const name = new RegExp(`^(\\d+ )?${escape(label)}(\\b|\\s|$)`)
  return scope
    .getByRole('button', { name })
    .or(scope.getByRole('switch', { name }))
    .or(scope.getByRole('combobox', { name }))
    .or(scope.getByRole('heading', { name }))
    .or(scope.locator('summary', { hasText: label }))
    .filter({ visible: true })
    .first()
}

/** Where the row's top settles once late tiles (Morning brief, forecasts) have loaded. */
async function settledTop(page: Page, target: Locator) {
  let last = Number.NaN
  for (let read = 0; read < 20; read++) {
    const top = (await target.boundingBox())?.y ?? Number.NaN
    if (top === last) return top
    last = top
    await page.waitForTimeout(300)
  }
  return last
}

async function firstView(page: Page, target: Locator) {
  const nav = await page.locator('[data-tour="nav-shop"]').boundingBox()
  const top = await settledTop(page, target)
  // The name (the first line of the row) shows above the tab bar without scrolling.
  return !!nav && top >= 0 && top + 24 <= nav.y
}

async function closeAll(page: Page) {
  await page.keyboard.press('Escape')
  const back = page.getByRole('button', { name: 'Back', exact: true })
  if (await back.isVisible()) await back.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Opens the row (tap 2) and finds the control inside it, scrolling the open screen only. */
async function inner(page: Page, row: string, control: string) {
  await entry(page, row).click()
  const dialog = page.getByRole('dialog')
  const scope = (await dialog.count()) ? dialog.last() : page
  const found = entry(scope, control)
    .or(scope.getByText(control, { exact: true }).filter({ visible: true }))
    .first()
  await found.scrollIntoViewIfNeeded()
  await expect(found).toBeVisible()
}

for (const name of ['Shop', 'Grow', 'You']) {
  test(`${name}: every feature's screen entry is a visible name, at most 2 taps away`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone (390) layout')
    test.setTimeout(180_000)
    await openDemo(page, `screen-${name}-${info.testId}`)
    const rows = features.filter((feature) => feature.path[0] === name)
    expect(rows.length).toBeGreaterThan(0)
    for (const feature of rows) {
      await tab(page, name)
      if (name === 'Grow')
        await expect(page.getByRole('heading', { name: 'Morning brief' })).toBeVisible()
      const row = feature.path[1]
      if (NOT_IN_DEMO.has(row)) continue
      const target = entry(page, row)
      await expect(target, `${feature.id}: ${where(feature)}`).toBeAttached()
      expect
        .soft(await firstView(page, target), `${feature.id}: ${row} in the first view`)
        .toBe(!BELOW_FIRST_VIEW.has(row))
      await target.scrollIntoViewIfNeeded()
      await expect(target, `${feature.id}: ${where(feature)}`).toBeVisible()
      if (feature.path[2]) {
        await inner(page, row, feature.path[2])
        await closeAll(page)
      }
    }
  })
}

test('Coach: Today is the top of Coach, one tap away', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone (390) layout')
  await openDemo(page, `coach-${info.testId}`)
  await tab(page, 'Grow')
  await tab(page, 'Coach')
  for (const feature of features.filter((f) => f.path[0] === 'Coach')) {
    expect(feature.path, feature.id).toEqual(['Coach'])
  }
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible()
})

/** Sends `text`, waits for the chat item after its echo that contains `expected` (by default
 * the echo itself) and returns that item's text. The log keeps only the latest items, so two
 * phrases with the same path are told apart by the echo, not by counting matches. */
async function ask(page: Page, text: string, expected = '') {
  await tab(page, 'Coach')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // A review sheet opened by the reply hides the chat from the accessibility tree, not the page.
  const items = page.locator('[role="log"] li')
  let found = ''
  await expect
    .poll(
      async () =>
        (found = await items.evaluateAll(
          (nodes, [said, want]) => {
            const texts = nodes.map((node) => node.textContent ?? '')
            let echo = -1
            texts.forEach((t, i) => {
              if (t.includes('You:') && t.includes(said)) echo = i
            })
            if (echo < 0) return ''
            return want ? (texts.slice(echo + 1).find((t) => t.includes(want)) ?? '') : texts[echo]!
          },
          [text, expected] as const,
        )),
      { message: text, timeout: 30_000 },
    )
    .not.toBe('')
  return found
}

// The demo allows 30 coach messages per visitor in ten minutes; each tab's phrases (English and
// Hindi, at most 28) are one visitor.
for (const name of ['Coach', 'Shop', 'Grow', 'You']) {
  test(`${name}: each chat phrase answers on topic with its screen path, and that path exists`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone (390) layout')
    test.setTimeout(360_000)
    await openDemo(page, `chat-${name}-${info.testId}`)
    for (const feature of features.filter((f) => f.path[0] === name)) {
      for (const lang of LANGS) {
        const reply = await ask(page, phrase(feature, lang), pathLine(feature, lang))
        expect(reply, `${phrase(feature, lang)}: about ${feature.id}`).toMatch(
          new RegExp(TOPICS[feature.id]![lang], 'i'),
        )
        if (await page.getByRole('dialog').count()) await closeAll(page)
      }
      // Screens the coach opens itself are checked below; close them to follow the path by hand.
      if (await page.getByRole('dialog').count()) await closeAll(page)
      if (feature.path.length === 1 || NOT_IN_DEMO.has(feature.path[1])) continue
      await tab(page, feature.path[0])
      const target = entry(page, feature.path[1])
      await target.scrollIntoViewIfNeeded()
      await expect(target, `${feature.ask} → ${where(feature)}`).toBeVisible()
    }
  })
}

// Each phrase on its own, in a fresh demo session (a new visitor each), so no earlier answer or
// prepared change can make it pass: English and Hindi, the topic word and the path line.
test('every chat phrase, in a fresh demo session, answers on topic with its path', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone (390) layout')
  test.setTimeout(300_000)
  for (const feature of features) {
    for (const lang of LANGS) {
      const headers = { 'x-forwarded-for': `two-paths-fresh-${feature.id}-${lang}-${info.testId}` }
      const opened = await page.request.post(
        '/api/v1/demo/workspace?public=true&zone=Asia/Kolkata',
        {
          headers,
        },
      )
      expect(opened.ok(), `${feature.id} ${lang}: demo opens`).toBe(true)
      const { session_id } = (await opened.json()) as { session_id: string }
      const sent = await page.request.post(`/api/v1/demo/sessions/${session_id}/coach`, {
        headers,
        data: { message: phrase(feature, lang) },
      })
      expect(sent.ok(), phrase(feature, lang)).toBe(true)
      const reply = (await sent.text())
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)) as { kind?: string; text?: string })
        .filter((event) => event.kind === 'reply')
        .map((event) => event.text ?? '')
        .join(' ')
      expect(reply, phrase(feature, lang)).toContain(pathLine(feature, lang))
      expect(reply, `${phrase(feature, lang)}: about ${feature.id}`).toMatch(
        new RegExp(TOPICS[feature.id]![lang], 'i'),
      )
    }
  }
})

test('the chat opens the screen-only features: Nearby demand, Send a rider, Reminders', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone (390) layout')
  test.setTimeout(120_000)
  await openDemo(page, `open-${info.testId}`)

  await ask(page, 'What are people nearby asking for?')
  await expect(page.getByRole('dialog', { name: /Asked nearby/ })).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/tab=grow/)
  await closeAll(page)

  await ask(page, 'Send a rider')
  // Payments & rides opens with Send a rider already open (the drop field or the pin note).
  const rider = page.locator('details', { hasText: 'Send a rider' })
  await expect(rider).toHaveAttribute('open', '', { timeout: 30_000 })
  await expect(rider.getByRole('textbox').or(rider.getByRole('alert')).first()).toBeVisible()
  // Back returns to Grow, and the next visit opens the plain screen.
  await page.getByRole('button', { name: 'Back', exact: true }).first().click()
  await expect(page).toHaveURL(/tab=grow/)
  await entry(page, 'Payments & rides').click()
  await expect(page.locator('details', { hasText: 'Send a rider' })).not.toHaveAttribute('open')
  await page.getByRole('button', { name: 'Back', exact: true }).first().click()

  await ask(page, 'Remind me every morning')
  await expect(page).toHaveURL(/tab=you/, { timeout: 30_000 })
  const remind = page.getByRole('switch', { name: 'Remind me' })
  await expect(remind).toBeVisible()
  expect(await firstView(page, remind)).toBe(true)
})
