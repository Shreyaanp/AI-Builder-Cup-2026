import { createShop } from './stories/support.js'
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
  await createShop(page, 'name: Katong Kopi; location: Katong, Singapore')
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
  await page.getByRole('button', { name: 'Shop', exact: true }).tap()
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
  await page.getByRole('button', { name: 'Shop', exact: true }).tap()
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
  await page.route('**/node_modules/.vite*/deps/firebase_app.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
    export const getApps = () => [];
    export const initializeApp = () => ({});
  `,
    }),
  )
  await page.route('**/node_modules/.vite*/deps/firebase_auth.js*', (route) =>
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

test('PHONE-2: every shop Add entry opens the full-screen new-shop flow (no dialog); product Add opens its form', async ({
  page,
}) => {
  await enter(page)
  await page.getByRole('button', { name: 'New conversation', exact: true }).tap()
  const actions = page.getByRole('dialog', { name: 'New conversation', exact: true })
  await expect(actions).toBeVisible()
  await actions.getByRole('button', { name: 'Add shop details', exact: true }).tap()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: 'Shop', exact: true }).tap()
  await page.getByRole('button', { name: 'Create your shop', exact: true }).tap()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  // Without a shop, Grow (and its Get on Google card) starts with "Create your shop".
  await page.getByRole('button', { name: 'Grow', exact: true }).tap()
  await page.getByRole('button', { name: 'Create your shop', exact: true }).tap()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: 'Coach', exact: true }).tap()
  await saveShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).tap()
  // My shop tiles: Add product lives in the Menu sheet.
  await page.getByRole('button', { name: /^Menu/ }).tap()
  await page.getByRole('button', { name: 'Add product', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await page.getByRole('button', { name: /Choose shop/ }).tap()
  await page.getByRole('menuitem', { name: 'New shop', exact: true }).tap()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
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
  // Today's next setup step opens the details form.
  await page.getByTestId('today-day-one').getByRole('button', { name: 'Add', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Edit details' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  // Phones choose camera or gallery first (B7).
  await page.getByRole('button', { name: 'Attach a photo or document', exact: true }).tap()
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Photo library' }).tap()
  await picker
})

test('PHONE-2-google-empty: Grow without a shop opens the new-shop flow directly', async ({
  page,
}) => {
  await enter(page)
  // Without a shop, Grow (and its Get on Google card) starts with "Create your shop".
  await page.getByRole('button', { name: 'Grow', exact: true }).tap()
  await page.getByRole('button', { name: 'Create your shop', exact: true }).tap()
  await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('PHONE-3: the Google flow ends with official links and an honest waiting status', async ({
  page,
  context,
}) => {
  await enter(page)
  await saveShop(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).tap()
  await page.getByRole('button', { name: /^Get on Google/ }).tap()
  await page.getByRole('button', { name: 'Step 4 of 4: Google', exact: true }).tap()
  await expect(page.getByText('Waiting for Google API access', { exact: true })).toBeVisible()
  const maps = page.getByRole('link', { name: 'Find & claim on Maps', exact: true })
  await expect(maps).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=Katong%20Kopi%20Katong%2C%20Singapore',
  )
  await expect(page.getByRole('link', { name: 'Add on Google', exact: true })).toHaveAttribute(
    'href',
    'https://business.google.com/add',
  )
  await context.route('https://www.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Offline handoff fixture</p>' }),
  )
  const popup = page.waitForEvent('popup')
  await maps.tap()
  const opened = await popup
  await expect(opened).toHaveURL(/query=Katong%20Kopi%20Katong%2C%20Singapore/)
  await opened.close()
  // No practice simulator any more.
  await expect(page.getByText(/simulat/i)).toHaveCount(0)
})
