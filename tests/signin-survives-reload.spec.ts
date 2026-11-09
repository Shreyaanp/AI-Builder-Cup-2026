import { expect, test, type Page } from '@playwright/test'

// OB-352 (Priya, 8 Nov: "Every reload / app switch signs her out"). Local preview has no account:
// its "Continue local preview" gate is one React state, so a reload shows it again. The hosted app
// signs in with Firebase, whose saved user must bring the owner straight back. This drives that
// path: the same saved record Firebase writes after Google sign-in, with Google's servers stubbed.

const FIREBASE = {
  apiKey: 'fixture-browser-key',
  appId: '1:123:web:fixture',
  projectId: 'demo-ogoogle-local',
  authDomain: 'demo-ogoogle-local.firebaseapp.com',
}
const APP = `ogoogle-owner-${FIREBASE.projectId}`
const KEY = `firebase:authUser:${FIREBASE.apiKey}:${APP}`

async function hosted(page: Page, lookup: () => object | null) {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({ json: { auth_mode: 'firebase', firebase: FIREBASE } }),
  )
  await page.route('https://identitytoolkit.googleapis.com/**', (route) => {
    const body = lookup()
    return body
      ? route.fulfill({ json: body })
      : route.fulfill({
          status: 400,
          json: { error: { message: 'TOKEN_EXPIRED', code: 400 } },
        })
  })
  await page.route('https://securetoken.googleapis.com/**', (route) =>
    route.fulfill({
      json: {
        access_token: 'fixture.token.value',
        id_token: 'fixture.token.value',
        refresh_token: 'fixture-refresh',
        expires_in: '3600',
        user_id: 'owner-1',
      },
    }),
  )
}

/** The record Firebase keeps after a real Google sign-in. */
async function signedIn(page: Page) {
  const saved = {
    uid: 'owner-1',
    email: 'owner@example.test',
    emailVerified: true,
    displayName: 'Priya Rao',
    isAnonymous: false,
    providerData: [],
    stsTokenManager: {
      refreshToken: 'fixture-refresh',
      accessToken: 'fixture.token.value',
      expirationTime: Date.now() + 3_600_000,
    },
    createdAt: '1700000000000',
    lastLoginAt: '1700000000000',
    apiKey: FIREBASE.apiKey,
    appName: APP,
  }
  await page.evaluate(
    async ({ key, value }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb', 1)
        open.onupgradeneeded = () =>
          open.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' })
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const write = open.result.transaction('firebaseLocalStorage', 'readwrite')
          write.objectStore('firebaseLocalStorage').put({ fbase_key: key, value })
          write.oncomplete = () => {
            open.result.close()
            resolve()
          }
          write.onerror = () => reject(write.error)
        }
      })
    },
    { key: KEY, value: saved },
  )
}

const LOOKUP = {
  users: [{ localId: 'owner-1', email: 'owner@example.test', displayName: 'Priya Rao' }],
}
const signInButton = (page: Page) =>
  page.getByRole('button', { name: /Continue with Google|Sign in with Google/ })

test('OB-352: a signed-in owner stays signed in across reload and app switch', async ({ page }) => {
  test.setTimeout(60_000)
  await hosted(page, () => LOOKUP)
  await page.goto('/')
  await expect(signInButton(page).first()).toBeVisible()
  await signedIn(page)

  await page.reload()
  await expect(signInButton(page)).toHaveCount(0, { timeout: 20_000 })

  // Reload again, then leave for another app and come back.
  await page.reload()
  await expect(signInButton(page)).toHaveCount(0, { timeout: 20_000 })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pageshow'))
    window.dispatchEvent(new Event('focus'))
  })
  await page.waitForTimeout(1000)
  await expect(signInButton(page)).toHaveCount(0)
})

test('OB-352: a session Google really ended does ask to sign in again', async ({ page }) => {
  test.setTimeout(60_000)
  await hosted(page, () => null)
  await page.goto('/')
  await expect(signInButton(page).first()).toBeVisible()
  await signedIn(page)
  await page.reload()
  await expect(signInButton(page).first()).toBeVisible({ timeout: 20_000 })
})
