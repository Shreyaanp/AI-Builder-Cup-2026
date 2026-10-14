import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { rewardCardEnglish, rewardCardTranslations } from '../src/features/rewards/cardCopy.ts'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const key = 'chalkboard.customer.rewards.v1'
const shop = {
  id,
  name: 'Neighbourhood Kopi',
  category: 'Café',
  location: 'Tiong Bahru, Singapore',
  hours: '07:00–19:00',
  phone: '',
  timezone: 'Asia/Singapore',
  currency: 'SGD',
  open_now: true,
  reward_text: 'A free kopi',
  stamps_needed: 8,
  products: [{ name: 'Kopi', unit: 'cup', price: 180, available: true }],
}
test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.route(`**/api/v1/public/shops/${id}*`, (route) => route.fulfill({ json: shop }))
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({ json: { mode: 'demo', places: [], google_unavailable: false } }),
  )
})
const card = (page: Page) => page.getByRole('region', { name: 'Stamp card' })
async function axe(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
for (const mode of ['light', 'dark'] as const) {
  test(`B30 ${mode}: customer theme covers explore, shop and chat`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode })
    await page.goto('/explore/')
    await expect(
      page.getByRole('heading', { name: 'What’s around me?', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await axe(page)
    await page.goto(`/explore/s/${id}`)
    await expect(page.getByRole('heading', { name: shop.name, exact: true })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute(
      'href',
      '/explore/',
    )
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(17, 17, 17)',
    )
    const button = page.getByRole('button', { name: 'Chat with the shop' })
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      mode === 'light' ? 'rgb(17, 17, 17)' : 'rgb(250, 250, 250)',
    )
    await axe(page)
    await mkdir('docs/bugs', { recursive: true })
    await page.screenshot({ path: `docs/bugs/B30-${mode}.png` })
    await button.click()
    await expect(page.getByLabel('Your question')).toBeVisible()
    await axe(page)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      mode === 'light' ? '#ffffff' : '#111111',
    )
    const opposite = mode === 'light' ? 'dark' : 'light'
    await page.emulateMedia({ colorScheme: opposite })
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      opposite === 'light' ? '#ffffff' : '#111111',
    )
  })
}

test('B31: QR only, once per shop day across timezone midnight, full card and staff reset', async ({
  page,
}) => {
  // The phone runs in Singapore; the shop is in Los Angeles.
  await page.route(`**/api/v1/public/shops/${id}*`, (route) =>
    route.fulfill({ json: { ...shop, timezone: 'America/Los_Angeles', stamps_needed: 3 } }),
  )
  await page.clock.install({ time: new Date('2026-10-15T06:59:00Z') })
  await page.goto(`/explore/s/${id}`)
  await expect(card(page).getByRole('status')).toHaveText('0 stamps')
  await expect(card(page).locator('[data-filled]')).toHaveCount(3)
  await page.goto(`/explore/s/${id}?source=qr`)
  await expect(card(page).getByRole('status')).toHaveText('1 stamps')
  await page.reload()
  await expect(card(page).getByRole('status')).toHaveText('1 stamps')
  await page.clock.setSystemTime(new Date('2026-10-15T07:01:00Z'))
  await page.reload()
  await expect(card(page).getByRole('status')).toHaveText('2 stamps')
  await expect(card(page)).toContainText('1 more for A free kopi')
  await expect(card(page)).toContainText('This card is stored on this phone.')
  await page.clock.setSystemTime(new Date('2026-10-16T07:01:00Z'))
  await page.goto(`/explore/s/${id}`)
  await expect(card(page).getByRole('status')).toHaveText('2 stamps')
  await page.goto(`/explore/s/${id}?source=qr`)
  await expect(card(page).getByRole('status')).toHaveText('3 stamps')
  await page.clock.setSystemTime(new Date('2026-10-17T07:01:00Z'))
  await page.reload()
  await expect(card(page).getByRole('status')).toHaveText('3 stamps')
  await card(page).getByRole('button', { name: 'Claim reward', exact: true }).click()
  const redeem = page.getByRole('dialog', { name: shop.name })
  await expect(redeem).toBeVisible()
  await expect(redeem).toContainText('A free kopi')
  await expect(redeem).toContainText('Saturday, October 17, 2026')
  const before = await redeem.locator('time').textContent()
  await page.clock.setSystemTime(new Date('2026-10-17T07:01:00Z'))
  await page.clock.runFor(2000)
  await expect(redeem.locator('time')).not.toHaveText(before!)
  await axe(page)
  // Back closes the redeem view, retaining the full card.
  await page.goBack()
  await expect(redeem).not.toBeVisible()
  await card(page).getByRole('button', { name: 'Claim reward', exact: true }).click()
  await redeem.getByRole('button', { name: 'Staff: mark as used', exact: true }).click()
  await expect(redeem).not.toBeVisible()
  await expect(card(page).getByRole('status')).toHaveText('0 stamps')
  await expect(card(page)).toContainText('1 reward claimed')
  // This is a later calendar day than the last earned stamp, so one new stamp is allowed.
  await page.reload()
  await expect(card(page).getByRole('status')).toHaveText('1 stamps')
  await page.reload()
  await expect(card(page).getByRole('status')).toHaveText('1 stamps')
})

test('B31: same-day reset retains daily limit and saves claim count across reloads', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-15T00:00:00Z') })
  const today = Date.UTC(2026, 9, 15) / 86_400_000
  await page.addInitScript(
    ({ key, id, today }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            shops: { [id]: { stamps: 8, lastStamp: today } },
            days: [],
            reminders: [],
          }),
        )
    },
    { key, id, today },
  )
  await page.goto(`/explore/s/${id}?source=qr`)
  await card(page).getByRole('button', { name: 'Claim reward', exact: true }).click()
  await page.getByRole('button', { name: 'Staff: mark as used', exact: true }).click()
  await expect(card(page).getByRole('status')).toHaveText('0 stamps')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).shops, key)).toEqual({
    [id]: { stamps: 0, lastStamp: today, claimed: 1 },
  })
  await page.goto(`/explore/s/${id}?source=qr`, { waitUntil: 'domcontentloaded' })
  await expect(card(page).getByRole('status')).toHaveText('0 stamps')
  await expect(card(page)).toContainText('1 reward claimed')
})

test('B31: card and redeem proof at 390×844', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') })
  await page.goto(`/explore/s/${id}?source=qr`)
  const today = Date.UTC(2026, 9, 15) / 86_400_000
  await page.evaluate(
    ({ key, id, today }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          shops: { [id]: { stamps: 5, lastStamp: today } },
          days: [],
          reminders: [],
        }),
      )
      window.dispatchEvent(new Event('chalkboard-rewards-change'))
    },
    { key, id, today },
  )
  await expect(card(page)).toContainText('3 more for A free kopi')
  await axe(page)
  await mkdir('docs/bugs', { recursive: true })
  await page.screenshot({ path: 'docs/bugs/B31-card.png' })
  await page.evaluate(
    ({ key, id, today }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          shops: { [id]: { stamps: 8, lastStamp: today } },
          days: [],
          reminders: [],
        }),
      )
      window.dispatchEvent(new Event('chalkboard-rewards-change'))
    },
    { key, id, today },
  )
  await card(page).getByRole('button', { name: 'Claim reward', exact: true }).click()
  await expect(page.getByRole('dialog', { name: shop.name })).toBeVisible()
  await axe(page)
  await page.screenshot({ path: 'docs/bugs/B31-redeem.png' })
})

test('B31: twenty circles and long reward text stay usable with enlarged text', async ({
  page,
}) => {
  const expandedShop = {
    ...shop,
    name: 'Neighbourhood Kopi and Toast Counter',
    stamps_needed: 20,
    reward_text: 'A free kopi and kaya toast set at the counter on your next visit',
  }
  await page.route(`**/api/v1/public/shops/${id}*`, (route) =>
    route.fulfill({ json: expandedShop }),
  )
  await page.goto(`/explore/s/${id}`)
  await expect(card(page).locator('[data-filled]')).toHaveCount(20)
  await page.evaluate(
    ({ key, id }) => {
      document.documentElement.style.fontSize = '32px'
      localStorage.setItem(
        key,
        JSON.stringify({
          shops: { [id]: { stamps: 20, lastStamp: null } },
          days: [],
          reminders: [],
        }),
      )
      window.dispatchEvent(new Event('chalkboard-rewards-change'))
    },
    { key, id },
  )
  await card(page).getByRole('button', { name: 'Claim reward', exact: true }).click()
  const redeem = page.getByRole('dialog', { name: expandedShop.name })
  await expect(redeem).toBeVisible()
  const content = redeem.locator('.MuiDialogContent-root')
  await content.evaluate((el) => {
    el.scrollTop = 0
  })
  await expect(redeem.getByRole('heading', { name: expandedShop.name })).toBeInViewport()
  await redeem.getByRole('button', { name: 'Staff: mark as used' }).scrollIntoViewIfNeeded()
  await expect(redeem.getByRole('button', { name: 'Staff: mark as used' })).toBeInViewport()
  await axe(page)
})

for (const [locale, t] of Object.entries({ en: rewardCardEnglish, ...rewardCardTranslations })) {
  test(`B31 ${locale}: translated progress and redemption`, async ({ page }) => {
    await page.addInitScript(
      (locale) =>
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ appearance: 'light', language: locale }),
        ),
      locale,
    )
    await page.goto(`/explore/s/${id}?source=qr`)
    await expect(page.getByText(t.phone, { exact: true })).toBeVisible()
    await expect(
      page.getByText(t.more.replace('{count}', '7').replace('{reward}', shop.reward_text), {
        exact: true,
      }),
    ).toBeVisible()
    await page.evaluate(
      ({ key, id }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            shops: { [id]: { stamps: 8, lastStamp: null } },
            days: [],
            reminders: [],
          }),
        )
        window.dispatchEvent(new Event('chalkboard-rewards-change'))
      },
      { key, id },
    )
    await page.getByRole('button', { name: t.claim, exact: true }).click()
    await expect(
      page.getByRole('dialog', { name: shop.name }).getByRole('button', { name: t.markUsed }),
    ).toBeVisible()
    await axe(page)
  })
}
