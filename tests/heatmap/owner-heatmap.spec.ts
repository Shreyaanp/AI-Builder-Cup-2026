import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const out = 'docs/qa/heatmap'

type Theme = 'light' | 'dark'
type Lang = 'en' | 'hi'

interface MeasureResult {
  marks: number
  words: number
  busiest: number
  busyCells: number
  accentFamilies: number
  filledActions: number
  typeSizes: number
  weights: number
  spacingValues: number
  offGrid: number
  offValues: string[]
  smallTargets: number
  smallNames: string[]
  horizontalOverflow: boolean
  clippedCount: number
  clippedNames: string[]
  pageHeight: number
  contrastIssues?: number
  axeViolations?: string[]
}

/** Injects density canvas overlay and computes UX attention heatmap numbers. */
function measure(): MeasureResult {
  const W = innerWidth
  const H = innerHeight
  const CELL = 48
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W)
      return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const all = Array.from(document.querySelectorAll('body *')).filter(
    (el) => !el.closest('[data-heatmap]') && visible(el),
  )

  const ownText = (el: Element) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0)
  const marks = all.filter(
    (el) => ownText(el) || /^(IMG|svg|INPUT|TEXTAREA|SELECT|CANVAS|VIDEO)$/i.test(el.tagName),
  )
  const cols = Math.ceil(W / CELL)
  const rows = Math.ceil(H / CELL)
  const grid = new Array(cols * rows).fill(0)
  for (const el of marks) {
    const r = el.getBoundingClientRect()
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((r.left + r.width / 2) / CELL)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((r.top + r.height / 2) / CELL)))
    grid[cy * cols + cx] += 1
  }

  const words = marks
    .filter(ownText)
    .map((el) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent!)
        .join(' '),
    )
    .join(' ')
    .trim()
  const wordCount = words ? words.split(/\s+/).length : 0

  const parse = (value: string) => {
    const m = value.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1]!
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number)
    return { r: r! / 255, g: g! / 255, b: b! / 255, a }
  }
  const hsl = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (d) {
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
    }
    return { h: (h * 60 + 360) % 360, s, l }
  }

  const hues = new Map<number, number>()
  let primaries = 0
  for (const el of all) {
    const s = getComputedStyle(el)
    const bg = parse(s.backgroundColor)
    const r = el.getBoundingClientRect()
    const area =
      Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0))
    if (bg && bg.a > 0.5) {
      const c = hsl(bg)
      if (c.s > 0.35 && c.l > 0.15 && c.l < 0.8) {
        const bucket = Math.round(c.h / 30) % 12
        hues.set(bucket, (hues.get(bucket) ?? 0) + area)
        if (/^(BUTTON|A)$/.test(el.tagName) || el.getAttribute('role') === 'button') primaries += 1
      }
    }
  }
  const accentFamilies = Array.from(hues.values()).filter((a) => a > W * H * 0.002).length

  const spacing: number[] = []
  for (const el of all) {
    const s = getComputedStyle(el)
    for (const key of [
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'marginTop',
      'marginBottom',
      'rowGap',
      'columnGap',
    ] as const) {
      const v = parseFloat(s[key])
      if (Number.isFinite(v) && v > 0) spacing.push(Math.round(v * 10) / 10)
    }
  }
  const offGrid = spacing.filter((v) => v % 4 !== 0)
  const offValues = Object.entries(
    offGrid.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([v, n]) => `${v}px×${n}`)

  const controls = all.filter((el) =>
    el.matches(
      'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab], [role=checkbox], [role=link]',
    ),
  )
  const small: DOMRect[] = []
  const names: string[] = []
  for (const el of controls) {
    const field = el.matches('input, textarea') ? el.closest('.MuiInputBase-root') : null
    const r = (field ?? el).getBoundingClientRect()
    const inline = getComputedStyle(el).display === 'inline' && el.closest('p')
    if (inline) continue
    if (r.width < 47.5 || r.height < 47.5) {
      small.push(r)
      names.push(
        `${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28)}” ${Math.round(r.width)}×${Math.round(r.height)}`,
      )
    }
  }

  // Check clipped / truncated content
  const clipped: string[] = []
  for (const el of all) {
    const s = getComputedStyle(el)
    if (s.overflow === 'hidden' || s.textOverflow === 'ellipsis') {
      if (el.scrollWidth > el.clientWidth + 2) {
        clipped.push(
          `${el.tagName.toLowerCase()} “${(el.textContent ?? '').trim().slice(0, 24)}” (+${Math.round(el.scrollWidth - el.clientWidth)}px)`,
        )
      }
    }
  }

  const sizes = new Set(marks.filter(ownText).map((el) => getComputedStyle(el).fontSize))
  const weights = new Set(marks.filter(ownText).map((el) => getComputedStyle(el).fontWeight))
  const busiest = Math.max(...grid)
  const busyCells = grid.filter((n) => n >= 4).length
  const horizontalOverflow = document.documentElement.scrollWidth > W + 1

  // Draw overlay canvas
  const layer = document.createElement('canvas')
  layer.dataset.heatmap = ''
  layer.width = W
  layer.height = H
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  })
  const ctx = layer.getContext('2d')!
  grid.forEach((n, i) => {
    if (!n) return
    const x = (i % cols) * CELL
    const y = Math.floor(i / cols) * CELL
    const t = Math.min(n / 6, 1)
    ctx.fillStyle = `hsla(${50 - t * 50}, 100%, 50%, ${0.12 + t * 0.38})`
    ctx.fillRect(x, y, CELL, CELL)
  })

  // Dashed magenta boxes for targets < 48 px
  ctx.setLineDash([4, 3])
  ctx.lineWidth = 2
  ctx.strokeStyle = '#d6007a'
  for (const r of small) ctx.strokeRect(r.left, r.top, r.width, r.height)
  ctx.setLineDash([])

  const lines = [
    `marks ${marks.length} · words ${wordCount} · busiest cell ${busiest} · busy cells ${busyCells}`,
    `accent families ${accentFamilies} · filled actions ${primaries} · type sizes ${sizes.size}`,
    `off-grid spacing ${offGrid.length}/${spacing.length} · targets <48px ${small.length}${horizontalOverflow ? ' · OVERFLOW' : ''}`,
  ]
  ctx.font = '600 12px system-ui, sans-serif'
  const boxW = Math.min(W - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16)
  ctx.fillStyle = 'rgba(20,20,20,0.85)'
  ctx.fillRect(8, H - 8 - lines.length * 16 - 10, boxW, lines.length * 16 + 10)
  ctx.fillStyle = '#fff'
  lines.forEach((l, i) => ctx.fillText(l, 16, H - 8 - (lines.length - i) * 16 + 8, boxW - 16))
  document.body.appendChild(layer)

  return {
    marks: marks.length,
    words: wordCount,
    busiest,
    busyCells,
    accentFamilies,
    filledActions: primaries,
    typeSizes: sizes.size,
    weights: weights.size,
    spacingValues: spacing.length,
    offGrid: offGrid.length,
    offValues,
    smallTargets: small.length,
    smallNames: names.slice(0, 8),
    horizontalOverflow,
    clippedCount: clipped.length,
    clippedNames: clipped.slice(0, 8),
    pageHeight: document.documentElement.scrollHeight,
  }
}

async function removeHeatmapLayer(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-heatmap]').forEach((el) => el.remove())
  })
}

async function auditAndCapture(
  page: Page,
  screenName: string,
  vp: string,
  theme: Theme,
  lang: Lang,
) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  await page.waitForTimeout(300)

  // Accessibility & contrast audit before drawing overlay
  const contrast = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

  const numbers = await page.evaluate(measure)
  const id = `owner-${screenName}-${vp}-${theme}-${lang}`
  mkdirSync(`${out}/data`, { recursive: true })

  await page.screenshot({ path: `${out}/${id}.jpg`, type: 'jpeg', quality: 65 })
  await removeHeatmapLayer(page)

  const payload: MeasureResult & {
    label: string
    screen: string
    viewport: string
    theme: string
    lang: string
    contrastIssues: number
    axeViolations: string[]
  } = {
    label: 'owner',
    screen: screenName,
    viewport: vp,
    theme,
    lang,
    ...numbers,
    contrastIssues: contrast.violations.reduce((n, v) => n + v.nodes.length, 0),
    axeViolations: axe.violations.map((v) => v.id),
  }

  writeFileSync(`${out}/data/${id}.json`, JSON.stringify(payload, null, 1))
  return payload
}

async function enterAndSeed(page: Page) {
  await page.goto('/')

  const previewBtn = page
    .getByRole('button', {
      name: /Continue local preview|Get started|स्थानीय प्रीव्यू|स्थानीय पूर्वावलोकन|शुरू करें/i,
    })
    .first()
  await previewBtn.click()

  const terms = page.getByRole('checkbox').first()
  try {
    await terms.waitFor({ state: 'visible', timeout: 4000 })
    await page.getByRole('checkbox').nth(0).check()
    await page.getByRole('checkbox').nth(1).check()
    await page
      .getByRole('button', {
        name: /Agree and continue|सहमत होकर आगे बढ़ें|सहमत हों और जारी रखें/i,
      })
      .click()
  } catch {
    // Already accepted
  }

  // Seed shop via relative API path using authenticated session cookies
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: {
        name: 'Asha Bakery & Chai',
        category: 'Cafe',
        location: 'Indiranagar, Bengaluru',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        halal: 'yes',
        locally_made: true,
        phone: '+91 98450 12345',
        payment_methods: ['UPI', 'cash'],
        delivery: 'Swiggy',
        weekly_hours: [{ day: 'thu', open: '07:00', close: '20:00', closed: false }],
        reward_text: 'Your eighth chai is free',
        stamps_needed: 8,
      },
      products: [
        { name: 'Masala Chai', price: 2000, unit: 'cup', category: 'Beverages', available: true },
        { name: 'Filter Coffee', price: 2500, unit: 'cup', category: 'Beverages', available: true },
        { name: 'Bun Maska', price: 3500, unit: 'piece', category: 'Bakery', available: true },
        { name: 'Veg Puff', price: 3000, unit: 'piece', category: 'Bakery', available: false },
        { name: 'Samosa', price: 1500, unit: 'piece', category: 'Snacks', available: true },
      ],
    },
  })

  if (prepared.ok()) {
    const proposal = await prepared.json()
    const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
    const { business_id: id } = await approved.json()
    if (id) {
      for (const back of [1, 2]) {
        const d = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
        const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
          data: { date: d, sales: [{ item: 'Masala Chai', quantity: 25, amount: 50000 }] },
        })
        if (day.ok()) {
          const { sales } = await day.json()
          if (sales?.import_id) {
            await page.request.post(
              `/api/v1/businesses/${id}/import/${sales.import_id}/approve`,
              { data: { digest: sales.digest } },
            )
          }
        }
      }
    }
    await page.reload()
    const reloadBtn = page
      .getByRole('button', {
        name: /Continue local preview|Get started|स्थानीय प्रीव्यू|स्थानीय पूर्वावलोकन|शुरू करें/i,
      })
      .first()
    await reloadBtn.click()
  }

  await expect(page.locator('[data-tour="nav-coach"]')).toBeVisible({ timeout: 15_000 })
}

const THEMES: Theme[] = ['light', 'dark']
const LANGS: Lang[] = ['en', 'hi']

for (const theme of THEMES) {
  for (const lang of LANGS) {
    test(`Owner UX Heatmap · ${theme} · ${lang}`, async ({ page }, info) => {
      test.setTimeout(240_000)
      const vp = info.project.name.replace('phone-', '')

      await page.addInitScript(
        ({ theme, lang }) => {
          localStorage.setItem(
            'niva.starter.preferences',
            JSON.stringify({ appearance: theme, language: lang }),
          )
          navigator.mediaDevices.getUserMedia = async () => {
            const audio = new AudioContext()
            const destination = audio.createMediaStreamDestination()
            audio.createOscillator().connect(destination)
            return destination.stream
          }
        },
        { theme, lang },
      )

      await page.routeWebSocket('**/api/v1/voice*', (socket) => {
        socket.send(JSON.stringify({ kind: 'ready', mode: 'offline' }))
      })

      await enterAndSeed(page)

      // 1. Screen: Today
      await auditAndCapture(page, 'today', vp, theme, lang)

      // 2. Screen: Coach chat
      const chatInput = page.locator('main textarea').first()
      if (await chatInput.isVisible()) {
        await chatInput.fill('Analyse my forecast and sales')
        const sendBtn = page.getByRole('button', { name: /Send|भेजें/i }).first()
        if (await sendBtn.isVisible()) {
          await sendBtn.click()
          await page.waitForTimeout(1800)
        }
      }
      await auditAndCapture(page, 'coach-chat', vp, theme, lang)

      // 3. Screen: Shop
      await page.locator('[data-tour="nav-shop"]').click()
      await expect(page.locator('[data-tour="menu"]')).toBeVisible({ timeout: 8000 })
      await auditAndCapture(page, 'shop', vp, theme, lang)

      // 4. Screen: Shop Menu
      await page.locator('[data-tour="menu"]').click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })
      await page.waitForTimeout(500)
      await auditAndCapture(page, 'shop-menu', vp, theme, lang)

      // 5. Screen: Shop Photo Import (inside Menu)
      const importBtn = page.locator('button[aria-controls="import-panel"], button[aria-label*="import" i], button:has-text("Import"), button:has-text("आयात")').first()
      if (await importBtn.isVisible()) {
        await importBtn.click()
        await page.waitForTimeout(500)
        await auditAndCapture(page, 'shop-photo-import', vp, theme, lang)
      }

      // 6. Screen: Dialog Edit Item
      const addProd = page.getByRole('button', { name: /Add item|Add product|सामान जोड़ें|उत्पाद जोड़ें/i }).first()
      if (await addProd.isVisible()) {
        await addProd.click()
        await page.waitForTimeout(500)
        await auditAndCapture(page, 'dialog-edit-item', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
      }

      // Close Menu sheet
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)

      // 7. Screen: Shop Connect
      const connectTile = page.locator('button:has-text("Connect your system"), button:has-text("अपना सिस्टम जोड़ें")').first()
      if (await connectTile.isVisible()) {
        await connectTile.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })
        await page.waitForTimeout(500)
        await auditAndCapture(page, 'shop-connect', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }

      // 8. Screen: Grow (overview with all cards)
      await page.locator('[data-tour="nav-grow"]').click()
      await expect(page.locator('[data-testid="grow-tiles"]')).toBeVisible({ timeout: 8000 })
      await auditAndCapture(page, 'grow', vp, theme, lang)

      // 9. Screen: Grow - Payments & Rides
      const payCard = page.locator('button:has-text("Payments & rides"), button:has-text("भुगतान")').first()
      if (await payCard.isVisible()) {
        await payCard.click()
        await page.waitForTimeout(700)
        await auditAndCapture(page, 'grow-payments', vp, theme, lang)
        await page.locator('[data-tour="nav-grow"]').click()
        await page.waitForTimeout(400)
      }

      // 10. Screen: Grow - Purchase orders
      const orderCard = page.locator('button:has-text("Purchase orders"), button:has-text("Orders"), button:has-text("ऑर्डर")').first()
      if (await orderCard.isVisible()) {
        await orderCard.click()
        await page.waitForTimeout(600)
        await auditAndCapture(page, 'grow-purchase-orders', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }

      // 11. Screen: Grow - Your week / Week pulse
      const weekCard = page.locator('button:has-text("Your week"), button:has-text("Week pulse"), button:has-text("हफ़्ते"), button:has-text("हफ़्ता")').first()
      if (await weekCard.isVisible()) {
        await weekCard.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })
        await page.waitForTimeout(600)
        await auditAndCapture(page, 'grow-your-week', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }

      // 12. Screen: Grow - Rescue deals
      const rescueCard = page.locator('button:has-text("Rescue deals"), button:has-text("बचे माल")').first()
      if (await rescueCard.isVisible()) {
        await rescueCard.click()
        await page.waitForTimeout(600)
        await auditAndCapture(page, 'grow-rescue', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }

      // 13. Screen: Close the day
      const closeDayCard = page.locator('button:has-text("Close the day"), button:has-text("दिन बंद करें"), button:has-text("दिन का समापन")').first()
      if (await closeDayCard.isVisible()) {
        await closeDayCard.click()
        await page.waitForTimeout(600)
        await auditAndCapture(page, 'close-day', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }

      // 14. Screen: You
      await page.locator('[data-tour="nav-you"]').click()
      await page.waitForTimeout(600)
      await auditAndCapture(page, 'you', vp, theme, lang)

      // 15. Screen: Face check (from You)
      const verifyBtn = page.locator('button:has(svg.lucide-scan-face), button:has-text("Verify"), button:has-text("पुष्टि")').first()
      if (await verifyBtn.isVisible()) {
        await verifyBtn.click()
        await page.waitForTimeout(600)
        await auditAndCapture(page, 'face-check', vp, theme, lang)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }

      // 16. Screen: Playbook (via You -> Privacy / Your data)
      const privacyRow = page.locator('button:has(svg.lucide-shield-check), button:has-text("Privacy"), button:has-text("गोपनीयता")').first()
      if (await privacyRow.isVisible()) {
        await privacyRow.click()
        await page.waitForTimeout(600)
        const playbookBtn = page.locator('[data-testid="playbook-open"]').first()
        if (await playbookBtn.isVisible()) {
          await playbookBtn.click()
          await expect(page.locator('[data-testid="playbook"]')).toBeVisible({ timeout: 8000 })
          await page.waitForTimeout(600)
          await auditAndCapture(page, 'playbook', vp, theme, lang)
          await page.keyboard.press('Escape')
          await page.waitForTimeout(400)
        }
        await page.locator('[data-tour="nav-you"]').click()
        await page.waitForTimeout(400)
      }
    })
  }
}
