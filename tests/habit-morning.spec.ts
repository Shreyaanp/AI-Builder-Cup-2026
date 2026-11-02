import { expect, test, type Page, type Request } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// HABIT slice 2, the morning loop on a phone. At 08:00 Coach opens with one lead action (one
// filled button) and one stock surface (the supply row with its run-out day, low items and supply
// exceptions all in "Needs you now"); the same item shows the same run-out day on Today, the
// brief and Grow (change 2, OB-238). Tomorrow's promise is set at close or by chat, leads the
// next morning, and "Not today" clears it for good (change 4). The server's day is real, so the
// morning is the browser clock plus the server's own record for that morning (read back with
// GET /promise?day=), never an invented promise. Local only, offline coach.
test.skip(({ isMobile }) => !isMobile, 'phone story')

const shopDay = (back: number) =>
  new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)

async function teaStall(page: Page, name: string, products: Record<string, unknown>[]) {
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Tea stall',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
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

async function sell(page: Page, id: string, back: number, sales: Record<string, unknown>[]) {
  const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
    data: { date: shopDay(back), sales },
  })
  const { sales: prepared } = await day.json()
  const saved = await page.request.post(
    `/api/v1/businesses/${id}/import/${prepared.import_id}/approve`,
    { data: { digest: prepared.digest } },
  )
  expect(saved.ok()).toBe(true)
}

/** Four weeks of chai and milk: the forecast and the supply run-out day exist. */
async function fourWeeks(page: Page, id: string) {
  for (let back = 28; back >= 1; back--) {
    const v = 3 + (back % 3)
    await sell(page, id, back, [
      { item: 'Masala chai', quantity: 20 * v, amount: 20 * v * 20 },
      { item: 'Milk', quantity: v, amount: v * 60 },
    ])
  }
}

async function open(page: Page, name: string, preview = 'Continue local preview') {
  await page.reload()
  await page.getByRole('button', { name: preview }).click()
  await expect(page.getByText(name).first()).toBeVisible()
}

async function prefer(page: Page, appearance: 'light' | 'dark', language = 'en') {
  await page.evaluate(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance },
  )
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)

/** What the server holds for a morning (null once done or cleared). */
async function promiseFor(page: Page, id: string, day: string) {
  const response = await page.request.get(`/api/v1/businesses/${id}/promise?day=${day}`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as { text: string; kind: string; item: string | null } | null
}

/** The browser is at that morning; Today shows the server's record for it. */
async function morningOf(page: Page, id: string, day: string) {
  await page.clock.setFixedTime(new Date(`${day}T08:00:00+05:30`))
  await page.unroute('**/api/v1/businesses/*/today')
  await page.route('**/api/v1/businesses/*/today', async (route) => {
    const response = await route.fetch()
    const real = await response.json()
    await route.fulfill({ response, json: { ...real, promise: await promiseFor(page, id, day) } })
  })
}

test('08:00: one lead action, one stock surface, one run-out day on Today, brief and Grow', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(new Date(`${shopDay(0)}T08:00:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Morning Lane Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 12 },
    { name: 'Sugar', price: 4800, unit: 'kg', stock: 3 },
  ])
  await fourWeeks(page, id)
  await open(page, name)

  const today = page.getByTestId('today')
  const card = page.getByTestId('today-needs')
  // The supply row: "Milk runs out Sun, Nov 8", inside "Needs you now".
  const supply = card.locator('[data-need="supply"]')
  await expect(supply).toContainText(/Milk runs out [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/)
  const day = /Milk runs out ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2})/.exec(
    (await supply.textContent()) ?? '',
  )![1]!

  for (const appearance of ['light', 'dark'] as const)
    for (const width of [360, 390, 412]) {
      await test.step(`${width} ${appearance}`, async () => {
        if (appearance === 'dark' && width === 360) {
          await prefer(page, 'dark')
          await open(page, name)
        }
        await page.setViewportSize({ width, height: 844 })
        await expect(card.locator('[data-need="supply"]')).toBeVisible()
        // One lead action: exactly one filled button, on the first row.
        await expect(today.locator('.MuiButton-contained')).toHaveCount(1)
        await expect(
          card.locator('[data-need]').first().locator('.MuiButton-contained'),
        ).toHaveCount(1)
        // One stock surface: every stock line is a row of the one card, and Milk is said once.
        const stock = today.locator(
          '[data-need="supply"], [data-need="low"], [data-testid="today-supply-needs"]',
        )
        expect(await stock.count()).toBe(
          await card
            .locator('[data-need="supply"], [data-need="low"], [data-testid="today-supply-needs"]')
            .count(),
        )
        await expect(today.locator('[data-tour="today-supply"]')).toHaveCount(1)
        await expect(today.getByText(/^Milk/)).toHaveCount(1)
        // Phone-first: no side scroll, 48 px targets, 16 px row text.
        expect(await fitsWidth(page)).toBe(true)
        for (const button of await card.getByRole('button').all())
          expect(Math.round((await button.boundingBox())!.height)).toBeGreaterThanOrEqual(48)
        const size = await supply
          .locator('p')
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize)
        expect(size).toBe('16px')
        await page.screenshot({
          path: test.info().outputPath(`morning-${width}-${appearance}.png`),
        })
      })
    }

  // The brief on Grow and the Grow supply tile name the same day, in the same words.
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  const low = page.locator('[aria-roledescription="slide"]').filter({ hasText: 'Running low' })
  await expect(low).toContainText('Milk')
  await expect(low).toContainText(`Runs out ${day}`)
  await expect(page.getByText(`Milk runs out ${day}`).filter({ visible: true })).toHaveCount(1)
})

test('a promise set at close leads next morning; "Not today" clears it and it never returns', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const tonight = shopDay(0)
  const tomorrow = shopDay(-1)
  await page.clock.setFixedTime(new Date(`${tonight}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Promise Lane Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 2 },
  ])
  const counted: Record<string, unknown>[] = []
  page.on('request', (request: Request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/businesses/${id}/habit`))
      counted.push(...(request.postDataJSON() as { events: Record<string, unknown>[] }).events)
  })
  await open(page, name)

  // Close the day, then write one thing down for tomorrow from the close screen.
  await page
    .locator('[data-need="closeDay"]')
    .getByRole('button', { name: 'Close the day' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: /type/i }).first().click()
  await dialog.locator('input[name=item]').fill('Masala chai')
  await dialog.locator('input[name=quantity]').fill('72')
  await dialog.locator('input[name=amount]').fill('2490')
  await dialog.locator('form button[type=submit]').click()
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await dialog.getByRole('button', { name: 'Save day' }).click()
  const block = dialog.getByTestId('close-tomorrow')
  await expect(block.getByRole('heading', { name: 'Tomorrow' })).toBeVisible({ timeout: 20_000 })
  // Both paths are named: the screen's own control and the chat phrase.
  await expect(block.getByTestId('ask-hint')).toContainText('Remind me to order milk tomorrow')
  await block.scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('close-tomorrow-390.png') })
  // The stock that runs out first is one tap (Milk, 2 left).
  await block.getByRole('button', { name: 'Remind me to order Milk' }).click()
  await expect(dialog.getByTestId('close-tomorrow-saved')).toHaveText(
    'Written down: order Milk. It will be at the top of Coach tomorrow morning.',
  )
  // The finishing button is still the only filled one.
  await expect(dialog.locator('.MuiButton-contained')).toHaveCount(1)
  expect(await fitsWidth(page)).toBe(true)
  await dialog.getByRole('button', { name: 'Done' }).click()
  // Tonight it is not on Today: the promise is for the morning.
  await expect(page.locator('[data-need="promise"]')).toHaveCount(0)
  expect(await promiseFor(page, id, tomorrow)).toMatchObject({
    text: 'order Milk',
    kind: 'order',
    item: 'Milk',
  })

  // Next morning (clock mocked): it leads, with the one filled button.
  await morningOf(page, id, tomorrow)
  await open(page, name)
  const rows = page.getByTestId('today-needs').locator('[data-need]')
  await expect(rows.first()).toHaveAttribute('data-need', 'promise')
  await expect(rows.first()).toContainText('Last night you said: order Milk')
  await expect(rows.first().getByRole('button', { name: 'Order now' })).toHaveClass(
    /MuiButton-contained/,
  )
  await expect(page.getByTestId('today').locator('.MuiButton-contained')).toHaveCount(1)
  // The promise names Milk, so Milk is not also a low row.
  await expect(page.locator('[data-need="low"]').filter({ hasText: 'Milk' })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('promise-morning-390.png') })

  // "Not today" clears it with no comment.
  await rows.first().getByRole('button', { name: 'Not today' }).click()
  await expect(page.locator('[data-need="promise"]')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  // Milk is still low, and Today still says so: clearing the promise hides no stock fact.
  await expect(
    page.locator('[data-need="low"]').filter({ hasText: 'Milk: only 2 left' }),
  ).toBeVisible()
  expect(await promiseFor(page, id, tomorrow)).toBeNull()
  // Counted as numbers only: the promise row was shown, never its words.
  const said = () => counted.map((e) => `${e.event}${e.kind ? `:${e.kind}` : ''}`)
  await expect
    .poll(said, { timeout: 10_000 })
    .toEqual(expect.arrayContaining(['prompt_shown:promise']))
  // It does not reappear: not after a reload, not later that day.
  await open(page, name)
  await expect(page.getByTestId('today')).toBeVisible()
  await expect(page.locator('[data-need="promise"]')).toHaveCount(0)
  // Clearing it is not a useful action, so never action_done (nor the visit's first action,
  // which only action_done carries). The reload above sent everything the visit counted.
  expect(said()).not.toContain('action_done:promise')
  expect(JSON.stringify(counted)).not.toContain('Milk')
  await page.clock.setFixedTime(new Date(`${tomorrow}T13:00:00+05:30`))
  await open(page, name)
  await expect(page.getByTestId('today')).toBeVisible()
  await expect(page.locator('[data-need="promise"]')).toHaveCount(0)
})

test('chat and screen both set a promise; doing it marks it done (offline coach)', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 360, height: 780 })
  const tonight = shopDay(0)
  const tomorrow = shopDay(-1)
  await page.clock.setFixedTime(new Date(`${tonight}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Two Paths Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 20 },
  ])
  await prefer(page, 'dark')
  await open(page, name)

  // Screen: the close screen's own words.
  await page
    .locator('[data-need="closeDay"]')
    .getByRole('button', { name: 'Close the day' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Close the day' })
  await dialog.getByRole('button', { name: /type/i }).first().click()
  await dialog.locator('input[name=item]').fill('Masala chai')
  await dialog.locator('input[name=quantity]').fill('50')
  await dialog.locator('input[name=amount]').fill('1000')
  await dialog.locator('form button[type=submit]').click()
  await dialog.getByRole('button', { name: /^Review/ }).click()
  await dialog.getByRole('button', { name: 'Save day' }).click()
  const block = dialog.getByTestId('close-tomorrow')
  await expect(block).toBeVisible({ timeout: 20_000 })
  await block.getByLabel('One thing for tomorrow').fill('Call Ganesh about cups')
  await page.screenshot({ path: test.info().outputPath('close-tomorrow-360-dark.png') })
  await block.getByRole('button', { name: 'Remind me tomorrow' }).click()
  await expect(dialog.getByTestId('close-tomorrow-saved')).toContainText(
    'Written down: Call Ganesh about cups.',
  )
  expect(await fitsWidth(page)).toBe(true)
  await dialog.getByRole('button', { name: 'Done' }).click()
  expect(await promiseFor(page, id, tomorrow)).toMatchObject({
    text: 'Call Ganesh about cups',
    kind: 'note',
  })

  // Chat: the offline coach writes it down (one a day: it replaces the one above).
  await page.getByLabel('Message', { exact: true }).fill('Remind me to order milk tomorrow')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log')).toContainText(
    'Written down for tomorrow morning: "order milk". It will be at the top of Coach.',
    { timeout: 20_000 },
  )
  await expect(page.getByRole('log')).toContainText('Grow → Close the day')
  expect(await promiseFor(page, id, tomorrow)).toMatchObject({
    text: 'order milk',
    kind: 'order',
    item: 'Milk',
  })

  // Next morning: "Order now" asks the coach for the order and marks the promise done. The
  // chat is still open from last night, so Today is the pill above it, with the same rows.
  await morningOf(page, id, tomorrow)
  await open(page, name)
  await page.locator('[aria-controls="today-pill-panel"]').click()
  const row = page.locator('[data-need="promise"]')
  await expect(row).toContainText('Last night you said: order Milk')
  expect(await fitsWidth(page)).toBe(true)
  await row.getByRole('button', { name: 'Order now' }).click()
  await expect(page.getByRole('log')).toContainText('Order more Milk', { timeout: 20_000 })
  await expect.poll(() => promiseFor(page, id, tomorrow)).toBeNull()
})

test('Hindi: the morning promise row is all Hindi', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 412, height: 900 })
  const tomorrow = shopDay(-1)
  await localOnly(page)
  await enter(page)
  const name = 'Hindi Promise Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
    { name: 'Milk', price: 6000, unit: 'litre', stock: 20 },
  ])
  const made = await page.request.post(`/api/v1/businesses/${id}/promise`, {
    data: { text: 'order Milk', kind: 'order', item: 'Milk' },
  })
  expect(made.ok()).toBe(true)
  await prefer(page, 'light', 'hi')
  await morningOf(page, id, tomorrow)
  await open(page, name, 'स्थानीय प्रीव्यू जारी रखें')
  const row = page.locator('[data-need="promise"]')
  await expect(row).toContainText('कल रात आपने कहा था: Milk मँगाना')
  await expect(row.getByRole('button', { name: 'अभी मँगाएँ' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'आज नहीं' })).toBeVisible()
  await expect(row).not.toContainText(/Last night|Order now|Not today/)
  expect(await fitsWidth(page)).toBe(true)
})

/** A sent order for Milk: the supply row's "… on order, arriving …" line. */
async function milkOnOrder(page: Page, id: string) {
  const drafted = await page.request.post(`/api/v1/businesses/${id}/supply/reorder`, {
    data: { item: 'Milk', source: 'bought' },
  })
  expect(drafted.ok()).toBe(true)
  const body = (await drafted.json()) as { status: string; order: { id: string; version: number } }
  expect(body.status, JSON.stringify(body)).toBe('drafted')
  const { order } = body
  const sent = await page.request.post(
    `/api/v1/businesses/${id}/supply/orders/${order.id}/approve`,
    { data: { version: order.version } },
  )
  expect(sent.ok()).toBe(true)
}

for (const lang of ['en', 'hi'] as const) {
  test(`${lang}: the promise names the supply item: said once, with its run-out day and Reorder`, async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const tomorrow = shopDay(-1)
    await localOnly(page)
    await enter(page)
    const name = `Once Lane Chai ${lang}`
    const id = await teaStall(page, name, [
      { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
      // Packs, as the demo supplier sells it: Reorder drafts at once.
      { name: 'Milk', price: 6000, unit: 'pack', stock: 12 },
    ])
    await fourWeeks(page, id)
    await open(page, name)
    // Without a promise, Milk is the supply row with its run-out day.
    const supplyRow = page.locator('[data-need="supply"]')
    await expect(supplyRow).toContainText('Milk runs out')
    const runsOut = ((await supplyRow.innerText()).match(/Milk runs out (.+)/) ?? [])[1]!.trim()
    // Some Milk is on its way, and the row says so.
    await milkOnOrder(page, id)
    await open(page, name)
    await expect(supplyRow).toContainText(/on order, arriving/)
    const onOrder = (await supplyRow.innerText()).split('\n').find((l) => /on order/.test(l))!
    const made = await page.request.post(`/api/v1/businesses/${id}/promise`, {
      data: { text: 'order milk', kind: 'order', item: 'Milk' },
    })
    expect(made.ok()).toBe(true)
    if (lang === 'hi') await prefer(page, 'light', 'hi')
    await morningOf(page, id, tomorrow)
    await open(page, name, lang === 'hi' ? 'स्थानीय प्रीव्यू जारी रखें' : undefined)
    const today = page.getByTestId('today')
    const row = today.locator('[data-need="promise"]')
    const reorder = row.getByRole('button', { name: lang === 'hi' ? /मँगाएँ|ऑर्डर/ : 'Reorder' })
    if (lang === 'en') {
      await expect(row).toContainText('Last night you said: order Milk')
      // While the promise is open, Coach still says when Milk runs out and what is coming.
      await expect(row).toContainText(`Milk runs out ${runsOut}`)
      await expect(row).toContainText(onOrder)
    } else {
      await expect(row).toContainText('कल रात आपने कहा था: Milk मँगाना')
      await expect(row).toContainText(/Milk .+ को खत्म हो(गा|गी)/)
      await expect(row).toContainText(/ऑर्डर/)
      await expect(row).not.toContainText(/Last night|runs out|on order|Not today/)
    }
    // Said once: the promise is the supply row, with the supply row's own Reorder, filled.
    await expect(today.locator('[data-need="supply"]')).toHaveCount(0)
    await expect(today.locator('[data-need]').filter({ hasText: /milk/i })).toHaveCount(1)
    await expect(today.locator('.MuiButton-contained')).toHaveCount(1)
    await expect(row.locator('.MuiButton-contained')).toHaveCount(1)
    await expect(row.locator('[data-tour="reorder"]')).toHaveClass(/MuiButton-contained/)
    expect(await fitsWidth(page)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`promise-supply-${lang}-390.png`) })
    if (lang === 'hi') return
    // Reorder answers the promise and opens the same order sheet as the supply row: Milk is on
    // order already, so it asks first. The row stays, as the supply row, run-out day and all.
    await reorder.click()
    await expect(row).toHaveCount(0)
    await expect(supplyRow).toContainText(`Milk runs out ${runsOut}`)
    await expect.poll(() => promiseFor(page, id, tomorrow)).toBeNull()
  })
}

test('Hindi: the close screen’s own Hindi hint, typed into the chat, writes the promise down', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const tonight = shopDay(0)
  const tomorrow = shopDay(-1)
  await page.clock.setFixedTime(new Date(`${tonight}T20:30:00+05:30`))
  await localOnly(page)
  await enter(page)
  const name = 'Hindi Chat Chai'
  const id = await teaStall(page, name, [
    { name: 'Masala chai', price: 2000, unit: 'cup', category: 'Drinks', stock: 40 },
  ])
  await prefer(page, 'light', 'hi')
  await open(page, name, 'स्थानीय प्रीव्यू जारी रखें')
  await page.getByLabel('संदेश', { exact: true }).fill('कल सुबह दूध मँगाना याद दिलाना')
  await page.getByRole('button', { name: 'भेजें', exact: true }).click()
  await expect(page.getByRole('log')).toContainText(
    'कल सुबह के लिए लिख लिया: “दूध मँगाना”। यह कोच में सबसे ऊपर दिखेगा। यह बढ़ाएँ → दिन बंद करें में भी है।',
    { timeout: 20_000 },
  )
  expect(await promiseFor(page, id, tomorrow)).toMatchObject({ text: 'दूध मँगाना', kind: 'note' })
  expect(await fitsWidth(page)).toBe(true)
})
