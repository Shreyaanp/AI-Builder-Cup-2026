import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { localOnly } from './stories/support.js'

const endpoint = 'https://fcm.googleapis.com/fcm/send/fixture-only'
const sid = createHash('sha256').update(endpoint).digest('hex')

async function reminderCopy(page: Page, locale: 'en' | 'hi') {
  return page.evaluate(async (locale) => {
    const path = locale === 'hi' ? '/src/features/v1/locales/hi.ts' : '/src/features/v1/strings.ts'
    const source = await import(path)
    const t = locale === 'hi' ? source.hi : source.en
    return {
      remindMe: String(t.remindMe),
      reminderTiming: String(t.reminderTiming),
      reminderDenied: String(t.reminderDenied),
      reminderFailed: String(t.reminderFailed),
      reminderOff: String(t.reminderOff),
      retry: String(t.retry),
    }
  }, locale)
}

async function setup(page: Page, permission: 'granted' | 'denied' = 'granted') {
  await localOnly(page)
  await page.addInitScript(
    ({ endpoint, permission }) => {
      let subscription: object | null = null
      const item = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: 'fixture', auth: 'fixture' } }),
        unsubscribe: async () => {
          subscription = null
          return true
        },
      }
      const registration = {
        pushManager: {
          getSubscription: async () => subscription,
          subscribe: async () => {
            subscription = item
            return item
          },
        },
      }
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          getRegistration: async () => registration,
          register: async () => registration,
          ready: Promise.resolve(registration),
        },
      })
      Notification.requestPermission = async () => {
        const root = document.documentElement
        root.dataset.permissionRequests = String(Number(root.dataset.permissionRequests || 0) + 1)
        return permission
      }
    },
    { endpoint, permission },
  )
  const saved: string[] = []
  let writes = 0
  let fail = false
  let enabled = true
  await page.route('**/api/v1/reminders**', async (route) => {
    const method = route.request().method()
    if (method === 'GET')
      return route.fulfill({ json: { enabled, public_key: 'AQ', subscriptions: saved } })
    if (fail) return route.fulfill({ status: 503, json: { detail: 'fixture failure' } })
    if (method === 'PUT') {
      writes++
      saved.push(sid)
    } else if (method === 'DELETE') saved.splice(0)
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto('/?app=business')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  const businesses = (await (await page.request.get('/api/v1/businesses')).json()) as unknown[]
  if (businesses.length === 0) {
    const proposalResponse = await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: {
          name: 'Reminder test shop',
          category: 'Tea stall',
          location: 'Bengaluru',
          lat: 12.9719,
          lng: 77.6412,
          phone: '+910000000000',
          hours: '09:00–18:00',
          timezone: 'Asia/Kolkata',
        },
      },
    })
    expect(proposalResponse.ok()).toBe(true)
    const proposal = await proposalResponse.json()
    expect(
      (
        await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
          data: { digest: proposal.digest },
        })
      ).ok(),
    ).toBe(true)
  }
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'You', exact: true }).click()
  return {
    saved,
    writes: () => writes,
    fail: (value: boolean) => {
      fail = value
    },
    enabled: (value: boolean) => {
      enabled = value
    },
  }
}

test.describe('owner reminders on a phone', () => {
  test.beforeEach(async ({ page }, info) => {
    test.setTimeout(90_000)
    test.skip(info.project.name !== 'phone', 'Phone flow spec')
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  for (const width of [360, 390, 412])
    for (const theme of ['light', 'dark'])
      for (const locale of ['en', 'hi'] as const) {
        test(`${width} ${theme} ${locale}: opt in only on tap, restore, unsubscribe`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 844 })
          const state = await setup(page)
          await page
            .getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
            .click()
          if (locale === 'hi') {
            await page.getByRole('combobox', { name: 'Language', exact: true }).click()
            await page.getByRole('option', { name: 'हिन्दी', exact: true }).click()
          }
          const t = await reminderCopy(page, locale)
          const toggle = page.getByRole('switch', { name: t.remindMe, exact: true })
          await expect(toggle).toBeEnabled()
          await expect(toggle).not.toBeChecked()
          expect(await page.locator('html').getAttribute('data-permission-requests')).toBeNull()
          expect(state.writes()).toBe(0)
          await toggle.click()
          await expect(toggle).toBeChecked()
          expect(await page.locator('html').getAttribute('data-permission-requests')).toBe('1')
          expect(state.writes()).toBe(1)
          await expect(page.locator('#reminder-status')).toContainText(t.reminderTiming)
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true)
          expect(
            (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
              .violations,
          ).toEqual([])
          await page.screenshot({
            path: `output/playwright/reminders-${width}-${theme}-${locale}.png`,
            fullPage: true,
          })
          await toggle.click()
          await expect(toggle).not.toBeChecked()
          expect(state.saved).toEqual([])
          expect(await page.locator('html').getAttribute('data-permission-requests')).toBe('1')
        })
      }

  test('denied permission has recovery and no subscription write', async ({ page }) => {
    const state = await setup(page, 'denied')
    const en = await reminderCopy(page, 'en')
    const toggle = page.getByRole('switch', { name: en.remindMe })
    await toggle.click()
    await expect(page.locator('#reminder-status')).toHaveText(en.reminderDenied)
    await expect(toggle).not.toBeChecked()
    expect(state.writes()).toBe(0)
    await expect(page.getByRole('button', { name: en.retry, exact: true })).toBeVisible()
  })

  test('failed save rolls back, retry works, disabled backend never asks', async ({ page }) => {
    const state = await setup(page)
    const en = await reminderCopy(page, 'en')
    const toggle = page.getByRole('switch', { name: en.remindMe })
    state.fail(true)
    await toggle.click()
    await expect(page.locator('#reminder-status')).toHaveText(en.reminderFailed)
    await expect(toggle).not.toBeChecked()
    state.fail(false)
    await toggle.click()
    await expect(toggle).toBeChecked()
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    state.enabled(false)
    // Tabs keep their state, so a fresh load is what re-reads the backend setting.
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByRole('button', { name: 'You', exact: true }).click()
    await expect(page.locator('#reminder-status')).toHaveText(en.reminderOff)
    await expect(toggle).toBeDisabled()
  })
})

test('worker shows push and focuses an owner window without following payload URLs', async () => {
  const listeners: Record<string, (event: object) => void> = {}
  const notifications: unknown[] = []
  const opened: string[] = []
  let focused = false
  let closed = false
  let pending = Promise.resolve()
  const self = {
    location: { pathname: '/sw.js', origin: 'https://app.example.invalid' },
    addEventListener: (kind: string, callback: (event: object) => void) => {
      listeners[kind] = callback
    },
    registration: {
      showNotification: async (...args: unknown[]) => {
        notifications.push(args)
      },
    },
    clients: {
      matchAll: async () => [
        {
          url: 'https://app.example.invalid/?app=business',
          focus: async () => {
            focused = true
          },
        },
      ],
      openWindow: async (url: string) => {
        opened.push(url)
      },
    },
  }
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL })
  const waitUntil = (promise: Promise<void>) => {
    pending = promise
  }
  listeners.push({
    data: {
      json: () => ({ kind: 'morning', title: '2 things need you', url: 'https://evil.invalid' }),
    },
    waitUntil,
  })
  await pending
  expect(notifications).toHaveLength(1)
  listeners.notificationclick({
    notification: {
      close: () => {
        closed = true
      },
    },
    waitUntil,
  })
  await pending
  expect(focused && closed).toBe(true)
  expect(opened).toEqual([])
  listeners.push({
    data: {
      json: () => {
        throw new Error('bad payload')
      },
    },
    waitUntil,
  })
  expect(notifications).toHaveLength(1)
})
