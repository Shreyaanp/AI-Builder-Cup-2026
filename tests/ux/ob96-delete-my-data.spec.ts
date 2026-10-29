import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * OB-96 (#396): the customer profile has one "Delete my data" that confirms first, then erases
 * everything the server keeps for the customer (chats, passport, tips, follows, preferences) and
 * signs them out. Phones first (360, 390, 412), then desktop; light and dark.
 */
const SHOP = 'demo-story-bengaluru-chai'
const SIZES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
] as const

async function prepare(page: Page, appearance: 'light' | 'dark') {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.context().setExtraHTTPHeaders({ 'x-test-rate-limit-bypass': '1' })
  await page.addInitScript((value) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: value }))
    localStorage.setItem('chalkboard.customer.journey', 'done')
  }, appearance)
}

/** A signed-in customer with a chat, a follow and a preference on the server. */
async function busyCustomer(page: Page) {
  const signedIn = await page.request.post('/api/v1/customer/session', {
    data: { name: 'Neighbour' },
  })
  expect(signedIn.ok()).toBe(true)
  expect((await page.request.put(`/api/v1/customer/follows/${SHOP}`)).ok()).toBe(true)
  const prefs = await page.request.put('/api/v1/customer/preferences', {
    data: { vegetarian: true },
  })
  expect(prefs.ok()).toBe(true)
  const chat = await page.request.post(`/api/v1/customer/shops/${SHOP}/threads`, {
    data: { text: 'Open today?' },
  })
  expect(chat.ok()).toBe(true)
}

async function openProfile(page: Page) {
  await page.getByRole('button', { name: 'Profile and preferences' }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: 'Your profile' })).toBeVisible()
  return sheet
}

for (const size of SIZES) {
  const phone = size.width < 600
  test.describe(`OB-96 ${size.width}`, () => {
    test.use({ viewport: size, isMobile: phone, hasTouch: phone })

    test(`OB-96 Delete my data confirms, erases the account's data and signs out · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page, 'light')
      await busyCustomer(page)
      await page.goto('/explore/saved')
      const sheet = await openProfile(page)
      // One delete action; the old stamps-only clear is gone.
      await expect(sheet.getByRole('button', { name: 'Delete my data' })).toHaveCount(1)
      await expect(sheet.getByRole('button', { name: 'Clear my stamps and follows' })).toHaveCount(
        0,
      )
      await sheet.getByRole('button', { name: 'Delete my data' }).click()
      const confirm = sheet.getByRole('group', { name: 'Delete my data' })
      await expect(confirm).toContainText('This deletes your chats with shops')
      // Nothing is deleted before it is confirmed.
      await confirm.getByRole('button', { name: 'Not now' }).click()
      await expect(confirm).toHaveCount(0)
      const threads = await page.request.get('/api/v1/customer/threads')
      expect(((await threads.json()) as unknown[]).length).toBe(1)

      await sheet.getByRole('button', { name: 'Delete my data' }).click()
      const erased = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/customer/data') && r.request().method() === 'DELETE',
      )
      await sheet.getByRole('button', { name: 'Delete', exact: true }).click()
      const body = (await (await erased).json()) as {
        status: string
        erased: string[]
        chats: number
      }
      expect(body).toMatchObject({
        status: 'erased',
        erased: ['chats', 'passport', 'tips', 'profile'],
        chats: 1,
      })
      // Signed out on Ask, told the account was deleted, nothing personal left on this phone.
      await expect(page.getByRole('status').filter({ hasText: 'Account deleted.' })).toBeVisible()
      await expect(page).toHaveURL(/\/explore\/$/)
      const me = (await (await page.request.get('/api/v1/customer/me')).json()) as {
        signed_in: boolean
      }
      expect(me.signed_in).toBe(false)
      expect(
        await page.evaluate(() => localStorage.getItem('chalkboard.customer.follows')),
      ).toBeNull()
    })

    test(`OB-96 a failed erasure says so and offers Try again · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page, 'light')
      await busyCustomer(page)
      let calls = 0
      await page.route('**/api/v1/customer/data', (route) => {
        calls += 1
        return calls === 1
          ? route.fulfill({
              json: { status: 'partial', erased: ['passport'], pending: ['chats'], chats: 0 },
            })
          : route.fallback()
      })
      await page.goto('/explore/saved')
      const sheet = await openProfile(page)
      await sheet.getByRole('button', { name: 'Delete my data' }).click()
      await sheet.getByRole('button', { name: 'Delete', exact: true }).click()
      const alert = sheet.getByRole('alert')
      await expect(alert).toContainText('Couldn’t delete everything yet.')
      // Still signed in: nothing claims success.
      await expect(sheet.getByText('Signed in as Neighbour')).toBeVisible()
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Account deleted.' })).toBeVisible()
      expect(calls).toBe(2)
    })

    for (const appearance of ['light', 'dark'] as const) {
      test(`OB-96 the delete row and its confirm pass the UX rules · ${size.width} ${appearance}`, async ({
        page,
      }) => {
        await prepare(page, appearance)
        await busyCustomer(page)
        await page.goto('/explore/saved')
        const sheet = await openProfile(page)
        await sheet.getByRole('button', { name: 'Delete my data' }).click()
        const confirm = sheet.getByRole('group', { name: 'Delete my data' })
        await expect(confirm).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        for (const target of [
          sheet.getByRole('button', { name: 'Delete my data' }),
          confirm.getByRole('button', { name: 'Delete', exact: true }),
          confirm.getByRole('button', { name: 'Not now' }),
        ]) {
          await target.scrollIntoViewIfNeeded()
          const box = (await target.boundingBox())!
          expect(box.height).toBeGreaterThanOrEqual(48)
          expect(box.width).toBeGreaterThanOrEqual(48)
        }
        // Nothing sideways, nothing cut off.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          size.width,
        )
        const confirmBox = (await confirm.boundingBox())!
        expect(confirmBox.x).toBeGreaterThanOrEqual(0)
        expect(confirmBox.x + confirmBox.width).toBeLessThanOrEqual(size.width)
        const axe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withRules(['color-contrast', 'button-name', 'aria-allowed-role'])
          .analyze()
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
      })
    }
  })
}
