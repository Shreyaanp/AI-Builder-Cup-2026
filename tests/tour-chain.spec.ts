import { expect, test, type Page } from '@playwright/test'

// The owner tour follows one order: the tea stall's forecast and WhatsApp reorder, the same order
// at the wholesaler and its CSV restock, the chain's SAP loop, the goods arriving, and customers.
// Every name and number on screen is checked against the seeded records the API returns.
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
  wholesaler: { name: string; inbound: Order; restock: Order }
  chain: { name: string; outlets: string; order: Order }
  arrived: { item: string; unit: string; before: number; after: number }[]
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

    test(`tour follows one order on seeded data (${world.item})`, async ({ page }, info) => {
      test.setTimeout(120_000)
      const story = await start(page)
      // The seeded records are the expected story; the screen must show exactly these.
      expect(story.today.item).toBe(world.item)
      expect(story.order.number).toBe('4500000001')
      expect(story.order.partner).toBe(world.wholesaler)
      expect(story.wholesaler.inbound.partner).toBe(world.stall)
      expect(story.wholesaler.restock.partner).toBe(world.distributor)
      expect(story.customers.reward).toBe(world.reward)
      const shot = (n: number) =>
        page.screenshot({
          path: `output/playwright/tour-chain/${info.project.name}-${world.item}-${n}.png`,
          animations: 'disabled',
        })
      const card = page.locator('#tour-title').locator('..')
      const panel = page.locator('[data-tour="feature"]')

      await expect(page.locator('#tour-title')).toContainText('Your shop at a glance', {
        timeout: 30_000,
      })
      await expect(card).toContainText('1 of 14')
      await expect(card).toContainText('eight weeks of sales')

      await test.step('1 · Today: the forecast card with the seeded numbers', async () => {
        await next(page)
        await expect(page.locator('#tour-title')).toContainText(`${world.item} runs out`)
        await expect(card).toContainText(
          `${qty(story.today.stock, story.today.unit)} left, about ${qty(story.today.daily, story.today.unit)} a day`,
        )
        await expect(panel).toContainText(`${world.item} runs out`)
        await expect(panel.getByRole('button', { name: 'Reorder' })).toBeVisible()
        await noSideScroll(page)
        await shot(1)
      })

      await test.step('2 · Reorder: the WhatsApp order to the wholesaler', async () => {
        await next(page)
        await expect(card).toContainText('The AI drafts the order')
        await expect(card).toContainText(
          `WhatsApp to ${world.wholesaler.replace(' (Demo)', '')}: ${story.order.lines.length} items`,
        )
        await expect(card).toContainText(money(story.order.total))
        await expect(panel).toContainText(`To ${world.wholesaler}`)
        await expect(panel.getByTestId('tour-whatsapp')).toHaveText(story.order.message)
        for (const line of story.order.lines) await expect(panel).toContainText(line.item)
        await noSideScroll(page)
        await shot(2)
      })

      await test.step('3 · Vendor to vendor: the order arrives, the wholesaler restocks', async () => {
        await next(page)
        await expect(card).toContainText('It lands at the wholesaler')
        await expect(card).toContainText(world.distributor.replace(' (Demo)', ''))
        await expect(panel).toContainText(`From ${world.stall} · 4500000001`)
        await expect(panel).toContainText(
          `Same ${story.wholesaler.inbound.lines.length} items as your WhatsApp order`,
        )
        await expect(panel).toContainText(money(story.wholesaler.inbound.total))
        expect(story.wholesaler.inbound.lines).toEqual(story.order.lines)
        await expect(panel).toContainText('Spreadsheet (CSV) by email')
        await expect(panel).toContainText(
          `To ${world.distributor} · ${story.wholesaler.restock.number}`,
        )
        const first = story.wholesaler.restock.lines[0]!
        await expect(panel).toContainText(qty(first.quantity, first.unit))
        await noSideScroll(page)
        await shot(3)
      })

      await test.step('4 · The chain: Metro Foods in SAP, in plain words', async () => {
        await next(page)
        await expect(card).toContainText('A big chain does it in SAP')
        await expect(card).toContainText(`Metro Foods, ${story.chain.outlets} outlets`)
        await expect(panel).toContainText(story.chain.name)
        await expect(panel).toContainText(
          `Order ${story.chain.order.number} to ${story.chain.order.partner}`,
        )
        for (const label of ['New order', 'Order confirmed', 'Shipping notice', 'Invoice'])
          await expect(panel).toContainText(label)
        await expect(panel).toContainText('SAP DELVRY07')
        await noSideScroll(page)
        await shot(4)
      })

      await test.step('5 · Goods arrive: stock and Today update', async () => {
        await next(page)
        const row = story.arrived.find((r) => r.item === world.item)!
        expect(row.after).toBeGreaterThan(row.before)
        await expect(card).toContainText('Goods arrive')
        await expect(card).toContainText(
          `${world.item}: ${qty(row.before, row.unit)} → ${qty(row.after, row.unit)}`,
        )
        await expect(panel).toContainText(qty(row.after, row.unit))
        await expect(panel).toContainText('Covered until')
        await noSideScroll(page)
        await shot(5)
      })

      await test.step('6 · Customers: stamps today and the reward', async () => {
        await next(page)
        await expect(card).toContainText('Customers come back')
        await expect(card).toContainText(
          `${story.customers.stamps_today} stamps today. At ${story.customers.stamps_needed} stamps: ${world.reward}.`,
        )
        await expect(panel).toContainText(
          `${story.customers.stamps_needed} stamps: ${world.reward}`,
        )
        await noSideScroll(page)
        await shot(6)
      })

      for (const title of [
        'Your menu, by category',
        'Close the day in a minute',
        'Just talk or type',
        'Get on Google, guided',
        'Import sales or menu (Excel, photo, notes)',
        'Get your first customers',
        'Your new shop is ready',
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
    const card = page.locator('#tour-title').locator('..')
    await expect(card).toContainText('14 में से 1', { timeout: 30_000 })
    await expect(card).toContainText('आठ हफ़्ते')
    const expected = [
      `${story.today.item}`,
      'AI ऑर्डर तैयार करता है',
      'ऑर्डर थोक व्यापारी तक',
      'बड़ी चेन यही SAP में करती है',
      'माल आ गया',
      'ग्राहक लौटकर आते हैं',
    ]
    for (const [index, title] of expected.entries()) {
      await next(page, 'आगे')
      await expect(page.locator('#tour-title')).toContainText(title)
      if (index === 0) await expect(card).toContainText('बचा है')
      if (index === 1) await expect(card).toContainText(money(story.order.total))
      if (index === 5)
        await expect(card).toContainText(`आज ${story.customers.stamps_today} स्टैम्प`)
      await noSideScroll(page)
    }
    await page.screenshot({
      path: `output/playwright/tour-chain/${info.project.name}-hi-customers.png`,
      animations: 'disabled',
    })
  })
})
