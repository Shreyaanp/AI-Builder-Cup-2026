import { expect, test, type Page } from '@playwright/test'

// Real-phone regressions: compact layout, keyboard viewport and touch only.
test.skip(({ isMobile }) => !isMobile, 'phone-only regressions')

async function enter(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

async function saveShop(page: Page) {
  await page.getByRole('button', { name: 'Add my shop' }).tap()
  await page.getByLabel('Shop name').fill('Katong Kopi')
  await page.getByLabel('Address or area').fill('Katong, Singapore')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Katong Kopi' })).toBeVisible()
}

async function reply(page: Page) {
  await page.route('**/api/v1/coach/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: [
        { kind: 'ready', mode: 'offline', session_id: 'phone-fixture' },
        { kind: 'reply', text: 'Let’s review your opening hours.' },
        { kind: 'turn_complete' },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(''),
    }),
  )
  await page.getByLabel('Message', { exact: true }).fill('Help with opening hours')
  await page.getByRole('button', { name: 'Send', exact: true }).tap()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
}

test('PHONE-1: sent message and reply are above the composer, including a compact keyboard viewport', async ({
  page,
}) => {
  await enter(page)
  await reply(page)
  const log = page.getByRole('log')
  await expect(log).toContainText('Help with opening hours')
  await expect(log).toContainText('Let’s review your opening hours.')
  for (const height of [839, 480]) {
    await page.setViewportSize({ width: 393, height })
    await page.getByLabel('Message', { exact: true }).focus()
    await expect
      .poll(async () =>
        log.evaluate((node) => {
          const composer = document.querySelector('#coach form')!
          const bubbles = Array.from(node.children).map((bubble) => bubble.getBoundingClientRect())
          return bubbles.every(
            (box) => box.top >= 64 && box.bottom <= composer.getBoundingClientRect().top,
          )
        }),
      )
      .toBe(true)
  }
})

test('PHONE-1-history: refreshing history cannot erase a completed conversation', async ({
  page,
}) => {
  await enter(page)
  let historyReads = 0
  await page.route('**/api/v1/conversations', (route) => {
    historyReads += 1
    return historyReads > 1 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: [] })
  })
  // Start with a successful read; the post-turn refresh fails.
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await page.getByRole('button', { name: 'Coach', exact: true }).tap()
  historyReads = 1
  await reply(page)
  await expect(page.getByRole('log')).toContainText('Let’s review your opening hours.')
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
})

test('PHONE-1-scroll: the end of a long reply clears the sticky composer', async ({ page }) => {
  await enter(page)
  await page.route('**/api/v1/coach/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body:
        `data: ${JSON.stringify({ kind: 'reply', text: 'Review opening hours with your team.\n'.repeat(18) + 'End of coach reply.' })}\n\n` +
        'data: {"kind":"turn_complete"}\n\n',
    }),
  )
  await page.getByLabel('Message', { exact: true }).fill('A longer conversation')
  await page.getByRole('button', { name: 'Send', exact: true }).tap()
  await expect(page.getByRole('log')).toContainText('End of coach reply.')
  await expect
    .poll(() =>
      page
        .getByRole('log')
        .evaluate(
          (log) =>
            log.lastElementChild!.getBoundingClientRect().bottom <=
            document.querySelector('#coach form')!.getBoundingClientRect().top,
        ),
    )
    .toBe(true)
})

test('PHONE-1-offline: the real Python coach shows both sides and survives navigation', async ({
  page,
}) => {
  await enter(page)
  await page.getByLabel('Message', { exact: true }).fill('Hello')
  await page.getByRole('button', { name: 'Send', exact: true }).tap()
  const log = page.getByRole('log')
  await expect(log.locator('li')).toHaveCount(2)
  await expect(log).toContainText('You: Hello')
  await expect(log.locator('li').last()).toContainText('Coach:')
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await page.getByRole('button', { name: 'Coach', exact: true }).tap()
  await expect(log.locator('li')).toHaveCount(2)
  await expect(log).toContainText('You: Hello')
})

test('PHONE-1-firebase: same-account identity refresh preserves an in-flight reply and session', async ({
  page,
}) => {
  await enter(page)
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'firebase',
        firebase: {
          apiKey: 'fixture',
          appId: 'fixture',
          projectId: 'demo-phone',
          authDomain: 'localhost',
        },
      },
    }),
  )
  await page.route('**/node_modules/.vite/deps/firebase_app.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
    export const getApps = () => [];
    export const initializeApp = () => ({});
  `,
    }),
  )
  await page.route('**/node_modules/.vite/deps/firebase_auth.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
    const user = { uid: 'offline-phone-owner', getIdToken: async () => null };
    export const getAuth = () => ({ currentUser: user });
    export const onIdTokenChanged = (auth, callback) => {
      callback(user);
      const refresh = () => callback(user);
      window.addEventListener('fixture-identity-refresh', refresh);
      return () => window.removeEventListener('fixture-identity-refresh', refresh);
    };
    export class GoogleAuthProvider {}
    export const signInWithPopup = async () => {};
    export const signOut = async () => {};
  `,
    }),
  )
  await page.reload()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = () => {}
  const started = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route('**/api/v1/coach/stream', async (route) => {
    requested()
    await gate
    await route
      .fulfill({
        contentType: 'text/event-stream',
        body:
          'data: {"kind":"ready","session_id":"firebase-phone-fixture","mode":"offline"}\n\n' +
          'data: {"kind":"reply","text":"Your conversation continues."}\n\n' +
          'data: {"kind":"turn_complete"}\n\n',
      })
      .catch(() => undefined)
  })
  try {
    await page.getByLabel('Message', { exact: true }).fill('Keep this conversation')
    await page.getByRole('button', { name: 'Send', exact: true }).tap()
    await started
    await page.evaluate(() => window.dispatchEvent(new Event('fixture-identity-refresh')))
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  } finally {
    release()
  }
  await expect(page.getByRole('log')).toContainText('Your conversation continues.')
  await expect(page.getByRole('log')).toContainText('Keep this conversation')
})

test('PHONE-2: every shop and product Add entry opens its form; coach plus opens actions', async ({
  page,
}) => {
  await enter(page)
  await page.getByRole('button', { name: 'New conversation', exact: true }).tap()
  const actions = page.getByRole('dialog', { name: 'New conversation', exact: true })
  await expect(actions).toBeVisible()
  await actions.getByRole('button', { name: 'Add shop details', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add shop details' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await page.getByRole('button', { name: 'Add shop details', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add shop details' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: 'Google', exact: true }).tap()
  await page.getByRole('button', { name: 'Add shop details', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add shop details' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: 'Coach', exact: true }).tap()
  await saveShop(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  // My shop tiles: Add product lives in the Menu sheet.
  await page.getByRole('button', { name: /^Menu/ }).tap()
  await page.getByRole('button', { name: 'Add product', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: /Choose shop/ }).tap()
  await page.getByRole('menuitem', { name: 'New shop', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add shop details' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: 'Coach', exact: true }).tap()
  await page.getByRole('button', { name: 'New conversation', exact: true }).tap()
  await expect(actions).toBeVisible()
  await actions.getByRole('button', { name: 'Add product', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible()
  await page.getByLabel('Product name').fill('Kopi')
  await page.getByLabel(/^Price/).fill('1.80')
  await page.getByRole('button', { name: 'Review', exact: true }).tap()
  await page.getByRole('button', { name: 'Confirm and save' }).tap()
  // The shop card's next step (UI-1 folded the old "Add now" card into it).
  await page.getByRole('button', { name: 'Add your opening hours', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Edit details' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  // Phones choose camera or gallery first (B7).
  await page.getByRole('button', { name: 'Add photo', exact: true }).tap()
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Upload photo' }).tap()
  await picker
})

test('PHONE-2-google-empty: Google Add opens shop details directly', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Google', exact: true }).tap()
  await page.getByRole('button', { name: 'Add shop details', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add shop details' })).toBeVisible()
})

test('PHONE-3: Maps handoff is visibly Live and opens the exact shop query without contacting Google', async ({
  page,
  context,
}) => {
  await enter(page)
  await saveShop(page)
  await page.getByRole('button', { name: 'Google', exact: true }).tap()
  const maps = page.getByRole('link', { name: 'Find & claim on Maps', exact: true })
  await expect(page.getByText('Live — opens Google Maps', { exact: true })).toBeVisible()
  await expect(maps).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=Katong%20Kopi%20Katong%2C%20Singapore',
  )
  await context.route('https://www.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Offline handoff fixture</p>' }),
  )
  const popup = page.waitForEvent('popup')
  await maps.tap()
  const opened = await popup
  await expect(opened).toHaveURL(/query=Katong%20Kopi%20Katong%2C%20Singapore/)
  await opened.close()
  await page.getByRole('button', { name: 'Practice the steps' }).tap()
  await expect(
    page.getByText('Simulated — no Google listing is created or changed', { exact: true }),
  ).toBeVisible()
})

test('PHONE-3-claim: finding a fictional match leads to a saved claim outcome with a visible connection flag', async ({
  page,
}) => {
  await enter(page)
  await saveShop(page)
  await page.getByRole('button', { name: 'Google', exact: true }).tap()
  await page.getByRole('button', { name: 'Practice the steps' }).tap()
  await page.getByRole('button', { name: 'Find & claim a listing', exact: true }).tap()
  const wizard = page.getByRole('dialog', { name: 'Practice: Google owner journey' })
  const flag = wizard.getByRole('heading', { name: 'Practice: Google owner journey' })
  await expect(flag).toBeVisible()
  await wizard.getByRole('button', { name: 'Find & claim a listing', exact: true }).tap()
  await wizard.getByRole('button', { name: 'Customers visit', exact: true }).tap()
  await expect(flag).toBeVisible()
  await wizard.getByLabel('Hours', { exact: true }).fill('09:00–18:00')
  await wizard.getByLabel('Contact', { exact: true }).fill('Fictional contact')
  await wizard.getByLabel('Google category fixture').tap()
  await page.getByRole('option', { name: 'Hawker stall', exact: true }).tap()
  await wizard.getByRole('button', { name: 'Continue', exact: true }).tap()
  await expect(flag).toBeVisible()
  await wizard.getByRole('button', { name: 'Demo owner account (fictional)', exact: true }).tap()
  await expect(flag).toBeVisible()
  await expect(wizard.getByRole('button', { name: /^Continue: Demo/ })).toHaveCount(2)
  await wizard.getByRole('button', { name: 'Continue: Demo Market Road', exact: true }).tap()
  await wizard.getByRole('button', { name: 'Request ownership', exact: true }).tap()
  await expect(flag).toBeVisible()
  await expect(wizard.getByText('Pending — no ownership granted', { exact: true })).toBeVisible()
  await expect(
    wizard.getByText('Saved fictional ownership request. No request was sent to Google.', {
      exact: true,
    }),
  ).toBeVisible()
  await wizard.getByRole('button', { name: 'Close and keep progress' }).tap()
  await page.getByRole('button', { name: 'Find & claim a listing', exact: true }).tap()
  await expect(flag).toBeVisible()
  await expect(wizard.getByText('Pending — no ownership granted', { exact: true })).toBeVisible()
})
