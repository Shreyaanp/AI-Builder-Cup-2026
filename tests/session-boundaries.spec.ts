import { expect, test, type BrowserContext, type Page } from '@playwright/test'

async function fixture(context: BrowserContext) {
  await context.addInitScript(() => {
    for (const side of ['owner', 'customer']) {
      localStorage.setItem(`chalkboard.${side}.language.chosen`, '1')
      if (!localStorage.getItem(`chalkboard.${side}.preferences`))
        localStorage.setItem(
          `chalkboard.${side}.preferences`,
          JSON.stringify({ language: 'en', appearance: 'light' }),
        )
    }
  })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname.endsWith('/bootstrap'))
      return route.fulfill({
        json: {
          auth_mode: 'firebase',
          firebase: {
            apiKey: 'fixture',
            appId: 'fixture',
            projectId: 'demo-boundaries',
            authDomain: 'localhost',
          },
          features: { guest_customer: false },
        },
      })
    if (url.pathname === '/api/v1/customer/me') {
      const signedIn = Boolean(route.request().headers().authorization)
      return route.fulfill({
        json: {
          signed_in: signedIn,
          name: 'Neighbour',
          profile: signedIn
            ? {
                follows: [],
                searches: [],
                preferences: { vegetarian: false, halal: false, budget: null, language: '' },
              }
            : null,
        },
      })
    }
    if (url.pathname === '/api/v1/me')
      return route.fulfill({ json: { consent_current: true, name: 'Owner' } })
    if (url.pathname === '/api/v1/me/data')
      return route.fulfill({ json: { status: 'erased', pending: [] } })
    if (url.pathname.endsWith('/businesses') || url.pathname.endsWith('/threads'))
      return route.fulfill({ json: [] })
    return route.fulfill({ status: 503, json: { detail: 'Offline fixture' } })
  })
  await context.route('**/node_modules/.vite*/deps/firebase_app.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
      export const getApps = () => [];
      export const initializeApp = (config, name) => ({ name });
    `,
    }),
  )
  await context.route('**/node_modules/.vite*/deps/firebase_auth.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
      const user = name => ({ uid: name, displayName: 'Fixture', getIdToken: async () => name });
      export const getAuth = app => ({ app, currentUser: localStorage.getItem('fixture:' + app.name) ? user(app.name) : null });
      export const onIdTokenChanged = (auth, callback) => { auth.callback = callback; callback(auth.currentUser); return () => {}; };
      export class GoogleAuthProvider {}
      export const signInWithPopup = async auth => {
        localStorage.setItem('fixture:' + auth.app.name, '1');
        auth.currentUser = user(auth.app.name); auth.callback(auth.currentUser);
      };
      export const signInAnonymously = async () => {};
      export const signOut = async auth => {
        document.cookie = 'fixtureSignedOut=' + auth.app.name + '; Path=/';
        localStorage.removeItem('fixture:' + auth.app.name);
        auth.currentUser = null; auth.callback(null);
      };
    `,
    }),
  )
}

async function customerProfile(page: Page) {
  await page.getByRole('button', { name: 'Profile and preferences' }).click()
}

test('390px: signing in on either side never restores the other side identity or history', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000)
  await fixture(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page.getByRole('button', { name: 'You', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    history.replaceState({ ...history.state, key: 'same-entry-fixture' }, '')
    const path = '/src/app/history.ts'
    const { writeEntry } = await import(/* @vite-ignore */ path)
    writeEntry('private', 'owner draft')
    localStorage.setItem('chalkboard.owner.private', 'owner cache')
  })
  await page.goto('/explore/')
  expect(
    await page.evaluate(async () => {
      history.replaceState({ ...history.state, key: 'same-entry-fixture' }, '')
      const path = '/src/app/history.ts'
      const { readEntry, writeEntry } = await import(/* @vite-ignore */ path)
      const before = readEntry('private')
      writeEntry('private', 'customer draft')
      return before
    }),
  ).toBeNull()
  await customerProfile(page)
  await expect(
    page.getByRole('button', { name: 'Continue with Google', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load demo story' })).toHaveCount(0)
  for (const appearance of ['light', 'dark']) {
    await page.evaluate(
      (appearance) =>
        localStorage.setItem(
          'chalkboard.customer.preferences',
          JSON.stringify({ language: 'en', appearance }),
        ),
      appearance,
    )
    await page.reload()
    await customerProfile(page)
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `output/playwright/customer-profile-${appearance}-${width}.png`,
        animations: 'disabled',
      })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('fixture:'))
        .sort(),
    ),
  ).toEqual(['fixture:ogoogle-customer-demo-boundaries', 'fixture:ogoogle-owner-demo-boundaries'])
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/explore\/$/)
  await customerProfile(page)
  await expect(
    page.getByRole('button', { name: 'Continue with Google', exact: true }),
  ).toBeVisible()
  await page.goto('/')
  // Sign-out in the customer app must preserve the owner's cached identity as well.
  await expect(page.getByRole('button', { name: 'You', exact: true })).toBeVisible()
  expect(
    await page.evaluate(async () => {
      history.replaceState({ ...history.state, key: 'same-entry-fixture' }, '')
      const path = '/src/app/history.ts'
      const { readEntry } = await import(/* @vite-ignore */ path)
      return readEntry('private')
    }),
  ).toBe('owner draft')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('chalkboard.owner.preferences')!).appearance,
    ),
  ).toBe('light')
  expect(await page.evaluate(() => localStorage.getItem('chalkboard.owner.private'))).toBe(
    'owner cache',
  )
})

for (const [side, action] of [
  ['owner', 'sign-out'],
  ['owner', 'delete'],
  ['customer', 'sign-out'],
] as const) {
  test(`${side} ${action}: Firebase signs out, browser data is removed, and front door stays signed out`, async ({
    context,
    page,
  }) => {
    await fixture(context)
    await page.goto(side === 'owner' ? '/' : '/explore/')
    if (side === 'customer') await customerProfile(page)
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
    if (side === 'owner') await page.getByRole('button', { name: 'You', exact: true }).click()
    await page.evaluate(async (side) => {
      localStorage.setItem('private-local', 'private')
      sessionStorage.setItem('private-session', 'private')
      localStorage.setItem('chalkboard.business.installDismissed', '1')
      sessionStorage.setItem('chalkboard.closeday.fixture', '2026-10-18')
      localStorage.setItem(`chalkboard.${side === 'owner' ? 'customer' : 'owner'}.private`, 'keep')
      await caches.open('chalkboard-business-private')
      await caches.open('chalkboard-customer-private')
      for (const name of ['private-db', 'firebaseLocalStorageDb'])
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(name, 1)
          request.onupgradeneeded = () => request.result.createObjectStore('data')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction('data', 'readwrite')
            transaction.objectStore('data').put('private', 'record')
            transaction.oncomplete = () => {
              db.close()
              resolve()
            }
          }
        })
      const calls: string[] = []
      Object.assign(window, { cleanupCalls: calls })
      Object.defineProperty(navigator.serviceWorker, 'getRegistrations', {
        value: async () => [
          {
            scope: location.origin + (side === 'owner' ? '/' : '/explore/'),
            pushManager: {
              getSubscription: async () => ({
                unsubscribe: async () => {
                  calls.push('push')
                  document.cookie = 'fixturePush=1; Path=/'
                  return true
                },
              }),
            },
            unregister: async () => {
              calls.push('worker')
              document.cookie = 'fixtureWorker=1; Path=/'
              return true
            },
          },
          {
            scope: location.origin + (side === 'owner' ? '/explore/' : '/'),
            pushManager: {
              getSubscription: async () => {
                throw Error('Other side touched')
              },
            },
          },
        ],
      })
    }, side)
    if (action === 'delete') {
      await page.getByRole('button', { name: /^Privacy & your data/ }).click()
      await page.getByRole('button', { name: 'Delete all my data' }).click()
      await page.getByRole('button', { name: 'Delete permanently' }).click()
    } else await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(side === 'owner' ? /\/\?app=business$/ : /\/explore\/$/)
    // The front door says what happened in one line.
    const farewell =
      action === 'delete' ? 'Account deleted. You are signed out.' : 'You are signed out.'
    await expect(page.getByRole('status').filter({ hasText: farewell })).toBeVisible()
    // Captain UX gate (#335): the note sat over the docked Ask box; it now stays in the top part.
    const note = await page.getByRole('status').filter({ hasText: farewell }).boundingBox()
    expect(note!.y + note!.height).toBeLessThan(page.viewportSize()!.height / 3)
    if (side === 'customer') await customerProfile(page)
    await expect(
      page.getByRole('button', { name: 'Continue with Google', exact: true }),
    ).toBeVisible()
    const cookies = await context.cookies()
    expect(cookies.find((cookie) => cookie.name === 'fixturePush')?.value).toBe('1')
    expect(cookies.find((cookie) => cookie.name === 'fixtureWorker')?.value).toBe('1')
    expect(
      await context
        .cookies()
        .then((cookies) => cookies.find((cookie) => cookie.name === 'fixtureSignedOut')?.value),
    ).toBe(`ogoogle-${side}-demo-boundaries`)
    expect(
      await page.evaluate(
        async (side) => ({
          local: localStorage.getItem('private-local'),
          session: sessionStorage.getItem('private-session'),
          businessInstall: localStorage.getItem('chalkboard.business.installDismissed'),
          ownerDay: sessionStorage.getItem('chalkboard.closeday.fixture'),
          other: localStorage.getItem(
            `chalkboard.${side === 'owner' ? 'customer' : 'owner'}.private`,
          ),
          databases: (await indexedDB.databases()).map((db) => db.name),
          // Firebase's database stays (another tab may hold it open); its records are gone.
          firebaseRecords: await new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('firebaseLocalStorageDb')
            open.onerror = () => reject(open.error)
            open.onsuccess = () => {
              const count = open.result.transaction('data').objectStore('data').count()
              count.onsuccess = () => {
                open.result.close()
                resolve(count.result)
              }
            }
          }),
          caches: await caches.keys(),
        }),
        side,
      ),
    ).toEqual({
      local: null,
      session: null,
      businessInstall: side === 'owner' ? null : '1',
      ownerDay: side === 'owner' ? null : '2026-10-18',
      other: 'keep',
      databases: ['firebaseLocalStorageDb'],
      firebaseRecords: 0,
      caches: [side === 'owner' ? 'chalkboard-customer-private' : 'chalkboard-business-private'],
    })
    await page.reload()
    if (side === 'customer') await customerProfile(page)
    await expect(
      page.getByRole('button', { name: 'Continue with Google', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your shop, at a glance' })).toHaveCount(0)
    // Shown once: a reload does not repeat it.
    await expect(page.getByText(farewell, { exact: true })).toHaveCount(0)
  })
}

test('390px: customer sign-in leaves the business front door signed out', async ({
  context,
  page,
}) => {
  await fixture(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/explore/')
  await customerProfile(page)
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Continue with Google', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'You', exact: true })).toHaveCount(0)
})

for (const finish of ['Skip', 'Start']) {
  test(`390px: customer ${finish} persists across a cleared account cache and a new tab`, async ({
    context,
    page,
  }) => {
    await fixture(context)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore/')
    await page.evaluate(() => {
      localStorage.removeItem('chalkboard.explainer.customer.v1')
      document.cookie = 'chalkboard.explainer.customer.v1=; Path=/; Max-Age=0'
    })
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Find local shops near you', exact: true }),
    ).toBeVisible()
    if (finish === 'Start') {
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    }
    await page.getByRole('button', { name: finish, exact: true }).click()
    await expect(page.getByRole('button', { name: 'Profile and preferences' })).toBeVisible()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    const second = await context.newPage()
    await second.setViewportSize({ width: 390, height: 844 })
    await second.goto('/explore/')
    await expect(second.getByRole('button', { name: 'Profile and preferences' })).toBeVisible()
    await expect(
      second.getByRole('heading', { name: 'Find local shops near you', exact: true }),
    ).toHaveCount(0)
    await customerProfile(second)
    await second
      .getByRole('region', { name: 'Help', exact: true })
      .getByRole('button', { name: 'See again' })
      .click()
    await expect(
      second.getByRole('heading', { name: 'Find local shops near you', exact: true }),
    ).toBeVisible()
    await second.close()
  })
}

for (const side of ['owner', 'customer'] as const) {
  test(`${side} cleanup removes only its Firebase IndexedDB records on a shared origin`, async ({
    context,
    page,
  }) => {
    await fixture(context)
    await page.goto('/explore/')
    await expect(page.getByRole('button', { name: 'Profile and preferences' })).toBeVisible()
    const remaining = await page.evaluate(async (side) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('firebaseLocalStorageDb', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('firebaseLocalStorage')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('firebaseLocalStorage', 'readwrite')
        const store = transaction.objectStore('firebaseLocalStorage')
        for (const app of ['owner', 'customer', 'web'])
          store.put(
            { uid: `fixture-${app}` },
            `firebase:authUser:fixture:ogoogle-${app}-demo-boundaries`,
          )
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
      })
      const path = '/src/auth/clearSession.ts'
      const { clearSession } = await import(/* @vite-ignore */ path)
      await clearSession(side)
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = db
          .transaction('firebaseLocalStorage')
          .objectStore('firebaseLocalStorage')
          .getAllKeys()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      db.close()
      return keys
    }, side)
    expect(remaining).toEqual([
      `firebase:authUser:fixture:ogoogle-${side === 'owner' ? 'customer' : 'owner'}-demo-boundaries`,
    ])
  })
}

test('sign-out while another tab holds Firebase databases open never leaves a queued delete behind', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000)
  await fixture(context)
  const names = [
    'firebaseLocalStorageDb',
    'firebase-heartbeat-database',
    'firebase-installations-database',
  ]
  const other = await context.newPage()
  await other.goto('/explore/')
  // Like Firebase, this tab keeps its connections open and has no versionchange handler.
  await other.evaluate(async (names) => {
    const held: IDBDatabase[] = []
    for (const name of names)
      held.push(
        await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name, 1)
          request.onupgradeneeded = () => request.result.createObjectStore('data')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        }),
      )
    Object.assign(window, { held })
  }, names)
  await page.goto('/explore/')
  await customerProfile(page)
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'You are signed out.' })).toBeVisible()
  // A queued deleteDatabase would hold every later open, which is what keeps the app on its splash.
  const opened = await page.evaluate(
    (names) =>
      Promise.all(
        names.map(
          (name) =>
            new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => resolve(false), 5000)
              const request = indexedDB.open(name)
              request.onsuccess = () => {
                clearTimeout(timer)
                request.result.close()
                resolve(true)
              }
              request.onerror = () => resolve(false)
            }),
        ),
      ),
    names,
  )
  expect(opened).toEqual([true, true, true])
  await customerProfile(page)
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
})

for (const side of ['owner', 'customer'] as const) {
  test(`${side} sign-out still reaches the front door when cleanup steps throw`, async ({
    context,
    page,
  }) => {
    await fixture(context)
    await page.goto(side === 'owner' ? '/' : '/explore/')
    if (side === 'customer') await customerProfile(page)
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
    if (side === 'owner') await page.getByRole('button', { name: 'You', exact: true }).click()
    await page.evaluate(() => {
      Object.defineProperty(indexedDB, 'databases', {
        value: () => {
          throw new Error('databases missing')
        },
      })
      Object.defineProperty(caches, 'keys', { value: () => Promise.reject(new Error('cache')) })
      Object.defineProperty(navigator.serviceWorker, 'getRegistrations', {
        value: async () => [
          {
            scope: location.origin + (location.pathname.startsWith('/explore') ? '/explore/' : '/'),
            pushManager: {
              getSubscription: async () => ({ unsubscribe: async () => false }),
            },
            unregister: async () => true,
          },
        ],
      })
    })
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(side === 'owner' ? /\/\?app=business$/ : /\/explore\/$/)
    await expect(page.getByRole('status').filter({ hasText: 'You are signed out.' })).toBeVisible()
    if (side === 'customer') await customerProfile(page)
    await expect(
      page.getByRole('button', { name: 'Continue with Google', exact: true }),
    ).toBeVisible()
  })
}
