// Throwaway journey walker script for Chalkboard UX audit.
// Runs sequentially (--workers=1), records video to docs/ux/journeys/<persona>-<flow>.webm
// and scores time, taps, dead waits, jargon, reachability, etc.

import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, rename, writeFile, rm, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const WEB_PORT = process.env.WEB_PORT || '3817'
const API_PORT = process.env.API_PORT || '3917'
const RECALL_PATH = process.env.RECALL_PATH || 'data/test-vectors'
const baseURL = `http://127.0.0.1:${WEB_PORT}`
const apiURL = `http://127.0.0.1:${API_PORT}`

const fixtureImage = resolve('tests/stories/fixtures/bengaluru-board.jpg')
const rawVideoDir = resolve('docs/ux/journeys/_raw')
const journeysDir = resolve('docs/ux/journeys')
const screenshotsDir = resolve('docs/ux/journeys/screenshots')

await mkdir(rawVideoDir, { recursive: true })
await mkdir(journeysDir, { recursive: true })
await mkdir(screenshotsDir, { recursive: true })

console.log(`Starting Journey Audit on WEB_PORT=${WEB_PORT}, API_PORT=${API_PORT}, RECALL_PATH=${RECALL_PATH}`)

// Start servers
const backendEnv = {
  ...process.env,
  PYTHONPATH: resolve('backend'),
  WEB_PORT,
  API_PORT,
  APP_ENV: 'test',
  COACH_MODE: 'offline',
  AUTH_MODE: 'local',
  V1_ENABLED: 'true',
  MERCHANT_BACKEND: 'sqlite',
  SESSION_BACKEND: 'sqlite',
  MODERATION_MODE: 'fixture',
  FACE_MODE: 'fixture',
  TRUST_ADMINS: '["*"]',
  RATE_LIMITS_ENABLED: 'false',
  FORECAST_BACKEND: 'weekday_average',
  WEATHER_BACKEND: 'offline',
  RECALL_PATH,
  MERCHANT_DATABASE: '../.cache/journey/merchant.sqlite3',
  SESSION_DATABASE_URL: 'sqlite+aiosqlite:///../.cache/journey/sessions.sqlite3',
  MEDIA_DIR: '../.cache/journey/media',
  CUSTOMER_ORIGIN: baseURL,
  ALLOWED_ORIGINS: JSON.stringify([baseURL, `http://localhost:${WEB_PORT}`]),
}

delete backendEnv.FIRESTORE_EMULATOR_HOST

await mkdir('.cache/journey', { recursive: true })

console.log('Spawning backend...')
const backendProcess = spawn('uv', ['run', '--locked', 'python', 'run.py'], {
  cwd: 'backend',
  env: backendEnv,
  stdio: 'ignore',
})

console.log('Spawning frontend...')
const frontendProcess = spawn('npx', ['vite', '--port', WEB_PORT, '--host', '127.0.0.1'], {
  cwd: '.',
  env: {
    ...process.env,
    WEB_PORT,
    API_PORT,
  },
  stdio: 'ignore',
  shell: true,
})

// Wait for health
async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

try {
  await waitForServer(`${apiURL}/api/v1/health`)
  console.log('Backend healthy!')
  await waitForServer(baseURL)
  console.log('Frontend healthy!')
} catch (e) {
  backendProcess.kill()
  frontendProcess.kill()
  throw e
}

// Browser setup
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-background-networking',
  ],
})

// Jargon blacklist
const JARGON_TERMS = [
  'digest',
  'heuristic',
  'fixture',
  'offline',
  'sap',
  'idoc',
  'json',
  'mestyp',
  'proposal',
  'proposals',
  'revision',
  'rev 0',
  'telemetry',
  'latency',
  'simulation',
  'tokens',
  'payload',
  'embedding',
  'embeddings',
  'schema',
  'dataset',
  'oidc',
  'api',
  'bigquery',
  'sqlite',
  'null',
  'undefined',
  'nan',
  'cors',
  'grpc',
]

// Audit runner helper
class JourneyRunner {
  constructor(persona, flowName, mode = 'light', locale = 'en-IN') {
    this.persona = persona
    this.flowName = flowName
    this.mode = mode
    this.locale = locale
    this.taps = 0
    this.deadWaits = 0
    this.jargonFound = new Set()
    this.touchTargetViolations = 0
    this.horizontalOverflows = 0
    this.steps = []
    this.errors = []
    this.startTime = Date.now()
    this.context = null
    this.page = null
  }

  async setup() {
    this.context = await browser.newContext({
      baseURL,
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
      colorScheme: this.mode,
      locale: this.locale,
      timezoneId: 'Asia/Kolkata',
      permissions: ['geolocation', 'camera', 'microphone'],
      geolocation: { latitude: 12.9716, longitude: 77.5946, accuracy: 15 },
      recordVideo: {
        dir: rawVideoDir,
        size: { width: 360, height: 800 },
      },
    })

    await this.context.addInitScript(
      ({ appearance, locale }) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
        localStorage.setItem('chalkboard.customer.journey', 'done')
      },
      { appearance: this.mode, locale: this.locale },
    )

    // Voice mock audio context
    await this.context.addInitScript(() => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          const audio = new AudioContext()
          const dest = audio.createMediaStreamDestination()
          audio.createOscillator().connect(dest)
          return dest.stream
        }
      }
    })

    // Face fixture route
    await this.context.route('**/api/v1/face/challenges/*/capture', (route) => {
      route.continue({
        headers: {
          ...route.request().headers(),
          'x-face-fixture': `owner-${this.persona}-${this.mode}`,
        },
      })
    })

    this.page = await this.context.newPage()
  }

  async goto(path, options = {}) {
    return this.page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15000, ...options })
  }

  async tap(locatorOrSelector, desc = '') {
    const start = Date.now()
    const loc =
      typeof locatorOrSelector === 'string'
        ? this.page.locator(locatorOrSelector)
        : locatorOrSelector
    await loc.scrollIntoViewIfNeeded().catch(() => {})

    // Check target size
    const box = await loc.boundingBox().catch(() => null)
    if (box && (box.width < 44 || box.height < 44)) {
      this.touchTargetViolations++
    }

    await loc.click({ timeout: 5000 }).catch((e) => {
      this.errors.push(`Click failed for ${desc}: ${e.message}`)
    })
    this.taps++
    const elapsed = Date.now() - start
    if (elapsed > 1000) {
      this.deadWaits++
    }
    this.steps.push({ action: 'tap', desc, elapsed })
  }

  async inspectDOM(stepName) {
    await this.page.waitForTimeout(300)
    const metrics = await this.page.evaluate((jargon) => {
      const width = window.innerWidth
      const overflow = document.documentElement.scrollWidth > width + 1
      const text = document.body.innerText.toLowerCase()
      const foundJargon = jargon.filter((word) => text.includes(word))

      const smallButtons = Array.from(
        document.querySelectorAll('button, a, input, [role="button"]'),
      ).filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)
      }).length

      return { overflow, foundJargon, smallButtons }
    }, JARGON_TERMS).catch(() => ({ overflow: false, foundJargon: [], smallButtons: 0 }))

    if (metrics.overflow) this.horizontalOverflows++
    for (const j of metrics.foundJargon) this.jargonFound.add(j)
    this.touchTargetViolations += metrics.smallButtons

    // Save screenshot
    const shotPath = resolve(screenshotsDir, `${this.persona}-${this.flowName}-${stepName}.png`)
    await this.page.screenshot({ path: shotPath, animations: 'disabled' }).catch(() => {})
  }

  async finish() {
    const totalTime = (Date.now() - this.startTime) / 1000
    const video = this.page.video()
    await this.page.close().catch(() => {})
    await this.context.close().catch(() => {})

    const targetVideo = resolve(journeysDir, `${this.persona}-${this.flowName}.webm`)
    if (video) {
      await video.saveAs(targetVideo).catch(async () => {
        const vpath = await video.path().catch(() => null)
        if (vpath && existsSync(vpath)) {
          await rename(vpath, targetVideo).catch(() => {})
        }
      })
    }

    return {
      persona: this.persona,
      flow: this.flowName,
      time_seconds: +totalTime.toFixed(2),
      taps: this.taps,
      dead_waits: this.deadWaits,
      unfriendly_words: Array.from(this.jargonFound),
      touch_targets_under_48px: this.touchTargetViolations,
      horizontal_overflow: this.horizontalOverflows > 0,
      steps_count: this.steps.length,
      errors: this.errors,
    }
  }
}

async function runFlowSafely(runner, flowFn) {
  try {
    await runner.setup()
    await flowFn(runner)
  } catch (err) {
    console.error(`Flow ${runner.persona}-${runner.flowName} error:`, err.message)
    runner.errors.push(err.message)
    await runner.inspectDOM('error-state').catch(() => {})
  } finally {
    const res = await runner.finish()
    auditResults.push(res)
    console.log(
      `✓ Finished ${runner.persona}-${runner.flowName} in ${res.time_seconds}s (taps: ${res.taps}, dead waits: ${res.dead_waits}, jargon: [${res.unfriendly_words.join(', ')}])`,
    )
  }
}

// Helpers for flows
async function enterWorkspace(r) {
  await r.goto('/?app=business')
  await r.page.waitForTimeout(600)
  const cont = r.page.locator('main button.MuiButton-contained').first()
  if (await cont.count()) {
    await cont.click({ timeout: 5000 }).catch(() => {})
    await r.page.waitForTimeout(600)
  }
  const boxes = r.page.locator('input[type="checkbox"]')
  if (await boxes.count() >= 2) {
    await boxes.nth(0).check().catch(() => {})
    await boxes.nth(1).check().catch(() => {})
    const agree = r.page.locator('main button.MuiButton-contained').last()
    if (await agree.count()) await agree.click({ timeout: 5000 }).catch(() => {})
  }
  await r.page.waitForTimeout(1000)
}

async function seedShopDirect(page, name = 'Courtyard Chai', category = 'Tea stall') {
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'business',
        revision: 0,
        business: {
          name,
          category,
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '06:00–22:00',
          payment_methods: ['UPI', 'cash'],
          reward_text: 'Free chai on 5th stamp',
          stamps_needed: 5,
        },
        products: [
          { name: 'Masala chai', price: 1500, unit: 'cup', category: 'Tea' },
          { name: 'Ginger chai', price: 2000, unit: 'cup', category: 'Tea' },
          { name: 'Bun maska', price: 3000, unit: 'piece', category: 'Snacks' },
        ],
      }),
    })
    const proposal = await res.json()
    const appRes = await fetch(
      `http://127.0.0.1:${API_PORT}/api/v1/proposals/${proposal.id}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest: proposal.digest }),
      },
    )
    const approved = await appRes.json()
    const id = approved.business_id
    await fetch(`http://127.0.0.1:${API_PORT}/api/v1/businesses/${id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public: true }),
    })
    return id
  } catch (e) {
    console.error('seedShopDirect error:', e.message)
    return 'default-shop'
  }
}

const auditResults = []

// =========================================================================
// PERSONA 1: LAKSHMI (52, tea stall, Tamil, low literacy, voice only)
// 360x800 phone, light mode, Tamil
// =========================================================================
console.log('\n--- Running Persona: Lakshmi (Tamil, tea stall, voice) ---')

// 1. first open
await runFlowSafely(
  new JourneyRunner('lakshmi', 'first-open', 'light', 'ta-IN'),
  async (r) => {
    await r.goto('/?app=business')
    await r.page.waitForTimeout(600)
    await r.inspectDOM('1-landing')
    const cont = r.page.locator('main button.MuiButton-contained').first()
    await cont.waitFor({ timeout: 10000 }).catch(() => {})
    if (await cont.count()) await r.tap(cont, 'Continue local preview')
    await r.page.waitForTimeout(600)
    await r.inspectDOM('2-consent')
    const boxes = r.page.locator('input[type="checkbox"]')
    if (await boxes.count() >= 2) {
      await r.tap(boxes.nth(0), 'Check terms')
      await r.tap(boxes.nth(1), 'Check privacy')
      const agree = r.page.locator('main button.MuiButton-contained').last()
      if (await agree.count()) await r.tap(agree, 'Agree and continue')
    }
    await r.page.waitForTimeout(1000)
    await r.inspectDOM('3-workspace')
  },
)

// 2. onboarding voice
await runFlowSafely(
  new JourneyRunner('lakshmi', 'onboarding-voice', 'light', 'ta-IN'),
  async (r) => {
    await enterWorkspace(r)
    const addShop = r.page.locator('button.MuiButton-contained, button').filter({ hasText: /Add my shop|தொடங்கு|சேர்/i }).first()
    if (await addShop.count()) await r.tap(addShop, 'Add my shop')
    await r.inspectDOM('1-welcome')
    const begin = r.page.locator('button.MuiButton-contained').first()
    if (await begin.count()) await r.tap(begin, 'Lets begin')
    await r.inspectDOM('2-voice-prompt')
    const voiceBtn = r.page.getByRole('button', { name: /Press to talk|பேச/i })
    if (await voiceBtn.count()) {
      await r.tap(voiceBtn, 'Press to talk')
      await r.page.waitForTimeout(1200)
      const finishBtn = r.page.getByRole('button', { name: /Finish speaking/ })
      if (await finishBtn.count()) await r.tap(finishBtn, 'Finish speaking')
    } else {
      const msg = r.page.getByLabel('Message', { exact: true })
      if (await msg.count()) {
        await msg.fill('name: Lakshmi Tea Stall; category: Tea stall')
        await r.tap(r.page.getByRole('button', { name: 'Send', exact: true }), 'Send')
      }
    }
    await r.page.waitForTimeout(1500)
    await r.inspectDOM('3-agent-action')
    const cancel = r.page.getByRole('button', { name: 'Cancel', exact: true })
    if (await cancel.count()) await r.tap(cancel, 'Cancel')
  },
)

// 3. menu photo
await runFlowSafely(
  new JourneyRunner('lakshmi', 'menu-photo', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    await r.inspectDOM('1-coach-view')
    const attachBtn = r.page.getByRole('button', { name: /Attach|Take photo|Photo/i })
    if (await attachBtn.count()) {
      await r.tap(attachBtn, 'Attach photo')
      await r.inspectDOM('2-photo-menu')
    }
    const fileInput = r.page.locator('input[type="file"]')
    if (await fileInput.count()) {
      await fileInput.first().setInputFiles(fixtureImage)
      await r.page.waitForTimeout(1500)
      await r.inspectDOM('3-photo-reading')
    }
  },
)

// 4. Today
await runFlowSafely(
  new JourneyRunner('lakshmi', 'today', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    await r.inspectDOM('1-today-overview')
    const coachBtn = r.page.getByRole('button', { name: /Coach/i })
    if (await coachBtn.count()) await r.tap(coachBtn, 'Coach tab')
    await r.inspectDOM('2-today-pulse')
  },
)

// 5. Close the day
await runFlowSafely(
  new JourneyRunner('lakshmi', 'close-day', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const growBtn = r.page.getByRole('button', { name: /Grow/i })
    if (await growBtn.count()) await r.tap(growBtn, 'Grow tab')
    await r.inspectDOM('1-grow-tiles')
    const closeDayTile = r.page.getByRole('button', { name: /^Close the day/i })
    if (await closeDayTile.count()) {
      await r.tap(closeDayTile, 'Open Close the day')
      await r.inspectDOM('2-closeday-dialog')
      const tillBtn = r.page.getByRole('button', { name: /Till or POS report/i })
      if (await tillBtn.count()) {
        await r.tap(tillBtn, 'Tap Till report')
        await r.page.locator('input[type=file]').setInputFiles(fixtureImage)
        await r.page.waitForTimeout(1500)
        await r.inspectDOM('3-closeday-scanned')
        const revBtn = r.page.getByRole('button', { name: /^Review/i })
        if (await revBtn.isEnabled()) {
          await r.tap(revBtn, 'Review day')
          await r.inspectDOM('4-closeday-review')
          const saveBtn = r.page.getByRole('button', { name: /Save day/i })
          if (await saveBtn.count()) await r.tap(saveBtn, 'Save day')
          await r.inspectDOM('5-closeday-saved')
          const doneBtn = r.page.getByRole('button', { name: /Done/i })
          if (await doneBtn.count()) await r.tap(doneBtn, 'Done')
        }
      }
    }
  },
)

// 6. rescue deal
await runFlowSafely(
  new JourneyRunner('lakshmi', 'rescue-deal', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const growBtn = r.page.getByRole('button', { name: /Grow/i })
    if (await growBtn.count()) await r.tap(growBtn, 'Grow tab')
    const rescueTile = r.page.getByRole('button', { name: /^Rescue/i })
    if (await rescueTile.count()) {
      await r.tap(rescueTile, 'Open Rescue Deals')
      await r.inspectDOM('1-rescue-dialog')
      const closeBtn = r.page.getByRole('button', { name: /Close|Done|Back/i })
      if (await closeBtn.count()) await r.tap(closeBtn.first(), 'Close rescue')
    }
  },
)

// 7. payments link
await runFlowSafely(
  new JourneyRunner('lakshmi', 'payments-link', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const growBtn = r.page.getByRole('button', { name: /Grow/i })
    if (await growBtn.count()) await r.tap(growBtn, 'Grow tab')
    const payTile = r.page.getByRole('button', { name: /Payments & rides|Payments/i })
    if (await payTile.count()) {
      await r.tap(payTile, 'Open Payments & rides')
      await r.inspectDOM('1-payments-screen')
      const amt = r.page.getByRole('textbox', { name: /Amount|₹/i })
      if (await amt.count()) {
        await amt.fill('20')
        await r.inspectDOM('2-amount-entered')
      }
      const backBtn = r.page.getByRole('button', { name: /Back/i })
      if (await backBtn.count()) await r.tap(backBtn.first(), 'Back to Grow')
    }
  },
)

// 8. purchase order
await runFlowSafely(
  new JourneyRunner('lakshmi', 'purchase-order', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const coachBtn = r.page.getByRole('button', { name: /Coach/i })
    if (await coachBtn.count()) await r.tap(coachBtn, 'Coach tab')
    const msg = r.page.getByRole('textbox', { name: 'Message', exact: true })
    if (await msg.count()) {
      await msg.fill('Need 5 litres milk and 2 kg sugar')
      await r.tap(r.page.getByRole('button', { name: 'Send', exact: true }), 'Send PO request')
      await r.page.waitForTimeout(2000)
      await r.inspectDOM('1-po-card')
    }
  },
)

// 9. playbook
await runFlowSafely(
  new JourneyRunner('lakshmi', 'playbook', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const youBtn = r.page.getByRole('button', { name: /You/i })
    if (await youBtn.count()) await r.tap(youBtn, 'You tab')
    await r.inspectDOM('1-you-tab')
    const privBtn = r.page.getByRole('button', { name: /^Privacy & your data/i })
    if (await privBtn.count()) {
      await r.tap(privBtn, 'Open Privacy')
      await r.inspectDOM('2-privacy-subpage')
      const playbookBtn = r.page.getByTestId('playbook-open')
      if (await playbookBtn.count()) {
        await r.tap(playbookBtn, 'Open Playbook')
        await r.page.waitForTimeout(1500)
        await r.inspectDOM('3-playbook-sheet')
        const closeBtn = r.page.getByRole('button', { name: /Close/i })
        if (await closeBtn.count()) await r.tap(closeBtn, 'Close playbook')
      }
    }
  },
)

// 10. face check
await runFlowSafely(
  new JourneyRunner('lakshmi', 'face-check', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const youBtn = r.page.getByRole('button', { name: /You/i })
    if (await youBtn.count()) await r.tap(youBtn, 'You tab')
    const privBtn = r.page.getByRole('button', { name: /^Privacy & your data/i })
    if (await privBtn.count()) {
      await r.tap(privBtn, 'Open Privacy')
      const faceCard = r.page.getByRole('region', { name: /Verify it’s you/i })
      if (await faceCard.count()) {
        await r.tap(faceCard.getByRole('button', { name: /Verify it’s you/i }), 'Open face check')
        await r.inspectDOM('1-face-consent')
        const consentBox = r.page.getByLabel(/I agree to this face check/i)
        if (await consentBox.count()) {
          await r.tap(consentBox, 'Check face consent')
          const openCam = r.page.getByRole('button', { name: /Open camera/i })
          if (await openCam.count()) {
            await r.tap(openCam, 'Open camera')
            await r.page.waitForTimeout(2500)
            await r.inspectDOM('2-face-scanning')
            const doneBtn = r.page.getByRole('button', { name: /Done|Try again/i })
            await doneBtn.waitFor({ timeout: 15000 }).catch(() => {})
            await r.inspectDOM('3-face-result')
            if (await doneBtn.count()) await r.tap(doneBtn, 'Done face check')
          }
        }
      }
    }
  },
)

// 11. You/privacy
await runFlowSafely(
  new JourneyRunner('lakshmi', 'you-privacy', 'light', 'ta-IN'),
  async (r) => {
    await seedShopDirect(r.page, 'Lakshmi Chai Stall', 'Tea stall')
    await enterWorkspace(r)
    const youBtn = r.page.getByRole('button', { name: /You/i })
    if (await youBtn.count()) await r.tap(youBtn, 'You tab')
    await r.inspectDOM('1-you-screen')
    const langBox = r.page.getByRole('combobox', { name: /Language/i })
    if (await langBox.count()) {
      await r.tap(langBox, 'Click Language')
      await r.inspectDOM('2-languages-list')
      await r.page.keyboard.press('Escape')
    }
  },
)

// =========================================================================
// PERSONA 2: ARJUN (30, bakery, Hindi/English, impatient, types)
// 360x800 phone, dark mode, English/Hindi
// =========================================================================
console.log('\n--- Running Persona: Arjun (Bakery, fast typer, dark mode) ---')

// 12. first open
await runFlowSafely(
  new JourneyRunner('arjun', 'first-open', 'dark', 'en-IN'),
  async (r) => {
    await r.goto('/?app=business')
    await r.inspectDOM('1-landing')
    await r.tap(r.page.getByRole('button', { name: 'Continue local preview' }), 'Continue preview')
    await r.inspectDOM('2-consent')
    await r.tap(r.page.getByLabel('I agree to the Terms'), 'Check terms')
    await r.tap(r.page.getByLabel('I have read the Privacy Notice'), 'Check privacy')
    await r.tap(r.page.getByRole('button', { name: 'Agree and continue' }), 'Agree and continue')
    await r.page.waitForTimeout(1000)
    await r.inspectDOM('3-workspace')
  },
)

// 13. onboarding typing
await runFlowSafely(
  new JourneyRunner('arjun', 'onboarding-typing', 'dark', 'en-IN'),
  async (r) => {
    await enterWorkspace(r)
    const addShop = r.page.getByRole('button', { name: 'Add my shop' })
    if (await addShop.count()) await r.tap(addShop, 'Add my shop')
    await r.inspectDOM('1-welcome')
    const begin = r.page.getByRole('button', { name: 'Let’s begin' })
    if (await begin.count()) await r.tap(begin, 'Lets begin')
    const msg = r.page.getByLabel('Message', { exact: true })
    if (await msg.count()) {
      await msg.fill(
        "name: Arjun's Royal Bakes; category: Bakery; location: Koramangala 5th Block, Bengaluru",
      )
      await r.tap(r.page.getByRole('button', { name: 'Send', exact: true }), 'Send shop info')
      await r.page.waitForTimeout(1500)
      await r.inspectDOM('2-agent-parsed')
    }
    const cancel = r.page.getByRole('button', { name: 'Cancel', exact: true })
    if (await cancel.count()) await r.tap(cancel, 'Cancel flow')
  },
)

// 14. menu photo
await runFlowSafely(
  new JourneyRunner('arjun', 'menu-photo', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    await r.inspectDOM('1-coach-view')
    const attachBtn = r.page.getByRole('button', { name: /Attach|Take photo|Photo/i })
    if (await attachBtn.count()) {
      await r.tap(attachBtn, 'Attach photo')
      await r.inspectDOM('2-photo-menu')
    }
    const fileInput = r.page.locator('input[type="file"]')
    if (await fileInput.count()) {
      await fileInput.first().setInputFiles(fixtureImage)
      await r.page.waitForTimeout(1500)
      await r.inspectDOM('3-photo-reading')
    }
  },
)

// 15. Today
await runFlowSafely(
  new JourneyRunner('arjun', 'today', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    await r.inspectDOM('1-today-overview')
    const coachBtn = r.page.getByRole('button', { name: 'Coach', exact: true })
    if (await coachBtn.count()) await r.tap(coachBtn, 'Coach tab')
    await r.inspectDOM('2-today-pulse')
  },
)

// 16. Close the day
await runFlowSafely(
  new JourneyRunner('arjun', 'close-day', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const growBtn = r.page.getByRole('button', { name: 'Grow', exact: true })
    if (await growBtn.count()) await r.tap(growBtn, 'Grow tab')
    const closeDay = r.page.getByRole('button', { name: /^Close the day/i })
    if (await closeDay.count()) {
      await r.tap(closeDay, 'Open Close the day')
      await r.inspectDOM('1-closeday-sheet')
      const tillBtn = r.page.getByRole('button', { name: /Till or POS report/i })
      if (await tillBtn.count()) {
        await r.tap(tillBtn, 'Upload till report')
        await r.page.locator('input[type=file]').setInputFiles(fixtureImage)
        await r.page.waitForTimeout(1500)
        await r.inspectDOM('2-closeday-analyzed')
        const revBtn = r.page.getByRole('button', { name: /^Review/i })
        if (await revBtn.isEnabled()) {
          await r.tap(revBtn, 'Review day')
          await r.inspectDOM('3-closeday-review')
          const saveBtn = r.page.getByRole('button', { name: /Save day/i })
          if (await saveBtn.count()) await r.tap(saveBtn, 'Save day')
          await r.inspectDOM('4-closeday-saved')
          const doneBtn = r.page.getByRole('button', { name: /Done/i })
          if (await doneBtn.count()) await r.tap(doneBtn, 'Done')
        }
      }
    }
  },
)

// 17. rescue deal
await runFlowSafely(
  new JourneyRunner('arjun', 'rescue-deal', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const growBtn = r.page.getByRole('button', { name: 'Grow', exact: true })
    if (await growBtn.count()) await r.tap(growBtn, 'Grow tab')
    const rescueTile = r.page.getByRole('button', { name: /^Rescue/i })
    if (await rescueTile.count()) {
      await r.tap(rescueTile, 'Open Rescue Deals')
      await r.inspectDOM('1-rescue-deals-dialog')
      const closeBtn = r.page.getByRole('button', { name: /Close|Done|Back/i })
      if (await closeBtn.count()) await r.tap(closeBtn.first(), 'Close rescue')
    }
  },
)

// 18. payments link
await runFlowSafely(
  new JourneyRunner('arjun', 'payments-link', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const growBtn = r.page.getByRole('button', { name: 'Grow', exact: true })
    if (await growBtn.count()) await r.tap(growBtn, 'Grow tab')
    const payTile = r.page.getByRole('button', { name: /Payments & rides|Payments/i })
    if (await payTile.count()) {
      await r.tap(payTile, 'Open Payments & rides')
      await r.inspectDOM('1-payments-options')
      const amt = r.page.getByRole('textbox', { name: /Amount|₹/i })
      if (await amt.count()) {
        await amt.fill('850')
        await r.inspectDOM('2-amount-filled')
      }
      const backBtn = r.page.getByRole('button', { name: 'Back', exact: true })
      if (await backBtn.count()) await r.tap(backBtn.first(), 'Back to Grow')
    }
  },
)

// 19. purchase order
await runFlowSafely(
  new JourneyRunner('arjun', 'purchase-order', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const coachBtn = r.page.getByRole('button', { name: 'Coach', exact: true })
    if (await coachBtn.count()) await r.tap(coachBtn, 'Coach tab')
    const msg = r.page.getByRole('textbox', { name: 'Message', exact: true })
    if (await msg.count()) {
      await msg.fill('Reorder 50 kg Maida and 20 kg Butter')
      await r.tap(r.page.getByRole('button', { name: 'Send', exact: true }), 'Send PO request')
      await r.page.waitForTimeout(2000)
      await r.inspectDOM('1-po-generated')
    }
  },
)

// 20. playbook
await runFlowSafely(
  new JourneyRunner('arjun', 'playbook', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const youBtn = r.page.getByRole('button', { name: 'You', exact: true })
    if (await youBtn.count()) await r.tap(youBtn, 'You tab')
    const privBtn = r.page.getByRole('button', { name: /^Privacy & your data/i })
    if (await privBtn.count()) {
      await r.tap(privBtn, 'Open Privacy')
      const playbookBtn = r.page.getByTestId('playbook-open')
      if (await playbookBtn.count()) {
        await r.tap(playbookBtn, 'Open Playbook')
        await r.page.waitForTimeout(1500)
        await r.inspectDOM('1-playbook-dialog')
        const closeBtn = r.page.getByRole('button', { name: /Close/i })
        if (await closeBtn.count()) await r.tap(closeBtn, 'Close playbook')
      }
    }
  },
)

// 21. face check
await runFlowSafely(
  new JourneyRunner('arjun', 'face-check', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const youBtn = r.page.getByRole('button', { name: 'You', exact: true })
    if (await youBtn.count()) await r.tap(youBtn, 'You tab')
    const privBtn = r.page.getByRole('button', { name: /^Privacy & your data/i })
    if (await privBtn.count()) {
      await r.tap(privBtn, 'Open Privacy')
      const faceCard = r.page.getByRole('region', { name: /Verify it’s you/i })
      if (await faceCard.count()) {
        await r.tap(faceCard.getByRole('button', { name: /Verify it’s you/i }), 'Verify face')
        await r.inspectDOM('1-face-consent')
        const consentBox = r.page.getByLabel(/I agree to this face check/i)
        if (await consentBox.count()) {
          await r.tap(consentBox, 'Check consent')
          const openCam = r.page.getByRole('button', { name: /Open camera/i })
          if (await openCam.count()) {
            await r.tap(openCam, 'Open camera')
            await r.page.waitForTimeout(2500)
            await r.inspectDOM('2-face-scanning')
            const doneBtn = r.page.getByRole('button', { name: /Done|Try again/i })
            await doneBtn.waitFor({ timeout: 15000 }).catch(() => {})
            await r.inspectDOM('3-face-verified')
            if (await doneBtn.count()) await r.tap(doneBtn, 'Done')
          }
        }
      }
    }
  },
)

// 22. You/privacy
await runFlowSafely(
  new JourneyRunner('arjun', 'you-privacy', 'dark', 'en-IN'),
  async (r) => {
    await seedShopDirect(r.page, "Arjun's Royal Bakes", 'Bakery')
    await enterWorkspace(r)
    const youBtn = r.page.getByRole('button', { name: 'You', exact: true })
    if (await youBtn.count()) await r.tap(youBtn, 'You tab')
    await r.inspectDOM('1-you-tab-dark')
    const lightBtn = r.page.getByRole('button', { name: /Light mode|Switch to light/i })
    if (await lightBtn.count()) {
      await r.tap(lightBtn, 'Toggle light mode')
      await r.inspectDOM('2-you-tab-light')
    }
  },
)

// =========================================================================
// PERSONA 3: MEI (24, visitor in Bengaluru, English, customer)
// 360x800 phone, light mode, English
// =========================================================================
console.log('\n--- Running Persona: Mei (Visitor in Bengaluru, Customer) ---')

// 23. front door Ask
await runFlowSafely(
  new JourneyRunner('mei', 'frontdoor-ask', 'light', 'en-IN'),
  async (r) => {
    await r.goto('/explore/')
    await r.inspectDOM('1-ask-page')
    const askBox = r.page.getByRole('textbox', { name: /Ask about anything nearby/i })
    if (await askBox.count()) {
      await askBox.fill("cheap dinner near me that's open now")
      await r.inspectDOM('2-query-typed')
      await r.tap(r.page.getByRole('button', { name: 'Send', exact: true }), 'Send query')
      await r.page.waitForTimeout(2500)
      await r.inspectDOM('3-results-received')
    }
  },
)

// 24. results + map
await runFlowSafely(
  new JourneyRunner('mei', 'results-map', 'light', 'en-IN'),
  async (r) => {
    await r.goto('/explore/browse')
    await r.inspectDOM('1-browse-list')
    const mapBtn = r.page.getByRole('button', { name: /Map view/i })
    if (await mapBtn.count()) {
      await r.tap(mapBtn, 'Toggle map view')
      await r.inspectDOM('2-map-view')
      const listBtn = r.page.getByRole('button', { name: /List view/i })
      if (await listBtn.count()) await r.tap(listBtn, 'Toggle list view')
      await r.inspectDOM('3-back-to-list')
    }
  },
)

// 25. shop page
await runFlowSafely(
  new JourneyRunner('mei', 'shop-page', 'light', 'en-IN'),
  async (r) => {
    const id = await seedShopDirect(r.page, 'Bengaluru Dosa & Chai', 'Restaurant')
    await r.goto(`/explore/s/${id}`)
    await r.inspectDOM('1-public-shop-header')
    await r.page.evaluate(() => window.scrollBy(0, 300))
    await r.inspectDOM('2-menu-and-prices')
  },
)

// 26. chat with owner
await runFlowSafely(
  new JourneyRunner('mei', 'chat-owner', 'light', 'en-IN'),
  async (r) => {
    const id = await seedShopDirect(r.page, 'Bengaluru Dosa & Chai', 'Restaurant')
    await r.goto(`/explore/s/${id}`)
    const chatBtn = r.page.getByRole('button', { name: /Chat with the shop/i })
    if (await chatBtn.count()) {
      await r.tap(chatBtn, 'Open shop chat')
      await r.inspectDOM('1-chat-opened')
      const qBox = r.page.getByLabel(/Your question/i)
      if (await qBox.count()) {
        await qBox.fill('Are vegan options available tonight?')
        const askAssistant = r.page.getByRole('button', { name: /Ask the shop assistant/i })
        if (await askAssistant.count()) {
          await r.tap(askAssistant, 'Ask assistant')
          await r.page.waitForTimeout(1500)
          await r.inspectDOM('2-instant-reply')
        }
      }
    }
  },
)

// 27. language change
await runFlowSafely(
  new JourneyRunner('mei', 'language-change', 'light', 'en-IN'),
  async (r) => {
    await r.goto('/explore/')
    const prefBtn = r.page.getByRole('button', { name: /Profile and preferences|Preferences/i })
    if (await prefBtn.count()) {
      await r.tap(prefBtn, 'Open preferences')
      await r.inspectDOM('1-preferences-sheet')
      const langSel = r.page.getByRole('combobox', { name: /Language/i })
      if (await langSel.count()) {
        await r.tap(langSel, 'Open language selector')
        await r.inspectDOM('2-language-options')
        await r.page.keyboard.press('Escape')
      }
    }
  },
)

// =========================================================================
// PERSONA 4: RAVI (40, regular customer: stamps, rescue deals, streaks)
// 360x800 phone, dark mode, English
// =========================================================================
console.log('\n--- Running Persona: Ravi (Regular customer, stamps, streaks) ---')

// 28. rescue deal
await runFlowSafely(
  new JourneyRunner('ravi', 'rescue-deal', 'dark', 'en-IN'),
  async (r) => {
    const id = await seedShopDirect(r.page, 'Central Bakery & Chai', 'Bakery')
    await r.goto(`/explore/s/${id}`)
    await r.inspectDOM('1-shop-rescue-view')
    const rescueCard = r.page.getByRole('region', { name: /Rescue deal|Leftovers/i })
    if (await rescueCard.count()) {
      await r.inspectDOM('2-rescue-card-details')
    }
  },
)

// 29. stamp/scratch card
await runFlowSafely(
  new JourneyRunner('ravi', 'stamp-scratch', 'dark', 'en-IN'),
  async (r) => {
    const id = await seedShopDirect(r.page, 'Central Bakery & Chai', 'Bakery')
    await r.goto(`/s/${id}?source=qr`)
    await r.inspectDOM('1-qr-scanned-stamp')

    const foil = r.page.getByTestId('scratch-foil')
    if (await foil.count()) {
      await foil.scrollIntoViewIfNeeded()
      const box = await foil.boundingBox()
      if (box) {
        await r.page.mouse.move(box.x + 10, box.y + 10)
        await r.page.mouse.down()
        for (let row = 0; row < 6; row++) {
          const y = box.y + 15 + (row * (box.height - 30)) / 5
          await r.page.mouse.move(box.x + (row % 2 ? 10 : box.width - 10), y, { steps: 8 })
        }
        await r.page.mouse.up()
        await r.page.waitForTimeout(1000)
      }
    }
    const reveal = r.page.getByRole('button', { name: /^Scratch card from/i })
    if ((await reveal.count()) && (await reveal.isVisible())) {
      await r.tap(reveal, 'Reveal card')
    }
    await r.inspectDOM('2-card-scratched-prize')
    const doneBtn = r.page.getByRole('button', { name: 'Done', exact: true })
    if (await doneBtn.count()) await r.tap(doneBtn, 'Done')
  },
)

// 30. passport
await runFlowSafely(
  new JourneyRunner('ravi', 'passport', 'dark', 'en-IN'),
  async (r) => {
    await r.goto('/explore/passport')
    await r.inspectDOM('1-passport-summary')
    await r.page.evaluate(() => window.scrollBy(0, 300))
    await r.inspectDOM('2-collection-sets')
    await r.page.evaluate(() => window.scrollBy(0, 400))
    await r.inspectDOM('3-neighbourhood-goal')
  },
)

// 31. streaks
await runFlowSafely(
  new JourneyRunner('ravi', 'streaks', 'dark', 'en-IN'),
  async (r) => {
    await r.goto('/explore/passport')
    const streakRegion = r.page.getByRole('region', { name: /Weekly streak/i })
    if (await streakRegion.count()) {
      await streakRegion.scrollIntoViewIfNeeded()
      await r.inspectDOM('1-streak-card')
      const freezeBtn = streakRegion.getByRole('button', { name: /Freeze next week/i })
      if (await freezeBtn.count()) {
        await r.tap(freezeBtn, 'Freeze next week')
        await r.inspectDOM('2-streak-frozen')
      }
    }
  },
)

// Write out audit data JSON
const auditPath = resolve('docs/ux/journey-audit-data.json')
await writeFile(auditPath, JSON.stringify(auditResults, null, 2))
console.log(`\nAudit completed! Wrote summary to ${auditPath}`)

// Shutdown
console.log('Shutting down servers and browser...')
await browser.close()
backendProcess.kill('SIGINT')
frontendProcess.kill('SIGINT')

// Clean up raw dir
const leftover = await readdir(rawVideoDir).catch(() => [])
for (const file of leftover) {
  await rm(join(rawVideoDir, file), { force: true })
}
await rm(rawVideoDir, { recursive: true, force: true })

console.log('All journeys walked and recorded successfully!')
process.exit(0)
