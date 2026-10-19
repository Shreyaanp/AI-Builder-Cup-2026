import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { lastContentClears, measure } from './measure.ts'
import {
  MAX_FONT_SIZES,
  SPACING_DEFAULT_SHARE,
  SPACING_SLACK,
  THEMES,
  VIEWPORTS,
  type Violation,
} from './rules.ts'
import { SCREENS } from './screens.ts'

/**
 * UX gate (OB-63). Each test opens one screen at one size in one theme and checks the rules in
 * rules.ts. Findings listed in allowlist.json (screen:rule -> OB number) are known; anything else
 * fails the PR. Counts in baseline.json (off-grid spacing, font sizes) may only fall.
 * UX_RECORD=1 never fails and writes test-results/ux/*.json for scripts/ux-record.mjs.
 */
const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8')) as T
const allowlist = read<Record<string, string>>('./allowlist.json')
const baseline = read<Record<string, { spacingOff: number; fonts: number }>>('./baseline.json')
const record = process.env.UX_RECORD === '1'

for (const theme of THEMES) {
  for (const screen of SCREENS) {
    for (const size of VIEWPORTS) {
      const phone = size.width < 600
      const key = `${screen.name}|${size.width}x${size.height}|${theme}`
      test(`${screen.name} · ${size.width}×${size.height} · ${theme}`, async ({ browser }) => {
        const use = test.info().project.use
        const context = await browser.newContext({
          storageState: use.storageState,
          baseURL: use.baseURL,
          viewport: size,
          isMobile: phone,
          hasTouch: phone,
          locale: 'en-SG',
          timezoneId: 'Asia/Singapore',
          reducedMotion: 'reduce',
        })
        try {
          const page = await context.newPage()
          await page.addInitScript((appearance) => {
            localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
            localStorage.setItem('chalkboard.customer.journey', 'done')
            // The demo's tour offer: measure the tabs, not the offer sheet over them.
            sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
          }, theme)
          await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ux-${Math.random()}` })
          await page.route('**/*', (route) =>
            ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
              ? route.fallback()
              : route.abort(),
          )
          if (screen.signedIn)
            await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
          await screen.open(page)

          const found: Violation[] = []
          const m = await page.evaluate(measure, phone)
          for (const d of m.overflow) found.push({ rule: 'overflow', detail: d })
          for (const d of m.targets) found.push({ rule: 'target', detail: d })
          for (const d of m.overlap) found.push({ rule: 'overlap', detail: d })
          for (const d of m.primary) found.push({ rule: 'primary', detail: d })
          if (phone) {
            await page.evaluate(() => {
              const roots = [
                document.scrollingElement,
                ...Array.from(document.querySelectorAll('main')),
              ]
              for (const el of roots) el?.scrollTo(0, 1e6)
            })
            await page.waitForTimeout(200)
            for (const d of await page.evaluate(lastContentClears))
              found.push({ rule: 'overlap', detail: d })
          }
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
          for (const v of axe.violations)
            found.push({
              rule: 'axe',
              detail: `${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ').slice(0, 60)}`,
            })

          // Counts: compared with the committed baseline (default thresholds for a new screen).
          const base = baseline[key]
          const maxOff = base
            ? base.spacingOff + SPACING_SLACK
            : Math.ceil(m.spacingTotal * SPACING_DEFAULT_SHARE)
          if (m.spacingOff > maxOff)
            found.push({
              rule: 'spacing',
              detail: `${m.spacingOff}/${m.spacingTotal} off the 4-px grid (limit ${maxOff}): ${m.spacingValues.join(', ')}`,
            })
          const maxFonts = Math.max(MAX_FONT_SIZES, base?.fonts ?? 0)
          if (m.fontSizes.length > maxFonts)
            found.push({
              rule: 'fonts',
              detail: `${m.fontSizes.length} sizes (limit ${maxFonts}): ${m.fontSizes.join(', ')}`,
            })

          const ruleId = (f: Violation) =>
            f.rule === 'axe'
              ? `${screen.name}:axe:${f.detail.split(' ')[0]}`
              : `${screen.name}:${f.rule}`
          mkdirSync('test-results/ux', { recursive: true })
          writeFileSync(
            `test-results/ux/${key.replaceAll('|', '_')}.json`,
            JSON.stringify({
              key,
              screen: screen.name,
              spacingOff: m.spacingOff,
              fonts: m.fontSizes.length,
              found: found.map((f) => ({ ...f, id: ruleId(f) })),
            }),
          )

          expect(m.spacingTotal, `${key} did not render`).toBeGreaterThan(20)
          const fresh = found.filter((f) => !allowlist[ruleId(f)])
          if (!record)
            expect(
              fresh.map((f) => `${f.rule}: ${f.detail}`),
              `New UX problems on ${key}. Fix them, or (for an old problem) add ${[...new Set(fresh.map(ruleId))].join(', ')} to tests/ux/allowlist.json with an OB number.`,
            ).toEqual([])
        } finally {
          await context.close()
        }
      })
    }
  }
}
