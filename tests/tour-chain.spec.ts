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

const money = (minor: number) =>
  (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number, unit: string) => `${n} ${unit}`

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
  await page.goto('/')
  await page
    .getByRole('button', { name: /स्थानीय प्रीव्यू जारी रखें|Continue local preview/ })
    .click()
  await page.getByRole('checkbox').nth(0).check()
  await page.getByRole('checkbox').nth(1).check()
  await page
    .getByRole('button')
    .filter({ hasText: /Agree and continue|सहमत/ })
    .click()
  const made = page.waitForResponse((r) => r.url().includes('/api/v1/demo/workspace'))
  await page
    .getByRole('button', { name: language === 'hi' ? 'दौरा शुरू करें' : 'Take the tour' })
    .first()
    .click()
  const { business_id } = (await (await made).json()) as { business_id: string }
  const story = (await (
    await page.request.get(`/api/v1/demo/chain/${business_id}`)
  ).json()) as Story
  return story
}

async function next(page: Page, label = 'Next') {
  await page.getByRole('button', { name: label, exact: true }).click()
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
  {
    zone: 'Asia/Singapore',
    locale: 'en-SG',
    item: 'Kopi powder',
    wholesaler: 'Ah Huat Provision (Demo)',
    stall: 'Sunny Side Kopitiam (Demo)',
    distributor: 'Katong Trading (Demo)',
    reward: 'A free kopi',
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

      await expect(page.getByRole('dialog', { name: 'Your shop at a glance' })).toBeVisible({
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
        await expect(page.getByRole('dialog', { name: title })).toBeVisible()
      }
      await next(page)
      await page.getByRole('button', { name: 'Keep exploring' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await test.step('Reorder on Today really drafts it (#264)', async () => {
        await page.getByRole('button', { name: 'Coach', exact: true }).click()
        const today = page
          .getByRole('region', { name: 'Supplies' })
          .or(page.locator('section').filter({ hasText: `${world.item} runs out` }))
        await today.first().getByRole('button', { name: 'Reorder' }).click()
        const sheet = page.getByRole('dialog').last()
        await expect(sheet).toContainText(world.wholesaler)
        await expect(sheet).toContainText(world.item)
        await expect(page.getByText(/No purchase orders yet/)).toHaveCount(0)
        await shot(7)
      })
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
    const expected = [story.today.item, 'AI ऑर्डर तैयार करता है']
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
