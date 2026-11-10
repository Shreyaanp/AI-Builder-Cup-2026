import { expect, test, type Locator, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// The coach that does the job (OB-171): a request with several steps goes on after its order card
// (OB-174, #533), and Today's cards can be put away with a reason and set to come less often
// (OB-176, #535). Local only, offline coach (the same tool calls Gemini makes).
test.skip(({ isMobile }) => !isMobile, 'phone story')

const PREVIEW = { en: 'Continue local preview', hi: 'स्थानीय प्रीव्यू जारी रखें' }
const CHAIN =
  'My flour is running low, find suppliers, then order 20 kg flour from the cheapest, then ask them if they deliver on Sunday'
const SHOTS = process.env.SHOTS_DIR ?? 'test-results/coach-reliable'

async function shop(page: Page, name: string, products: object[]) {
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Bakery',
          location: 'Koramangala, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9352, lng: 77.6245, accuracy_m: 0, source: 'pin' },
        products,
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  expect(approved.ok()).toBe(true)
  return ((await approved.json()) as { business_id: string }).business_id
}

async function open(
  page: Page,
  language: 'en' | 'hi' = 'en',
  appearance: 'light' | 'dark' = 'light',
  width = 360,
) {
  await page.setViewportSize({ width, height: width === 360 ? 800 : 844 })
  await page.evaluate(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance },
  )
  await page.reload()
  await page.getByRole('button', { name: PREVIEW[language] }).click()
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

async function start(page: Page) {
  await localOnly(page)
  await enter(page)
}

/** Each target sits fully on screen, above the composer (the chat scrolled them there). */
async function aboveComposer(page: Page, targets: Locator[], width: number) {
  // Polled: the smooth scroll to the end takes longer on a slow machine.
  await expect(async () => {
    const composer = (await page.locator('textarea[name="message"]').boundingBox())!
    for (const target of targets) {
      const box = (await target.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(composer.y)
      expect(box.y).toBeGreaterThan(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
  }).toPass({ timeout: 10_000 })
}

async function say(page: Page, text: string) {
  await page.locator('textarea[name="message"]').fill(text)
  await page.locator('button:has(svg.lucide-arrow-up)').first().click()
}

const BREAD = [{ name: 'Pav', price: 3000, unit: 'piece', stock: 40 }]

test('OB-174: find suppliers, order, then ask them: the chain waits for Send and goes on', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await start(page)
  await shop(page, 'Chain Bakes', BREAD)
  await open(page)
  await say(page, CHAIN)
  const steps = page.getByRole('group', { name: 'Steps: 2 of 3 done' })
  await expect(steps).toBeVisible({ timeout: 30_000 })
  await expect(steps).toContainText('ask them if they deliver on Sunday')
  await expect(steps).toContainText("Tap Send. Then I'll go on.")
  const send = page.getByRole('button', { name: /^Send to / }).last()
  await expect(send).toBeVisible()
  // Nothing went to the supplier before the tap: the Sunday question waits for it.
  await expect(page.getByText('Do you deliver on Sunday?')).toHaveCount(0)
  // 360 x 800: the card's Send and the steps' Stop are both above the composer, not under it.
  // Polled: the smooth scroll to the end takes longer on a slow machine.
  await aboveComposer(page, [send, steps.getByRole('button', { name: 'Stop here' })], 360)
  await page.screenshot({ path: `${SHOTS}/ob174-waiting-en-light-360.png` })

  await send.click()
  await expect(page.getByRole('group', { name: 'Steps: 3 of 3 done' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('Do you deliver on Sunday?').last()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ob174-done-en-light-360.png` })
  // The owner's own words only: the server's resume note never shows as theirs.
  await expect(page.getByRole('log')).not.toContainText('App note')
})

test('OB-174: Stop here ends the chain and leaves the order unsent', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  await shop(page, 'Stop Bakes', BREAD)
  await open(page)
  await say(page, CHAIN)
  await page.getByRole('button', { name: 'Stop here' }).click({ timeout: 30_000 })
  await expect(page.getByText('Stopped. Nothing else was done.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Send to / }).last()).toBeVisible()
  await expect(page.getByText('Do you deliver on Sunday?')).toHaveCount(0)
})

for (const [language, appearance, width] of [
  ['en', 'dark', 360],
  ['hi', 'light', 360],
  ['hi', 'dark', 360],
  ['en', 'light', 390],
] as const) {
  test(`OB-174 ${language} ${appearance} ${width}: the steps list reads in the app language`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await start(page)
    await shop(page, `Steps ${language} ${appearance}`, BREAD)
    await open(page, language, appearance, width)
    await say(page, CHAIN)
    const title = language === 'hi' ? 'क़दम: 3 में से 2 हो गए' : 'Steps: 2 of 3 done'
    const steps = page.getByRole('group', { name: title })
    await expect(steps).toBeVisible({ timeout: 30_000 })
    if (language === 'hi') {
      await expect(steps).toContainText('भेजें दबाएँ। फिर मैं आगे करूँगा।')
      await expect(steps.getByRole('button', { name: 'यहीं रोकें' })).toBeVisible()
    }
    // The Stop button and the card's Send both fit the phone: nothing under the composer.
    // No scrolling by the test: the chat itself brings them above the composer.
    await aboveComposer(
      page,
      [
        page.getByRole('button', { name: language === 'hi' ? / को भेजें$/ : /^Send to / }).last(),
        steps.getByRole('button'),
      ],
      width,
    )
    await page.screenshot({
      path: `${SHOTS}/ob174-waiting-${language}-${appearance}-${width}.png`,
    })
  })
}

const UNPRICED = [
  { name: 'Pav', price: 3000, unit: 'piece', stock: 40 },
  { name: 'Brownie', price: 0, unit: 'piece', stock: 40 },
]

test('OB-176: X asks why; Not now hides the card until tomorrow on every phone', async ({
  page,
}) => {
  await start(page)
  await shop(page, 'Price Bakes', UNPRICED)
  await open(page)
  const needs = page.getByTestId('today-needs')
  const row = needs.locator('li[data-need="noPrice"]')
  await expect(row).toContainText('Brownie has no price yet')
  await expect(row.getByRole('button', { name: 'Add price' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ob176-card-en-light-360.png` })

  await row.getByRole('button', { name: 'Hide: Brownie has no price yet' }).click()
  const why = row.getByRole('group', { name: 'Hide this card?' })
  await expect(why.getByRole('button', { name: 'Not now' })).toBeVisible()
  await expect(why.getByRole('button', { name: 'Not useful' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ob176-why-en-light-360.png` })
  await why.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByText('Hidden until tomorrow.')).toBeVisible()
  await expect(needs.locator('li[data-need="noPrice"]')).toHaveCount(0)

  // Saved on the server: a reload (or another phone) agrees.
  await page.reload()
  await page.getByRole('button', { name: PREVIEW.en }).click()
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('li[data-need="noPrice"]')).toHaveCount(0)
})

test('OB-176: Off on the You screen leaves Home without suggestions; Every day brings them back', async ({
  page,
}) => {
  await start(page)
  const id = await shop(page, 'Quiet Bakes', UNPRICED)
  await open(page)
  await expect(page.locator('li[data-need="noPrice"]')).toBeVisible()
  await page.getByRole('button', { name: 'You', exact: true }).click()
  const often = page.getByRole('combobox', { name: 'Cards on Home' })
  await expect(often).toHaveText('Every day')
  await expect(page.getByText('A customer who is waiting always shows.')).toBeVisible()
  await often.click()
  await page.getByRole('option', { name: 'Off' }).click()
  await expect(often).toHaveText('Off')
  await page.screenshot({ path: `${SHOTS}/ob176-setting-en-light-360.png` })
  const saved = await (await page.request.get(`/api/v1/businesses/${id}/today`)).json()
  expect(saved.cards.frequency).toBe('off')

  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await expect(page.getByTestId('today')).toBeVisible()
  await expect(page.locator('li[data-need="noPrice"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'You', exact: true }).click()
  await often.click()
  await page.getByRole('option', { name: 'Every day' }).click()
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await expect(page.locator('li[data-need="noPrice"]')).toBeVisible()
})

test('OB-176: Today shows at most five cards', async ({ page }) => {
  await start(page)
  // No hours, no phone, not shared, no photo, unpriced and low items: many things need the owner.
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name: 'Busy Bakes',
          category: 'Bakery',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        },
        products: [
          { name: 'Brownie', price: 0, unit: 'piece', stock: 1 },
          { name: 'Pav', price: 3000, unit: 'piece', stock: 1 },
        ],
      },
    })
  ).json()
  await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  await open(page)
  const needs = page.getByTestId('today-needs')
  await expect(needs.locator('> ul > li')).not.toHaveCount(0)
  // Rows that just left stay a moment (aria-hidden, fading out) and the list fills in as the
  // shop's data loads: count only live rows, and only once the count holds still.
  const live = needs.locator(
    'li[data-need]:not([aria-hidden="true"]), [data-testid="today-supply"]',
  )
  const more = needs.getByRole('button', { name: /more thing/ })
  const settle = async () => {
    let last = -1
    await expect(async () => {
      await expect(needs.locator('li[data-need][aria-hidden="true"]')).toHaveCount(0)
      const now = (await live.count()) + (await more.count())
      const before = last
      last = now
      expect(now).toBe(before)
    }).toPass({ intervals: [700], timeout: 15_000 })
  }
  await settle()
  if (await more.count()) {
    await more.click()
    await expect(needs.getByTestId('today-more')).toBeVisible()
    await settle()
  }
  expect(await live.count()).toBeLessThanOrEqual(5)
})

for (const [language, appearance, width] of [
  ['hi', 'light', 360],
  ['hi', 'dark', 390],
  ['en', 'dark', 390],
] as const) {
  test(`OB-176 ${language} ${appearance} ${width}: the card and its reasons read in the app language`, async ({
    page,
  }) => {
    await start(page)
    await shop(page, `Cards ${language} ${appearance}`, UNPRICED)
    await open(page, language, appearance, width)
    const row = page.locator('li[data-need="noPrice"]')
    const said = language === 'hi' ? 'Brownie का दाम अभी नहीं डाला' : 'Brownie has no price yet'
    await expect(row).toContainText(said)
    await row
      .getByRole('button', { name: language === 'hi' ? `छिपाएँ: ${said}` : `Hide: ${said}` })
      .click()
    await expect(
      row.getByRole('button', { name: language === 'hi' ? 'अभी नहीं' : 'Not now' }),
    ).toBeVisible()
    await expect(
      row.getByRole('button', { name: language === 'hi' ? 'काम का नहीं' : 'Not useful' }),
    ).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/ob176-why-${language}-${appearance}-${width}.png` })
  })
}
