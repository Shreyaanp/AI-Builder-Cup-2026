import { expect, test, type Page } from '@playwright/test'

// OB-56 (#377): a guest from before separate sign-in (#335) keeps their account. Runs the real
// Firebase SDK in the browser, with real IndexedDB persistence; only Google's servers are faked.
declare global {
  interface Window {
    restoreCase: (options: { newerGuest: boolean; merge: boolean }) => Promise<{
      before: string
      after: string | undefined
      anonymous: boolean | undefined
      merged: string[]
      oldKeptInBrowser: boolean
    }>
  }
}

const token = (uid: string) => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${part({ alg: 'none' })}.${part({ sub: uid, user_id: uid, exp, iat: exp - 3600 })}.x`
}

async function fakeGoogle(page: Page) {
  let signUps = 0
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  await page.route(/googleapis\.com/, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.url().includes('accounts:signUp')) {
      const localId = `guest-${++signUps}`
      return route.fulfill({
        headers,
        json: { localId, idToken: token(localId), refreshToken: 'r', expiresIn: '3600' },
      })
    }
    const sent = JSON.parse(request.postData() ?? '{}') as { idToken?: string }
    const localId = JSON.parse(
      Buffer.from((sent.idToken ?? '..').split('.')[1] ?? '', 'base64url').toString() || '{}',
    ).sub as string
    return route.fulfill({ headers, json: { users: [{ localId, lastLoginAt: '1' }] } })
  })
  return () => signUps
}

async function loadHarness(page: Page) {
  await page.goto('/api/v1/health')
  await page.evaluate(async () => {
    // The dev server's own rewritten addresses for the app's real firebase imports.
    const source = await (await fetch('/src/features/customer/account.tsx')).text()
    const find = (name: string) => {
      const found = new RegExp(`/[^"'\\s]*${name}\\.js[^"'\\s]*`).exec(source)
      if (!found) throw new Error(`No ${name} import in the served module`)
      return found[0]
    }
    const load = (path: string) => import(/* @vite-ignore */ path)
    const [appSdk, authSdk, restore] = await Promise.all([
      load(find('firebase_app')),
      load(find('firebase_auth')),
      load('/src/auth/legacyGuest.ts'),
    ])
    const config = { apiKey: 'test-key', appId: '1:1:web:1', projectId: 'p', authDomain: 'x' }
    let run = 0
    window.restoreCase = async ({ newerGuest, merge }) => {
      run += 1
      const project = { ...config, projectId: `p${run}` }
      const legacyName = restore.legacyAppName(project.projectId)
      const legacy = appSdk.initializeApp(project, legacyName)
      const before = (await authSdk.signInAnonymously(authSdk.getAuth(legacy))).user.uid as string
      await appSdk.deleteApp(legacy)
      const app = appSdk.initializeApp(project, `ogoogle-customer-${project.projectId}`)
      const auth = authSdk.getAuth(app)
      if (newerGuest) await authSdk.signInAnonymously(auth)
      const merged: string[] = []
      await restore.restoreLegacyGuest({
        appSdk,
        authSdk,
        auth,
        config: project,
        merge: merge ? async (value: string) => merged.push(value) : undefined,
      })
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb')
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      const keys = await new Promise<IDBValidKey[]>((resolve) => {
        const all = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage')
        const request = all.getAllKeys()
        request.onsuccess = () => resolve(request.result)
      })
      db.close()
      return {
        before,
        after: auth.currentUser?.uid,
        anonymous: auth.currentUser?.isAnonymous,
        merged,
        oldKeptInBrowser: keys.some((key) => String(key).includes(legacyName)),
      }
    }
  })
}

test.skip(({ isMobile }) => !isMobile, 'One browser is enough')

test('OB-56 a returning guest gets their old account back, with no new guest made', async ({
  page,
}) => {
  const signUps = await fakeGoogle(page)
  await loadHarness(page)
  const result = await page.evaluate(() => window.restoreCase({ newerGuest: false, merge: false }))
  expect(result.after).toBe(result.before)
  expect(result.anonymous).toBe(true)
  // Signing the old name out is what stops it coming back after this guest signs out.
  expect(result.oldKeptInBrowser).toBe(false)
  expect(signUps()).toBe(1)
})

test('OB-56 with the merge off, a phone with two guests keeps both untouched', async ({ page }) => {
  await fakeGoogle(page)
  await loadHarness(page)
  const result = await page.evaluate(() => window.restoreCase({ newerGuest: true, merge: false }))
  expect(result.after).not.toBe(result.before)
  expect(result.merged).toEqual([])
  expect(result.oldKeptInBrowser).toBe(true)
})

test('OB-56 with the merge on, the old guest is proved once and then let go', async ({ page }) => {
  await fakeGoogle(page)
  await loadHarness(page)
  const result = await page.evaluate(() => window.restoreCase({ newerGuest: true, merge: true }))
  expect(result.merged).toHaveLength(1)
  expect(result.after).not.toBe(result.before)
  expect(result.oldKeptInBrowser).toBe(false)
})
