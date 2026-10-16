import { createShop, detailsStep, editShopDetails } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const progressKey = 'chalkboard.customer.rewards.v1'

async function localOnly(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

async function fixture(page: Page, available: () => boolean = () => false) {
  await localOnly(page)
  await page.route('**/api/v1/public/shops/*', (route) =>
    route.fulfill({
      json: {
        id,
        name: 'Tiong Bahru Kopi',
        timezone: 'Asia/Singapore',
        category: 'Kopi',
        location: 'Tiong Bahru',
        hours: '07:00–19:00',
        phone: '',
        currency: 'SGD',
        reward_text: '10th kopi free',
        stamps_needed: 10,
        products: [{ name: 'Kaya toast', unit: 'set', price: 240, available: available() }],
      },
    }),
  )
  await page.route('**/api/v1/public/shops/*/stock-alerts', (route) =>
    route.fulfill({ json: { expires: Date.now() / 1000 + 7 * 86_400, delivery: 'in_page' } }),
  )
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: [], google_unavailable: false } }),
  )
}

function card(page: Page) {
  return page.getByRole('region', { name: 'Stamp card' })
}
async function setDay(page: Page, day: number) {
  await page.clock.setFixedTime(new Date(`2026-10-${String(day).padStart(2, '0')}T08:00:00+08:00`))
}

test('QR stamps are once per shop per calendar day and celebrate 5 and 10', async ({ page }) => {
  await fixture(page)
  await page.clock.install({ time: new Date('2026-10-01T08:00:00+08:00') })
  await page.goto(`/explore/s/${id}`)
  await expect(card(page).getByRole('status')).toHaveText('0 stamps')
  await page.goto(`/explore/s/${id}?source=qr`)
  await expect(card(page).getByRole('status')).toHaveText('1 stamps')
  await expect(page.getByText('This card is stored on this phone.')).toBeVisible()
  await expect(page.getByText('10th kopi free')).toBeVisible()
  await page.reload()
  await expect(card(page).getByRole('status')).toHaveText('1 stamps')
  for (let day = 2; day <= 10; day++) {
    await setDay(page, day)
    await page.reload()
    await expect(card(page).getByRole('status')).toHaveText(
      [5, 10].includes(day) ? `${day} stamps — hooray!` : `${day} stamps`,
    )
  }
  await expect(
    page.getByRole('list', { name: 'Your badges' }).getByText('5 stamps', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Your badges' }).getByText('10 stamps', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Your badges' }).getByText('3 days in a row'),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Your badges' }).getByText('Early bird'),
  ).toBeVisible()
})

test('badges appear in Your usuals, shops have independent cards, and reduced motion is honoured', async ({
  page,
}) => {
  await fixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-10-01T08:00:00+08:00') })
  for (let n = 0; n < 5; n++) {
    const shop = `${n}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    await page.goto(`/explore/s/${shop}?source=qr`)
    await expect(card(page).getByRole('status')).toHaveText('1 stamps')
  }
  await expect(page.getByText('Tried 5 shops')).toBeVisible()
  // Force the fifth daily visit for one shop using genuine calendar progression.
  for (let day = 2; day <= 5; day++) {
    await setDay(page, day)
    await page.reload()
    await expect(card(page).getByRole('status')).toHaveText(
      day === 5 ? '5 stamps — hooray!' : `${day} stamps`,
    )
  }
  await expect(card(page).getByRole('status')).toHaveText('5 stamps — hooray!')
  expect(
    await card(page)
      .getByRole('status')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
  await page.evaluate(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Your usuals' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Your badges' }).getByText('Tried 5 shops'),
  ).toBeVisible()
})

test('fallback reminder survives a visit and announces available stock without notifications', async ({
  page,
}) => {
  let available = false
  await fixture(page, () => available)
  await page.goto(`/explore/s/${id}`)
  await page.getByRole('button', { name: 'Tell me when it’s back' }).click()
  await expect(page.getByRole('button', { name: 'Reminder saved' })).toBeDisabled()
  await expect(
    page.getByText('On your next visit, for 7 days. No browser notifications.'),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reminder saved' })).toBeVisible()
  available = true
  await page.reload()
  await expect(page.getByText('Kaya toast is back!')).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('reminders expire after 7 days and remain on-device if subscription is unavailable', async ({
  page,
}) => {
  let available = false
  await fixture(page, () => available)
  await page.route('**/api/v1/public/shops/*/stock-alerts', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Unavailable' } }),
  )
  await page.clock.install({ time: new Date('2026-10-01T08:00:00+08:00') })
  await page.goto(`/explore/s/${id}`)
  await page.getByRole('button', { name: 'Tell me when it’s back' }).click()
  await expect(
    page.getByText('On your next visit, for 7 days. No browser notifications.'),
  ).toBeVisible()
  await setDay(page, 8)
  available = true
  await page.reload()
  await expect(page.getByText('Kaya toast is back!')).toHaveCount(0)
})

test('corrupt or blocked storage does not break the customer menu or imply saved progress', async ({
  page,
}) => {
  await fixture(page)
  await page.addInitScript((key) => {
    localStorage.setItem(key, '{"shops":{"bad":null},"days":[],"reminders":[]}')
    Storage.prototype.setItem = () => {
      throw new DOMException('Unavailable', 'SecurityError')
    }
  }, progressKey)
  await page.goto(`/explore/s/${id}?source=qr`)
  await expect(page.getByRole('heading', { name: 'Menu & prices' })).toBeVisible()
  await expect(
    card(page).getByText(
      'Browser storage is unavailable. Your progress and reminders cannot be saved.',
    ),
  ).toBeVisible()
  await expect(card(page).getByRole('status')).toHaveText('0 stamps')
})

test('owner reward edits require exact review before saving and clearing', async ({ page }) => {
  await localOnly(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  // The shop comes from the new-shop flow; its reward is set in the details form.
  await createShop(page, 'name: Neighbourhood Kopi')
  await editShopDetails(page)
  await detailsStep(page, 'Reward')
  await page.getByLabel('Reward text (optional)').fill('10th kopi free')
  await expect(page.getByLabel('Stamps needed')).toHaveValue('8')
  await page.getByLabel('Stamps needed').fill('10')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('10th kopi free')
  await expect(review.getByText('10', { exact: true })).toBeVisible()
  expect(
    (await (await page.request.get('/api/v1/businesses')).json())[0].fields.reward_text,
  ).toBeUndefined()
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Neighbourhood Kopi' })).toBeVisible()
  while ((await page.getByRole('dialog').count()) > 0) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await expect(page.getByRole('dialog')).toContainText('10th kopi free')
  await page.getByRole('button', { name: 'Edit details' }).click()
  await detailsStep(page, 'Reward')
  await page.getByLabel('Reward text (optional)').fill('')
  await expect(page.getByLabel('Stamps needed')).toHaveValue('10')
  await page.getByLabel('Stamps needed').fill('6')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(review).toContainText('Reward text (optional)')
  const before = await (await page.request.get('/api/v1/businesses')).json()
  expect(before[0].fields.reward_text).toBe('10th kopi free')
  expect(before[0].fields.stamps_needed).toBe(10)
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).not.toBeVisible()
  const after = await (await page.request.get('/api/v1/businesses')).json()
  expect(after[0].fields.reward_text).toBeUndefined()
  expect(after[0].fields.stamps_needed).toBe(6)
})

const locales = [
  ['zh-SG', '集章卡', '向店家出示此卡'],
  ['ms-MY', 'Kad cop', 'Tunjukkan ini kepada kedai'],
  ['ta-SG', 'முத்திரை அட்டை', 'இதைக் கடையில் காட்டுங்கள்'],
  ['ja-JP', 'スタンプカード', 'お店でこの画面を見せてください'],
  ['ko-KR', '스탬프 카드', '매장에서 이 화면을 보여 주세요'],
  ['id-ID', 'Kartu stempel', 'Tunjukkan ini ke toko'],
  ['th-TH', 'บัตรสะสมแสตมป์', 'แสดงหน้านี้ให้ร้านดู'],
  ['vi-VN', 'Thẻ tích dấu', 'Đưa màn hình này cho cửa hàng'],
  ['fil-PH', 'Stamp card', 'Ipakita ito sa tindahan'],
] as const

for (const [locale, title] of locales) {
  test.describe(`rewards in ${locale}`, () => {
    test.use({ locale })
    test('translated card wraps on phone and desktop', async ({ page }) => {
      await fixture(page)
      await page.goto(`/explore/s/${id}?source=qr`)
      await expect(page.getByRole('region', { name: title })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    })
  })
}
