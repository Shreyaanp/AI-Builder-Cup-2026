import { expect, test, type Page } from '@playwright/test'
import { capture, copyFor } from './onboardPhoneSupport.js'
import { enter, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'

// New-shop typed setup on a phone: saving offline, a stalled coach and switching entry modes
// never lose or duplicate the shop (the rest of the phone battle: onboard-phone-battle.spec.ts).
test.use({
  reducedMotion: 'reduce',
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  viewport: { width: 390, height: 844 },
})
test.setTimeout(90_000)
// A phone battle test: the phone project only (desktop companion cases set their own size).
test.skip(({ isMobile }) => !isMobile, 'phone project only')

async function open(page: Page) {
  await localOnly(page)
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
}

test('OB-312 Hindi typed setup can recover from an offline save without raw errors', async ({
  page,
}) => {
  await localOnly(page)
  await page.addInitScript(() => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' }))
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined })
  })
  const { copy, flow, guided } = await copyFor(page, 'hi')
  await enter(page, copy)
  await page.getByRole('banner').getByRole('button', { name: copy.addShop }).click()
  await page.getByRole('button', { name: flow.begin }).click()
  await expect(page.getByRole('log')).not.toBeEmpty()
  await page.getByRole('button', { name: guided.typeItIn }).click()
  await page.getByRole('textbox').fill('परिवार की घर की बेकरी')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.category, exact: true })
    .click()
  await page.getByRole('textbox').fill('घर की बेकरी')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.delivery, exact: true })
    .click()
  await page.getByRole('button', { name: flow.review, exact: true }).click()
  const review = page.getByTestId('new-shop-review')
  await expect(review).toBeVisible()
  // The connection drops for the save only (see the OB-291 offline message case).
  await page.route('**/api/v1/proposals**', (route) => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: flow.open, exact: true }).click()
  await expect(review.getByRole('alert')).toBeVisible()
  await capture(page, 'hindi-offline-save')
  await expect(review.getByRole('alert')).toHaveText(copy.actionFailed)
  await page.unroute('**/api/v1/proposals**')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(0)
  await page.getByRole('button', { name: flow.open, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(flow.ready)
})

test('OB-310 manual setup can finish while the coach greeting is stalled', async ({ page }) => {
  await localOnly(page)
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined }),
  )
  const { copy, flow, guided } = await copyFor(page, 'en')
  await enter(page, copy)
  await page.route('**/api/v1/coach/stream', () => new Promise(() => {}))
  await page.getByRole('banner').getByRole('button', { name: copy.addShop }).click()
  await page.getByRole('button', { name: flow.begin }).click()
  await page.getByRole('button', { name: guided.typeItIn }).click()
  await page.getByRole('textbox').fill('Quick Bakery')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.delivery, exact: true })
    .click()
  await page.getByRole('button', { name: flow.review, exact: true }).click()
  await capture(page, 'manual-stalled-review')
  await expect(page.getByTestId('new-shop-review')).toBeVisible()
})

test('OB-311 switching a live shop to typing updates the same shop', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined }),
  )
  const { flow, guided } = await copyFor(page, 'en')
  await open(page)
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('name: Family Bakery; category: Bakery; location: Indiranagar')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  const before = await (await page.request.get('/api/v1/businesses')).json()
  await page.getByRole('button', { name: guided.typeItIn }).click()
  await page.getByRole('textbox').fill('Family Bakery revised')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.delivery, exact: true })
    .click()
  await page.getByRole('button', { name: flow.review, exact: true }).click()
  await page.getByRole('button', { name: flow.open, exact: true }).click()
  await page.getByRole('button', { name: 'Continue with my shop' }).click()
  const after = await (await page.request.get('/api/v1/businesses')).json()
  await capture(page, 'manual-live-shop')
  expect(after).toHaveLength(1)
  expect(after[0].id).toBe(before[0].id)
  expect(after[0].public).toBe(true)
  expect(after[0].fields.name).toBe('Family Bakery revised')
})
