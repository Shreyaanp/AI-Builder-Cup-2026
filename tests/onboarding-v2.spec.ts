import { expect, test, type Page } from '@playwright/test'
import { enter, image, localOnly, seedShop } from './stories/support.js'

// Onboarding v2 (owner decisions, 17 Oct), on a phone: ask only name, what they sell, where,
// hours and a shop photo; one sentence fills many fields; the shop goes live by itself after
// name + kind + place; one summary card, then the optional face check; "Review my shop" in any
// state; thinking always ends; a reload resumes silently; Today asks for the menu first.
test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true })
test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

const ASKED = {
  name: 'What is your business called?',
  kind: 'What do you sell?',
  place: 'Are you at the shop right now?',
  hours: 'What are your opening hours?',
  photo: 'Can you take a photo of your shop?',
}

async function begin(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(ASKED.name)
}

async function say(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

/** What the coach said (its chat lines only). */
async function coachLines(page: Page) {
  return (await page.getByRole('log').locator('li').allInnerTexts()).join('\n')
}

test('one sentence puts the shop live; no menu question; summary, skip face, Today asks the menu first', async ({
  page,
}) => {
  await enter(page)
  await begin(page)
  await say(page, 'name: Lakshmi Tea Stall; category: chai aur samosa; location: Indiranagar metro')
  // Name, kind and place in one go: live at once, and only what is missing is asked.
  await expect(page.getByTestId('shop-live')).toHaveText('Live')
  await expect(page.getByRole('log')).toContainText(ASKED.hours)
  await expect(page.getByTestId('agent-action')).toHaveCount(0) // filled silently
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  expect(shops).toHaveLength(1)
  expect(shops[0].public).toBe(true)
  // "pata nahi" skips the hours (never invented); "baad mein" skips the photo.
  await say(page, 'pata nahi')
  await expect(page.getByRole('log')).toContainText(ASKED.photo)
  await say(page, 'baad mein')
  const summary = page.getByTestId('shop-summary')
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('Lakshmi Tea Stall')
  await expect(summary).toContainText('Add later from Today')
  await expect(summary).toContainText('verify it’s you')
  const said = await coachLines(page)
  expect(said).not.toMatch(/menu|pay|delivery|halal|price/i)
  for (const question of Object.values(ASKED))
    expect(said.split(question).length - 1, question).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  // Face check skipped: the shop opens; Today asks for the menu first (photo or typed).
  await summary.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByRole('heading', { name: 'Your shop is ready' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue with my shop' }).click()
  const today = page.getByTestId('today-day-one')
  await expect(today).toContainText('Add your menu')
  await expect(today.getByRole('button', { name: 'Scan' })).toBeVisible()
  await expect(today.getByRole('button', { name: 'Type it' })).toBeVisible()
  // Customers already find it: menu coming soon (chat meanwhile), hours not set.
  await page.goto(`/s/${shops[0].id}`)
  const soon = page.getByTestId('menu-coming-soon')
  await expect(soon).toContainText('Menu coming soon')
  await expect(page.getByRole('button', { name: /Hours not set/ })).toBeVisible()
  await soon.getByRole('button', { name: 'Chat with the shop' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('a correction replaces the name silently and the live shop follows', async ({ page }) => {
  await enter(page)
  await begin(page)
  await say(page, 'name: Lakshmi Tea Stall; category: Tea stall; location: Indiranagar')
  await expect(page.getByTestId('shop-live')).toBeVisible()
  await say(page, 'name: Lakshmi Chai Point')
  await expect(page.getByTestId('shop-so-far')).toContainText('Lakshmi Chai Point')
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/businesses')).json())[0].fields.name)
    .toBe('Lakshmi Chai Point')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
})

test('"Review my shop" opens at once while thinking and while a photo saves', async ({ page }) => {
  await enter(page)
  await begin(page)
  await say(page, 'name: Patel Kirana')
  await expect(page.getByTestId('shop-so-far')).toContainText('Patel Kirana')
  // Thinking: the reply is slow on the way.
  await page.route('**/api/v1/coach/stream', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    await route.fallback()
  })
  await say(page, 'category: Grocery')
  await page.getByTestId('review-my-shop').click()
  const review = page.getByTestId('draft-summary')
  await expect(review).toContainText('Patel Kirana', { timeout: 1_000 })
  await page.keyboard.press('Escape')
  await expect(review).toHaveCount(0)
  // The conversation was never cancelled: the reply lands and the next field is asked.
  await expect(page.getByRole('log')).toContainText(ASKED.place)
  await page.unroute('**/api/v1/coach/stream')
  // Saving a photo.
  await page.route('**/api/v1/photos?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    await route.fulfill({
      json: {
        status: 'nothing_to_propose',
        photo_kind: 'storefront',
        proposal: null,
        extraction: {
          uncertain: [],
          business: { name: '', category: '', location: '', hours: '', phone: '' },
          products: [],
        },
      },
    })
  })
  await page.getByRole('button', { name: 'Shop photo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
  await (await chooser).setFiles(await image(page))
  await page.getByTestId('review-my-shop').click()
  await expect(review).toBeVisible({ timeout: 1_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
})

test('a hung reply never leaves the onboarding thinking: it stops with Retry', async ({ page }) => {
  await enter(page)
  await begin(page)
  // The stream opens and then nothing ever comes (a provider stuck mid-turn).
  await page.route('**/api/v1/coach/stream', () => undefined)
  await say(page, 'name: Stuck Bakery')
  const stalled = page.getByTestId('turn-stalled')
  await expect(stalled).toContainText('That took too long — try again.', { timeout: 20_000 })
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await page.unroute('**/api/v1/coach/stream')
  await stalled.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('shop-so-far')).toContainText('Stuck Bakery')
  await expect(page.getByRole('log')).toContainText(ASKED.kind)
})

test('the text coach never stays thinking: a hung reply stops with the message kept', async ({
  page,
}) => {
  await enter(page)
  await seedShop(page)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.route('**/api/v1/coach/stream', () => undefined)
  await page.getByLabel('Message', { exact: true }).fill('How did yesterday go?')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('That took too long — try again.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('How did yesterday go?')
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
})

test('a reload mid-onboarding resumes silently: the card, the next step, no new greeting', async ({
  page,
}) => {
  await enter(page)
  await begin(page)
  await say(page, 'name: Lakshmi Tea Stall; category: chai')
  await expect(page.getByRole('log')).toContainText(ASKED.place)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const start = page.getByRole('button', { name: 'Let’s begin' })
  if (!(await start.isVisible()))
    await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await start.click()
  // The saved draft comes back, the map (the next step) is offered, and nothing is re-asked.
  await expect(page.getByTestId('shop-so-far')).toContainText('Lakshmi Tea Stall')
  await expect(page.getByTestId('map-card')).toBeVisible()
  await page.waitForTimeout(1_500)
  const said = await coachLines(page)
  expect(said).not.toContain(ASKED.name)
  expect(said).not.toContain(ASKED.kind)
})
