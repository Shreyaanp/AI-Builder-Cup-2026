import { expect, test, type Page } from '@playwright/test'

// The owner tour reads the seeded records: the tea stall's Today supply card and its WhatsApp
// reorder (OB-51: both light real elements on the Coach screen; the wholesaler and chain steps
// were previews of other businesses' screens and are gone). Every name and number on screen is
// checked against the seeded records the API returns.
test.skip(({ isMobile }) => !isMobile, '390×844 phone story')

interface Line {
  item: string
  quantity: number
  unit: string
}
interface Order {
  number: string
  partner: string
  total: number
  lines: Line[]
}
interface Story {
  today: { item: string; unit: string; stock: number; daily: number }
  order: Order & { message: string }
  customers: { stamps_today: number; stamps_needed: number; reward: string }
}

// Whole rupees drop the ".00" (OB-210); real paise stay.
const money = (minor: number) =>
  (minor / 100).toLocaleString('en-IN', {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
// Same rounding as the tour (chainSteps.amount): one decimal, so 2.71 kg reads 2.7 kg (OB-62).
const qty = (n: number, unit: string) =>
  `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n)} ${unit}`

async function start(page: Page, language?: string) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
  if (language)
    await page.addInitScript((language) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
    }, language)
  const made = page.waitForResponse(
    (r) => r.url().includes('/api/demo/workspace') && r.request().method() === 'POST',
  )
  await page.goto('/demo?tour=1')
  const madeResponse = await made
  const { business_id } = (await madeResponse.json()) as { business_id: string }
  const sessionId = new URL(madeResponse.url()).pathname.match(/\/sessions\/([^/]+)\/api\//)?.[1]
  expect(sessionId).toBeTruthy()
  const story = (await (
    await page.request.get(`/api/v1/demo/sessions/${sessionId}/api/demo/chain/${business_id}`)
  ).json()) as Story
  return story
}

async function next(page: Page, label = 'Next') {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click()
}

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy()
  // The owner brief caps each spotlight at two short lines on a 390px phone.
  const body = page.locator('#tour-title + p')
  await expect(body).toBeVisible()
  expect(
    await body.evaluate((element) => {
      const line = Number.parseFloat(getComputedStyle(element).lineHeight)
      return element.getBoundingClientRect().height <= line * 2 + 1
    }),
  ).toBeTruthy()
}

// The tour now runs on the public demo, whose tour shop is the Bengaluru chai stall for every
// visitor (backend/app/public_demo.py). The Singapore story seed is still checked in
// backend/tests/test_tour_story.py.
for (const world of [
  {
    zone: 'Asia/Kolkata',
    locale: 'en-IN',
    item: 'Tea dust',
    wholesaler: 'Sri Lakshmi Provisions (Demo)',
    stall: 'Lantern Chai Corner (Demo)',
    distributor: 'Anand Distributors (Demo)',
    reward: 'A free chai',
  },
]) {
  test.describe(world.zone, () => {
    test.use({ timezoneId: world.zone, locale: world.locale })

    test(`OB-51 tour reads seeded data on real elements (${world.item})`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000)
      const story = await start(page)
      // The seeded records are the expected story; the screen must show exactly these.
      expect(story.today.item).toBe(world.item)
      expect(story.order.number).toBe('4500000001')
      expect(story.order.partner).toBe(world.wholesaler)
      expect(story.customers.reward).toBe(world.reward)
      const shot = (n: number) =>
        page.screenshot({
          path: `output/playwright/tour-chain/${info.project.name}-${world.item}-${n}.png`,
          animations: 'disabled',
        })
      const card = page.getByTestId('tour-card')

      await expect(page.locator('#tour-title')).toContainText('Your shop at a glance', {
        timeout: 30_000,
      })
      await expect(card).toContainText('1 of 7')
      await expect(card).toContainText('eight weeks of sales')
      // OB-51: nothing is drawn over the page but the spotlight and the card.
      await expect(page.locator('[data-tour="feature"]')).toHaveCount(0)

      await test.step('1 · Today: the real supply card with the seeded numbers', async () => {
        await next(page)
        await expect(page.locator('#tour-title')).toContainText(`${world.item} runs out`)
        await expect(card).toContainText(
          `${qty(story.today.stock, story.today.unit)} left, about ${qty(story.today.daily, story.today.unit)} a day`,
        )
        const real = page.locator('[data-tour="today-supply"]')
        await expect(real).toContainText(`${world.item} runs out`)
        await expect(real.getByRole('button', { name: 'Reorder' })).toBeVisible()
        await noSideScroll(page)
        await shot(1)
      })

      await test.step('2 · Reorder: the WhatsApp order, lighting the real Reorder button', async () => {
        await next(page)
        await expect(card).toContainText('The AI drafts the order')
        await expect(card).toContainText(
          `WhatsApp to ${world.wholesaler.replace(' (Demo)', '')}: ${story.order.lines.length} items`,
        )
        await expect(card).toContainText(money(story.order.total))
        await expect(page.locator('[data-tour="reorder"]')).toBeVisible()
        await noSideScroll(page)
        await shot(2)
      })

      for (const title of [
        'Tomorrow’s prep plan',
        'Your menu, by category',
        'Close the day in a minute',
        'Just talk or type',
      ]) {
        await next(page)
        await expect(page.locator('#tour-title')).toContainText(title)
      }
      await next(page)
      await page.getByRole('dialog').getByRole('button', { name: 'Keep exploring' }).click()
      await expect(page.locator('#tour-title')).toHaveCount(0)
    })
  })
}

test.describe('Hindi', () => {
  test.use({ timezoneId: 'Asia/Kolkata', locale: 'hi-IN' })

  test('the order story reads fully in Hindi with the same seeded numbers', async ({
    page,
  }, info) => {
    test.setTimeout(120_000)
    const story = await start(page, 'hi')
    const card = page.getByTestId('tour-card')
    await expect(card).toContainText('7 में से 1', { timeout: 30_000 })
    await expect(card).toContainText('आठ हफ़्ते')
    const expected = ['चाय पत्ती', 'AI ऑर्डर तैयार करता है']
    for (const [index, title] of expected.entries()) {
      await next(page, 'आगे')
      await expect(page.locator('#tour-title')).toContainText(title)
      if (index === 0) await expect(card).toContainText('बचा है')
      if (index === 1) await expect(card).toContainText(money(story.order.total))
      await noSideScroll(page)
    }
    await page.screenshot({
      path: `output/playwright/tour-chain/${info.project.name}-hi-order.png`,
      animations: 'disabled',
    })
  })
})
