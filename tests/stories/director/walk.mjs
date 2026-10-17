/* global document */
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { stories } from './catalog.mjs'
import { capture } from './audit.mjs'
import { seedShop, confirm, image } from '../support.ts'

const host = process.env.DIRECTOR_HOST || '127.0.0.1'
if (!['127.0.0.1', '127.0.0.2'].includes(host)) throw new Error('Director host must be loopback')
const baseURL = `http://${host}:3537`
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const identity = await (await fetch(`${baseURL}/__director`)).json()
if (identity.kind !== 'track-r-director' || identity.sha !== sha)
  throw new Error(
    'Wrong local server or baseline; stop rather than recording another worker’s app.',
  )
const health = await (await fetch(`${baseURL}/api/v1/health`)).json()
if (
  health.coach_mode !== 'offline' ||
  health.auth_mode !== 'local' ||
  health.release_commit !== sha
)
  throw new Error('Director backend fixture/provenance check failed.')
const wanted = process.argv.slice(2)
const selected = stories.filter((s) => !wanted.length || wanted.includes(s.id))
const variants = ['phone-light', 'phone-dark', 'desktop-light', 'desktop-dark']
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: [
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE 127.0.0.2',
    '--disable-background-networking',
  ],
})
const results = []
async function enter(page) {
  await page.goto('/?app=business')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
}
async function say(page, text) {
  await expect(page.getByRole('button', { name: 'Stop reply', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}
async function owner(page, pinned = false) {
  await enter(page)
  await seedShop(page, pinned, 'Director Chai · synthetic demo')
  return (await (await page.request.get('/api/v1/businesses')).json())[0].id
}
async function shop(page) {
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
}
async function publish(page, id) {
  expect(
    (await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })).ok(),
  ).toBe(true)
}
async function run(story, variant) {
  const directory = resolve('docs/stories/director', story.id, variant)
  await mkdir(directory, { recursive: true })
  for (const suffix of ['.png', '.json', '-heatmap.svg'])
    await rm(`${directory}/99-failure${suffix}`, { force: true })
  const phone = variant.startsWith('phone'),
    dark = variant.endsWith('dark')
  const context = await browser.newContext({
    baseURL,
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: phone,
    hasTouch: phone,
    colorScheme: dark ? 'dark' : 'light',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    permissions: ['geolocation'],
    geolocation: { latitude: 12.9718, longitude: 77.6412, accuracy: 15 },
    recordVideo: {
      dir: directory,
      size: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    },
    serviceWorkers: 'block',
  })
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
  )
  await context.routeWebSocket('**/*', (socket) => {
    if (new URL(socket.url()).host === `${host}:3537`) socket.connectToServer()
    else socket.close()
  })
  await context.addInitScript(
    ({ appearance, skipJourney }) => {
      if (!localStorage.getItem('niva.starter.preferences'))
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
      // Suppress only the repeat customer tour; location/interest setup has a dedicated S3 capture.
      if (skipJourney) localStorage.setItem('chalkboard.customer.journey', 'done')
    },
    { appearance: dark ? 'dark' : 'light', skipJourney: story.id !== 's3' },
  )
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const result = {
    id: story.id,
    title: story.title,
    variant,
    sha,
    baseURL,
    serverRun: identity.run,
    started: new Date().toISOString(),
    status: 'walked',
    evidence: [],
    gaps: [],
    checks: [],
    error: null,
  }
  const shot = async (name) => result.evidence.push(await capture(page, directory, name))
  const gap = (text) => result.gaps.push(text)
  try {
    if (story.id === 's1') {
      await page.goto('/?app=business')
      await shot('01-welcome')
      await page.getByRole('button', { name: 'Continue local preview' }).click()
      await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeDisabled()
      await shot('02-consent')
      await page.getByLabel('I agree to the Terms').check()
      await page.getByLabel('I have read the Privacy Notice').check()
      await page.getByRole('button', { name: 'Agree and continue' }).click()
      await shot('03-coach-empty')
      await page.locator('#coach input[type="file"]').setInputFiles(await image(page))
      await expect(page.getByRole('dialog', { name: 'Check before saving' })).toContainText(
        'Offline fixture',
      )
      await shot('04-photo-review')
      expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
      await confirm(page)
      await shop(page)
      await shot('05-my-shop')
      await page.getByRole('button', { name: /^Customer page/ }).click()
      await shot('06-sharing')
      gap(
        'This main checkout uses the existing coach/photo review. The full-screen name-first voice/camera/map onboarding contract needs the onboarding branch and physical-device review.',
      )
      result.checks.push(
        'Consent gate; photo fixture disclosure; no preapproval save; My shop and sharing reachable',
      )
    } else if (story.id === 's2') {
      const id = await owner(page)
      await shot('01-coach')
      await page.route('**/coach/stream', (r) => r.fulfill({ status: 503, json: {} }), { times: 1 })
      await say(page, 'Kopi is 20 rupees now, kaya toast sold out')
      await expect(page.getByRole('alert').first()).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
        'Kopi is 20 rupees now, kaya toast sold out',
      )
      await shot('01-send-error-draft')
      await context.setOffline(true)
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.getByRole('alert').first()).toBeVisible()
      await shot('01-offline-draft')
      await context.setOffline(false)
      await say(page, 'Kopi is 20 rupees now, kaya toast sold out')
      await expect(page.getByRole('dialog')).toContainText('₹20.00')
      await shot('02-review')
      const before = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
      expect(before.find((p) => p.name === 'Kopi').price).toBe(1800)
      await confirm(page)
      await publish(page, id)
      await page.goto(`/explore/s/${id}`)
      await expect(page.getByRole('listitem').filter({ hasText: 'Kopi' })).toContainText('₹20.00')
      await expect(page.getByRole('listitem').filter({ hasText: 'Kaya toast' })).toContainText(
        'Sold out',
      )
      await shot('03-public-saved')
      result.checks.push('Both edits reviewed before save; public menu shows approved values')
    } else if (story.id === 's3') {
      const id = await owner(page, true)
      await publish(page, id)
      await page.goto('/explore/')
      await shot('00-location')
      await page.getByRole('button', { name: 'Use my location' }).click()
      await shot('01-ask')
      const input = page.getByRole('textbox', { name: 'What are you looking for?' })
      await input.fill('Kopi')
      await input.press('Enter')
      await expect(
        page.getByRole('link').filter({ hasText: 'Director Chai' }).first(),
      ).toBeVisible()
      await shot('02-results')
      await page.goto(`/explore/s/${id}`)
      await shot('03-shop')
      await page.getByRole('button', { name: 'Chat with the shop' }).click()
      await page.getByLabel('Your question').fill('halal?')
      await page.getByRole('button', { name: 'Ask the shop assistant' }).click()
      await expect(
        page.getByText('Simulated answer · offline fixture, no live AI connected'),
      ).toBeVisible()
      await shot('04-instant-answer')
      await page.getByRole('button', { name: 'Ask the owner' }).last().click()
      await expect(page.getByText('Owners reply to a real person')).toBeVisible()
      await shot('05-signin-boundary')
      await page.getByRole('button', { name: /Continue with Google/ }).click()
      await expect(page.getByText(/Signed in as/)).toBeVisible()
      await page
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill('Can I collect two kopi today?')
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(page).toHaveURL(/\/explore\/chats\//)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true')
      await shot('06-customer-thread')
      const ownerPage = await context.newPage()
      const ownerVideo = ownerPage.video()
      try {
        await ownerPage.goto('/?app=business')
        await ownerPage.getByRole('button', { name: 'Continue local preview' }).click()
        await shop(ownerPage)
        await ownerPage.getByRole('button', { name: /^Messages 1/ }).click()
        const messages = ownerPage.getByRole('region', { name: /Messages/ })
        await expect(messages).toContainText('Can I collect two kopi today?')
        await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
        await messages
          .getByLabel('Reply', { exact: true })
          .fill('Yes, ready at 4 pm. This is a synthetic demo reply.')
        await messages.getByRole('button', { name: 'Send message', exact: true }).click()
        await expect(messages.getByLabel('Reply', { exact: true })).toHaveValue('')
        result.evidence.push(await capture(ownerPage, directory, '07-owner-reply'))
        await page.bringToFront()
        await expect(
          page.getByText('Yes, ready at 4 pm. This is a synthetic demo reply.'),
        ).toBeVisible({ timeout: 20000 })
        await shot('08-reply-received')
      } finally {
        await ownerPage.close()
        if (ownerVideo) {
          await ownerVideo.saveAs(`${directory}/owner-reply.webm`)
          await ownerVideo.delete()
        }
      }
      gap(
        'Local identity stand-in and same-context owner/customer pages only. Real Google sign-in and account isolation are separate unvalidated evidence.',
      )
      result.checks.push(
        'Anonymous discovery and facts; sign-in gate; synthetic customer message and owner reply received',
      )
    } else if (story.id === 's4') {
      await owner(page)
      await say(page, 'My flour is running low')
      await expect(page.getByRole('list', { name: /suppliers nearby/ })).toBeVisible()
      await shot('01-suppliers')
      await say(page, 'The second one looks good, order 20 kg flour and 5 kg sugar from them')
      await expect(page.getByText('Nothing is sent until you tap Send. No payment.')).toBeVisible()
      await shot('02-order-review')
      await page.getByRole('button', { name: /^Send to / }).click()
      await expect(page.getByText('Automatic demo reply').first()).toBeVisible({ timeout: 30000 })
      await shot('03-demo-reply')
      await shop(page)
      await page.getByRole('button', { name: /^Orders/ }).click()
      await shot('04-orders')
      gap(
        'Forecast trigger and stock receipt hand-off are outside this sourcing-only walk; supplier replies are fixtures.',
      )
    } else if (story.id === 's5') {
      await owner(page)
      await page.getByRole('button', { name: 'Google', exact: true }).click()
      await shot('01-google-checklist')
      const flow = page.getByRole('region', { name: 'Google', exact: true })
      await flow.getByRole('button', { name: 'Next', exact: true }).click()
      await flow.locator('input[type="file"]:not([capture])').setInputFiles(await image(page))
      await expect(flow.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
      await shot('02-google-photos')
      await flow.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(flow).toContainText('₹18.00')
      await shot('03-google-preview')
      await flow.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(flow.getByText('Waiting for Google API access')).toBeVisible()
      await expect(flow.getByRole('link', { name: 'Add on Google' })).toHaveAttribute(
        'href',
        'https://business.google.com/add',
      )
      await shot('04-google-handoff')
      gap(
        'Official links inspected without external navigation; actual owner submission and Google access unvalidated.',
      )
    } else if (story.id === 's6') {
      const id = await owner(page)
      await publish(page, id)
      await page.getByRole('button', { name: 'Privacy', exact: true }).click()
      await shot('01-privacy')
      await page.getByRole('button', { name: 'Delete all my data' }).click()
      await shot('02-confirm-cancel')
      await page.keyboard.press('Escape')
      expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
      await page.route('**/api/v1/me/data', (r) => r.abort(), { times: 1 })
      await page.getByRole('button', { name: 'Delete all my data' }).click()
      await page.getByRole('button', { name: 'Delete permanently' }).click()
      await expect(
        page.getByRole('alert').filter({ hasText: 'Deletion didn’t finish' }),
      ).toBeVisible()
      await shot('03-delete-error')
      await page.route(
        '**/api/v1/me/data',
        (r) =>
          r.fulfill({
            json: {
              status: 'partial',
              erased: ['records', 'gallery', 'community', 'memory', 'conversations'],
              pending: ['face', 'photos'],
              retry_saved: true,
              businesses: 1,
              photos: 0,
              conversations: 0,
            },
          }),
        { times: 1 },
      )
      await page
        .getByRole('alert')
        .filter({ hasText: 'Deletion didn’t finish' })
        .getByRole('button', { name: 'Try again' })
        .click()
      const pending = page.getByRole('alert').filter({ hasText: 'still being deleted' })
      await expect(pending).toContainText('Still pending: face data and photos')
      await shot('03-partial-erasure')
      await pending.getByRole('button', { name: 'Try again' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'All your data was deleted' }),
      ).toBeVisible()
      expect((await page.request.get(`/api/v1/public/shops/${id}`)).status()).toBe(404)
      await page.screenshot({ path: `${directory}/04-erasure-receipt.png`, animations: 'disabled' })
      await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible()
      await shot('04-erased-restarted')
      gap(
        'Optional face capture, biometric matching and liveness are untested; face worker intentionally unavailable.',
      )
    } else if (story.id === 's7') {
      await owner(page)
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await shot('01-settings')
      await page.getByRole('button', { name: 'Install app', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Install app' })).toContainText(
        'Installation is not available yet',
      )
      await shot('01-install-optional')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('combobox', { name: 'Language' }).click()
      await page.getByRole('option', { name: /தமிழ்/ }).click()
      await page.keyboard.press('Escape')
      await expect(page.locator('html')).toHaveAttribute('lang', /^ta/)
      await shot('02-tamil')
      gap(
        'Tamil UI sample only; Hindi/CJK, audible TTS, 200% text, IME, physical installation and full 15-locale review remain unvalidated.',
      )
    } else if (story.id === 's8') {
      const id = await owner(page)
      await publish(page, id)
      await page.goto(`/explore/s/${id}?source=qr`)
      const card = page.getByRole('region', { name: 'Stamp card' })
      await expect(card.getByRole('status')).toContainText('3 stamps')
      await shot('01-phone-stamp')
      await page.reload()
      await expect(card.getByRole('status')).toContainText('3 stamps')
      await page.goto('/explore/passport/')
      await shot('02-passport')
      gap(
        'Unsigned stamp is on-phone only; verified signed visit, reward threshold, quests and scratch keyboard alternative need further evidence. No QR signing key was read or copied.',
      )
    } else if (story.id === 's10') {
      await owner(page)
      await say(page, 'Analyse my forecast')
      await expect(page.getByRole('button', { name: 'Stop reply', exact: true })).toHaveCount(0)
      await shot('01-forecast-answer')
      await shop(page)
      await page.getByRole('button', { name: /^Prep plan/ }).click()
      await shot('02-prep-empty')
      gap(
        'No seeded sales history: this records the insufficient-history boundary, not a rich forecast or daily brief.',
      )
    } else if (story.id === 's15') {
      await owner(page)
      await shop(page)
      await page.getByRole('button', { name: /^Close the day/ }).click()
      await shot('01-close-day')
      const dialog = page.getByRole('dialog', { name: 'Close the day' })
      await expect(dialog.getByRole('button', { name: /^Review/ })).toBeDisabled()
      await dialog.getByRole('button', { name: /Till or POS report/ }).click()
      await dialog.locator('input[type=file]').setInputFiles(await image(page))
      await expect(dialog.getByText(/\d+ lines$/)).toBeVisible()
      await dialog.getByRole('button', { name: /^Review/ }).click()
      await expect(dialog).toContainText('Offline mode')
      await shot('02-count-review')
      await dialog.getByRole('button', { name: 'Save day' }).click()
      await expect(dialog.getByText('Day closed')).toBeVisible()
      await shot('03-day-closed')
      await dialog.getByRole('button', { name: 'Done', exact: true }).click()
      gap(
        'Fixture photo count extraction only; real photo accuracy and tomorrow’s populated plan remain unvalidated.',
      )
    } else if (story.id === 's16') {
      const id = await owner(page)
      await publish(page, id)
      await page.goto(`/explore/s/${id}`)
      await shot('01-follow-entry')
      const follow = page.getByRole('button', { name: /^Follow shop$|^Follow$/ }).first()
      if (await follow.count()) {
        await follow.click()
        await shot('02-follow-state')
      }
      await page.goto('/explore/saved/')
      await shot('03-saved')
      gap(
        'Moderated tips, preference ranking, failure rollback and account persistence need further evidence.',
      )
    } else {
      await owner(page)
      await shop(page)
      await shot('01-entry-boundary')
      const labels = {
        s9: /^Rescue/,
        s11: /^Asked nearby|^Demand radar/,
        s12: /^Price check/,
        s13: /^Group buy/,
        s14: /^Supplier mode|^Demand nearby/,
        s17: /^Shop agents|^Concierge/,
        s18: /^Connect your system/,
        s19: /^Supply chain|^Purchase orders/,
        s20: /^Features$/,
        s21: /^Impact$/,
      }
      const entry = page.getByRole('button', { name: labels[story.id] })
      result.status = 'blocked'
      gap(
        (await entry.count())
          ? 'A candidate entry exists; its end-to-end adapter is not implemented in this recording script. Manual walk required.'
          : 'No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.',
      )
    }
    if (result.status !== 'blocked') {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const loops = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity,
            ).length,
      )
      result.checks.push(
        `Reduced-motion final state: ${loops} running infinite animations (manual interpretation required)`,
      )
      await shot('90-reduced-motion')
    }
    if (result.gaps.length && result.status === 'walked') result.status = 'partial'
  } catch (error) {
    result.status = 'failed'
    // Error messages can include navigation URLs. Persist only assertion text without URLs/query strings.
    result.error = String(error.message)
      .replace(/https?:\/\/[^\s)]+/g, '[local URL]')
      .slice(0, 1800)
    try {
      await shot('99-failure')
    } catch {
      /* Original failure remains authoritative. */
    }
  } finally {
    result.finished = new Date().toISOString()
    const video = page.video()
    await context.close()
    if (video) await video.saveAs(`${directory}/walk.webm`)
    if (video) await video.delete()
    await writeFile(`${directory}/run.json`, JSON.stringify(result, null, 2))
    results.push(result)
    console.log(`${story.id} ${variant}: ${result.status}; ${result.evidence.length} screens`)
  }
}
const queue = selected.flatMap((story) => variants.map((variant) => ({ story, variant })))
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const { story, variant } = queue.shift()
      await run(story, variant)
    }
  }),
)
await browser.close()
let previous = []
try {
  previous = JSON.parse(await readFile('docs/stories/director/results.json', 'utf8')).results
} catch {
  /* First run. */
}
const summary = {
  sha,
  generated: new Date().toISOString(),
  mode: 'offline local fixture',
  results: [
    ...previous.filter((old) => !results.some((r) => r.id === old.id && r.variant === old.variant)),
    ...results,
  ],
}
await writeFile('docs/stories/director/results.json', JSON.stringify(summary, null, 2))
const failed = results.filter((r) => r.status === 'failed')
console.log(
  `${results.length} walks; ${failed.length} execution failures; ${results.filter((r) => r.status === 'blocked').length} blocked contracts`,
)
process.exitCode = failed.length ? 1 : 0
