// Launch-video screen capture: drives the real app (local dev run, offline coach) and saves
// phone screenshots to docs/launch/source/assets/screens/.
//
// Two things are staged, and the launch notes say so:
// - the menu-photo read: the offline fixture can't read a real photo, so /photos returns a real
//   sealed proposal prepared through the API (what the live Gemini read produces);
// - the customer's "halal?" answer: the offline fixture doesn't use shop facts, so /ask returns
//   the answer the live path gives from the owner-confirmed facts (halal: yes; cash, PayNow).
// Everything else is the app as it runs: seeded demo shops, real sales, real switches.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const out = 'docs/launch/source/assets/screens'
const backend = join(process.cwd(), 'backend')
const portable = join(homedir(), 'AppData', 'Local', 'AIBuilderCupTools', 'uv', 'uv.exe')
const uv = process.env.UV_PATH || (existsSync(portable) ? portable : 'uv')
const SHOP = 'demo-geylang-serai-nasi-lemak'
const NAME = 'Serai Sunrise Nasi Lemak'

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
  await page.waitForTimeout(500)
}
async function shot(page: Page, name: string) {
  await settle(page)
  await page.screenshot({ path: `${out}/${name}.png` })
}
async function enter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
}

test('launch screens', async ({ page, browser }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
  await enter(page)
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
  await shot(page, '01-coach-start')

  // 1. The owner snaps the menu board; the coach prepares the shop for review.
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: {
          name: NAME,
          category: 'Hawker stall · Nasi lemak',
          location: 'Geylang Serai',
          hours: '07:00–14:00',
          currency: 'SGD',
        },
        products: [
          { name: 'Nasi lemak (ikan bilis)', price: 350, unit: 'plate' },
          { name: 'Nasi lemak with chicken wing', price: 550, unit: 'plate' },
          { name: 'Nasi lemak with rendang', price: 650, unit: 'plate' },
          { name: 'Otah', price: 150, unit: 'piece' },
          { name: 'Teh tarik', price: 160, unit: 'cup' },
        ],
      },
    })
  ).json()
  await page.route('**/api/v1/photos**', async (route) => {
    // Long enough to film "Checking your photo…", like a real read.
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await route.fulfill({
      json: {
        status: 'needs_review',
        photo_id: 'launch-photo',
        photo_kind: 'menu_board',
        extraction: { uncertain: [] },
        proposal: prepared,
        google_publication: 'not_connected',
      },
    })
  })
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'menu-board.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lxoAAAAASUVORK5CYII=',
        'base64',
      ),
    })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/02-reading-photo.png` })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText(NAME)
  await shot(page, '03-review-sheet')
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Give this local workspace the labelled demo shops and real sales history.
  execFileSync(
    uv,
    [
      'run',
      '--locked',
      'python',
      '../docs/launch/capture/setup_launch_shop.py',
      '--db',
      'data/launch-merchant.sqlite3',
    ],
    { cwd: backend, env: { ...process.env, PYTHONPATH: '.' }, stdio: 'inherit' },
  )
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: /^Choose shop/ }).click()
  await page.getByRole('menuitem', { name: new RegExp(NAME) }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${NAME}` })).toBeVisible()
  await shot(page, '04-coach-shop-card')

  // 2. My shop: tiles, then one item flipped to sold out with the owner's own switch.
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await shot(page, '05-my-shop')
  await page.getByRole('button', { name: /^Sold out today/ }).click()
  await shot(page, '06-sold-out-before')
  const wing = page.getByRole('switch', { name: 'Available: Nasi lemak with chicken wing' })
  await wing.click()
  await expect(wing).not.toBeChecked()
  await shot(page, '07-sold-out-after')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 3. Customer page QR, as the owner prints it.
  await page.getByRole('button', { name: /^Customer page/ }).click()
  await page.getByRole('img', { name: /^QR code for/ }).scrollIntoViewIfNeeded()
  await shot(page, '08-qr-sheet')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 4. Weekly recap from the saved sales.
  await page.getByRole('button', { name: /^Weekly recap/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await shot(page, '09-weekly-recap')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 5. Google: Chalkboard prepares the details; Google verifies (never "publishes").
  await page.getByRole('button', { name: 'Google', exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, '10-google')
  await page.getByText('Verified on Google?').scrollIntoViewIfNeeded()
  await page.mouse.wheel(0, 300)
  await shot(page, '10b-google-verifies')

  // 6. A customer scans the QR and asks "halal?".
  const customer = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
  })
  const phone = await customer.newPage()
  await phone.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await phone.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.fallback() : route.abort()
  })
  await phone.route(`**/api/v1/public/shops/${SHOP}/ask`, (route) =>
    route.fulfill({
      json: {
        answer:
          'Yes. Serai Sunrise Nasi Lemak says its food is halal. You can pay with cash or PayNow.',
        mode: 'gemini',
      },
    }),
  )
  await phone.goto(`/explore/s/${SHOP}`)
  await expect(phone.getByRole('heading', { name: NAME })).toBeVisible()
  await shot(phone, '11-customer-page')
  await phone.getByRole('button', { name: 'Chat with the shop' }).click()
  const ask = phone.getByRole('textbox').last()
  await ask.fill('Is the food halal?')
  await ask.press('Enter')
  await expect(phone.getByText(/says its food is halal/)).toBeVisible()
  await shot(phone, '12-customer-halal')
  await customer.close()
})
