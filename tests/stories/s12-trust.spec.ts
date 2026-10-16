import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { enter, localOnly, seedShop, share } from './support.js'

/**
 * S12 Trust: the optional "Verify it's you" check, end to end, with Chrome's fake camera.
 * consent → guided capture → verified → "Verified owner" on the customer page; the same face on
 * a second account opens a review (not an accusation) that a reviewer sees and clears; erase.
 *
 * The local server runs FACE_MODE=fixture: the fake camera shows no real face, so the server
 * stands in for the private face worker, and the face it "sees" is the X-Face-Fixture name this
 * test adds to the upload. The real worker is covered by backend tests and its smoke script.
 */
test.use({
  permissions: ['camera'],
  launchOptions: {
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : undefined),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
})

type Mode = 'light' | 'dark'

/** A fresh browser context with this project's device (another person's phone or laptop). */
function device(browser: Browser, permissions: string[] = ['camera']) {
  const use = test.info().project.use
  return browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    permissions,
  })
}

async function open(page: Page, mode: Mode) {
  await page.addInitScript((appearance) => {
    const key = 'niva.starter.preferences'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ appearance }))
  }, mode)
  await localOnly(page)
}

/** Every capture this page uploads is "seen" as this fixture face. */
async function face(page: Page, name: string) {
  await page.route('**/api/v1/face/challenges/*/capture', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-face-fixture': name } }),
  )
}

function recorder(mode: Mode) {
  return async (page: Page, step: string) => {
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      )
    })
    await page.screenshot({
      path: `docs/stories/trust-${test.info().project.name}-${mode}-${step}.png`,
      animations: 'disabled',
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${step}: horizontal overflow`,
    ).toBe(true)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // The live camera preview changes under the scan; its colours are not UI.
      .exclude('video')
      .analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual(
      [],
    )
  }
}

/** Consent, the 8-second guided capture, and the answer the dialog shows. */
async function verify(page: Page, shot: (page: Page, step: string) => Promise<void>, prefix = '') {
  const dialog = page.getByRole('dialog', { name: 'Verify it’s you' })
  await expect(dialog).toBeVisible()
  const camera = dialog.getByRole('button', { name: 'Open camera' })
  await expect(camera).toBeDisabled()
  if (prefix === '') await shot(page, '2-consent')
  await dialog.getByLabel(/I agree to this face check/).check()
  await camera.click()
  await expect(dialog.getByRole('progressbar', { name: 'Check progress' })).toBeVisible()
  await expect(dialog.getByRole('status')).toContainText(/Turn your head|look up/, {
    timeout: 5_000,
  })
  if (prefix === '') await shot(page, '3-camera')
  // The answer: Done (verified / in review) or Try again.
  await expect(dialog.getByRole('button', { name: /^(Done|Try again)$/ })).toBeVisible({
    timeout: 30_000,
  })
  return dialog
}

async function run(browser: Browser, page: Page, mode: Mode) {
  test.setTimeout(150_000)
  const shot = recorder(mode)
  const suffix = Date.now().toString().slice(-6)
  const faceName = `owner-${mode}-${test.info().project.name}-${suffix}`
  const first = `Courtyard Chai ${suffix}`
  const second = `Corner Chai ${suffix}`

  // 1. First owner: Privacy → Verify it's you.
  await open(page, mode)
  await face(page, faceName)
  await enter(page)
  await seedShop(page, false, first)
  const customerUrl = await share(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  const card = page.getByRole('region', { name: 'Verify it’s you' })
  await expect(card).toContainText('Optional')
  await shot(page, '1-privacy')
  await card.getByRole('button', { name: 'Verify it’s you' }).click()
  const dialog = await verify(page, shot)
  await expect(dialog.getByRole('heading', { name: 'You’re verified' })).toBeVisible()
  await shot(page, '4-verified')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(card).toContainText('Verified owner')
  await expect(card).toContainText('Checked on')

  // 2. The customer page says so, honestly.
  const shopper = await device(browser, [])
  const customer = await shopper.newPage()
  await open(customer, mode)
  await customer.goto(customerUrl)
  const badge = customer.getByRole('button', { name: 'Verified owner' })
  await expect(badge).toBeVisible()
  await badge.click()
  await expect(customer.getByText(/not proof of business ownership/)).toBeVisible()
  await shot(customer, '5-badge')
  await shopper.close()

  // 3. The same face registers another account, from the Google step before publishing.
  const context = await device(browser)
  const other = await context.newPage()
  await open(other, mode)
  await face(other, faceName)
  await enter(other)
  await seedShop(other, false, second)
  await other.getByRole('button', { name: 'Google', exact: true }).click()
  await other.getByRole('button', { name: /^Step 4 of 4/ }).click()
  const step = other.getByRole('region', { name: 'Verify it’s you' })
  await expect(step).toBeVisible()
  await shot(other, '6-google-step')
  await step.getByRole('button', { name: 'Verify it’s you' }).click()
  const again = await verify(other, shot, 'second')
  await expect(again.getByRole('heading', { name: 'Thanks, a person will take a look' })).toBeVisible()
  await expect(again).toContainText('nothing changes')
  await shot(other, '7-in-review')
  await again.getByRole('button', { name: 'Done' }).click()
  await expect(step).toContainText('A person is taking a look')

  // 4. Privacy: the owner's calm status, and (local reviewers) the review item.
  await other.getByRole('button', { name: 'Privacy', exact: true }).click()
  const review = other
    .getByRole('region', { name: 'Trust reviews' })
    .getByRole('listitem')
    .filter({ hasText: second })
  await expect(review).toContainText('Possible duplicate owner')
  await expect(review).toContainText(first)
  await review.scrollIntoViewIfNeeded()
  await shot(other, '8-review')

  // 5. Erase: template, status and the review go; the shop stays.
  const mine = other.getByRole('region', { name: 'Verify it’s you' })
  await mine.getByRole('button', { name: 'Delete face data' }).click()
  const confirm = other.getByRole('dialog', { name: 'Delete your face data?' })
  await shot(other, '9-delete')
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(other.getByText('Face data deleted')).toBeVisible()
  await expect(mine).toContainText('Optional')
  await expect(review).toHaveCount(0)
  await expect(other.getByRole('button', { name: `Choose shop: ${second}` })).toBeVisible()
  await shot(other, '10-erased')
  await context.close()
}

for (const mode of ['light', 'dark'] as const) {
  test(`S12 trust (${mode}): verify, verified badge, duplicate review, erase`, async ({
    browser,
    page,
  }) => {
    await run(browser, page, mode)
  })
}

test('S12 trust: a blocked camera says how to fix it and never starts a check', async ({
  browser,
}) => {
  const context = await device(browser, [])
  const page = await context.newPage()
  await localOnly(page)
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  let challenges = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/face/challenges')) challenges += 1
  })
  await enter(page)
  await seedShop(page, false, `Blocked Camera Cafe ${Date.now().toString().slice(-5)}`)
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await page.getByRole('button', { name: 'Verify it’s you' }).click()
  const dialog = page.getByRole('dialog', { name: 'Verify it’s you' })
  await dialog.getByLabel(/I agree to this face check/).check()
  await dialog.getByRole('button', { name: 'Open camera' }).click()
  await expect(dialog).toContainText('Allow the camera for this site')
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(challenges).toBe(0)
  await context.close()
})
