import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * Attention / density audit of every customer screen (owner request, 16 Oct): what the eye
 * meets in the first viewport. Each run saves a screenshot with a density overlay and the
 * numbers behind it; scripts/heatmap-report.mjs turns them into docs/qa/customer-heatmap.md.
 *
 * HEATMAP_LABEL=before|after names the run. Servers must already be running (see config).
 */
const label = process.env.HEATMAP_LABEL ?? 'after'
const out = 'docs/qa/heatmap'
const api = `http://127.0.0.1:${process.env.API_PORT ?? 3300}`
const AREA = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }

type Screen = {
  name: string
  signedIn?: boolean
  firstRun?: boolean
  open: (page: Page) => Promise<void>
}

async function demoShop(page: Page) {
  const receipt = await (
    await page.request.post(`${api}/api/v1/demo/world`, {
      data: { ...AREA, place: AREA.label, currency: 'SGD', timezone: 'Asia/Singapore' },
    })
  ).json()
  expect(receipt.shop_ids.length, 'run the backend with DEMO_WORLD_ENABLED=true').toBeGreaterThan(0)
  return receipt.shop_ids[0] as string
}

async function askFor(page: Page, text: string) {
  const box = page.locator('main').getByRole('textbox').first()
  await box.fill(text)
  await box.press('Enter')
  await expect(page.locator('main a[href^="/explore/s/"]').first()).toBeVisible({
    timeout: 20_000,
  })
}

const screens: Screen[] = [
  {
    name: 'welcome',
    firstRun: true,
    open: async (page) => {
      await page.goto('/explore/')
      await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible()
    },
  },
  {
    name: 'ask',
    open: async (page) => {
      await page.goto('/explore/')
      await expect(page.locator('main').getByRole('textbox').first()).toBeVisible()
      await page.waitForTimeout(1200)
    },
  },
  {
    name: 'ask-results',
    open: async (page) => {
      await page.goto('/explore/')
      await askFor(page, 'coffee')
      await page.waitForTimeout(1800)
    },
  },
  {
    // New in the conversation design: a follow-up answer and Today's 7 inside the thread.
    name: 'ask-followup',
    open: async (page) => {
      await page.goto('/explore/')
      await askFor(page, 'coffee')
      await page.getByRole('button', { name: 'Cheaper?' }).click()
      await expect(page.getByText('Cheapest first', { exact: true })).toBeVisible()
      await page.waitForTimeout(1800)
    },
  },
  {
    name: 'ask-today',
    open: async (page) => {
      await page.goto('/explore/')
      await page.getByRole('button', { name: /Today’s 7 near you/ }).click()
      await expect(page.getByRole('region', { name: /^Today/ })).toBeVisible()
      await page.waitForTimeout(1500)
    },
  },
  {
    name: 'shop',
    open: async (page) => {
      await page.goto(`/explore/s/${await demoShop(page)}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(800)
    },
  },
  {
    name: 'shop-chat',
    open: async (page) => {
      await page.goto(`/explore/s/${await demoShop(page)}`)
      await page.getByRole('button', { name: 'Chat with the shop' }).first().click()
      await expect(page.getByLabel('Your question')).toBeVisible()
      await page.waitForTimeout(600)
    },
  },
  {
    name: 'browse',
    open: async (page) => {
      await page.goto('/explore/browse')
      await expect(page.locator('main a[href^="/explore/s/"]').first()).toBeVisible({
        timeout: 20_000,
      })
      await page.waitForTimeout(800)
    },
  },
  {
    name: 'passport',
    signedIn: true,
    open: async (page) => {
      await page.goto('/explore/passport')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(1200)
    },
  },
  {
    name: 'chats',
    signedIn: true,
    open: async (page) => {
      const shop = await demoShop(page)
      await page.request.post(`/api/v1/customer/shops/${shop}/threads`, {
        data: { text: 'Do you have oat milk?' },
      })
      await page.goto('/explore/chats')
      await expect(page.locator('main a[href^="/explore/chats/"]').first()).toBeVisible()
      await page.waitForTimeout(600)
    },
  },
  {
    name: 'chat-thread',
    signedIn: true,
    open: async (page) => {
      const shop = await demoShop(page)
      const chat = await (
        await page.request.post(`/api/v1/customer/shops/${shop}/threads`, {
          data: { text: 'Do you have oat milk?' },
        })
      ).json()
      await page.goto(`/explore/chats/${shop}/${chat.thread.id}`)
      await expect(page.getByText('Do you have oat milk?').first()).toBeVisible()
      await page.waitForTimeout(600)
    },
  },
  {
    name: 'saved',
    signedIn: true,
    open: async (page) => {
      const shop = await demoShop(page)
      await page.request.put(`/api/v1/customer/follows/${shop}`)
      await page.goto('/explore/saved')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(800)
    },
  },
]

/** Runs in the page: numbers for the first viewport and the overlay drawn on top of it. */
function measure() {
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
  // Things the eye has to parse: text runs, images/icons and controls.
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
  // Competing accents: saturated fills by hue family, weighted by on-screen area.
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
      // Kraft-paper neutrals (very light, low chroma) are surfaces, not accents.
      if (c.s > 0.35 && c.l > 0.15 && c.l < 0.8) {
        const bucket = Math.round(c.h / 30) % 12
        hues.set(bucket, (hues.get(bucket) ?? 0) + area)
        if (/^(BUTTON|A)$/.test(el.tagName) || el.getAttribute('role') === 'button') primaries += 1
      }
    }
  }
  const accentFamilies = Array.from(hues.values()).filter((a) => a > W * H * 0.002).length
  // Spacing rhythm: padding, margin and gaps that are not on the 4/8-px grid.
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
  // Tap targets under 48 px (inline links inside running text are reported apart).
  const controls = all.filter((el) =>
    el.matches(
      'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab], [role=checkbox], [role=link]',
    ),
  )
  const small: DOMRect[] = []
  const names: string[] = []
  for (const el of controls) {
    // A text field's tap area is its whole field (MUI InputBase root), not the bare <input>.
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
  const sizes = new Set(marks.filter(ownText).map((el) => getComputedStyle(el).fontSize))
  const weights = new Set(marks.filter(ownText).map((el) => getComputedStyle(el).fontWeight))
  const busiest = Math.max(...grid)
  const busyCells = grid.filter((n) => n >= 4).length
  // Overlay: density cells (warmer = more marks per 48-px cell), small targets outlined.
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
  ctx.setLineDash([4, 3])
  ctx.lineWidth = 2
  ctx.strokeStyle = '#d6007a'
  for (const r of small) ctx.strokeRect(r.left, r.top, r.width, r.height)
  ctx.setLineDash([])
  const lines = [
    `marks ${marks.length} · words ${wordCount} · busiest cell ${busiest} · busy cells ${busyCells}`,
    `accent families ${accentFamilies} · filled actions ${primaries} · type sizes ${sizes.size}`,
    `off-grid spacing ${offGrid.length}/${spacing.length} · targets <48px ${small.length}`,
  ]
  ctx.font = '600 12px system-ui, sans-serif'
  const boxW = Math.min(W - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16)
  ctx.fillStyle = 'rgba(20,20,20,0.82)'
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
    pageHeight: document.documentElement.scrollHeight,
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const screen of screens) {
    test(`${screen.name} · ${theme}`, async ({ page }, info) => {
      await page.addInitScript(
        ({ theme, first, area }) => {
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: theme }))
          // First run: no area chosen yet, so the welcome (Use my location) shows.
          if (!first) {
            localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area }))
            localStorage.setItem('chalkboard.customer.journey', 'done')
          }
        },
        { theme, first: !!screen.firstRun, area: AREA },
      )
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.fallback()
          : route.abort(),
      )
      if (screen.signedIn)
        await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
      await screen.open(page)
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      const contrast = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const numbers = await page.evaluate(measure)
      const id = `${label}-${screen.name}-${info.project.name}-${theme}`
      mkdirSync(`${out}/data`, { recursive: true })
      await page.screenshot({ path: `${out}/${id}.jpg`, type: 'jpeg', quality: 62 })
      writeFileSync(
        `${out}/data/${id}.json`,
        JSON.stringify(
          {
            label,
            screen: screen.name,
            project: info.project.name,
            theme,
            ...numbers,
            contrastIssues: contrast.violations.reduce((n, v) => n + v.nodes.length, 0),
            axeViolations: axe.violations.map((v) => v.id),
          },
          null,
          1,
        ),
      )
    })
  }
}
