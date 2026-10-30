import { expect, test } from '@playwright/test'
import { VIEWPORTS, THEMES } from './ux/rules.js'
import { nivaTheme, shape } from '../src/design/theme.js'
import { measure } from './ux/measure.js'

test('OB-89 shared cards keep one shape and no decorative elevation', () => {
  for (const mode of THEMES)
    for (const audience of ['owner', 'customer'] as const) {
      const card = nivaTheme(mode, undefined, audience).components!.MuiCard!
      expect(card.defaultProps?.elevation).toBe(0)
      expect(card.styleOverrides?.root).toEqual({
        borderRadius: shape.lgIncreased,
        backgroundImage: 'none',
      })
    }
})

const pages = [
  ['landing', '/?app=landing', 'header'],
  ['landing-preview', '/?app=landing&landing=new', 'header'],
  ['how', '/how-it-works', 'header'],
  ['features', '/features', 'header'],
  ['sign-in', '/?app=business', 'header'],
  ['owner', '/demo?tab=shop', 'header[data-app-header]'],
  ['ask', '/explore/', 'main > div > :first-child'],
  ['browse', '/explore/browse', 'header'],
  ['saved', '/explore/saved', 'header'],
  ['chats', '/explore/chats', 'header'],
  ['passport', '/explore/passport', 'header'],
  ['shop', '/explore/s/demo-story-bengaluru-chai', 'main > :first-child'],
] as const

for (const theme of THEMES)
  for (const viewport of VIEWPORTS)
    test.describe(`${viewport.width} ${theme}`, () => {
      test.use({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 })
      test(`OB-89 OB-172 shared headers ${viewport.width} ${theme}`, async ({ page }) => {
        test.setTimeout(120_000)
        await page.setViewportSize(viewport)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.route('**/*', (route) =>
          ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
            ? route.continue()
            : route.abort(),
        )
        await page.addInitScript((appearance) => {
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
          localStorage.setItem('chalkboard.customer.journey', 'done')
          sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
        }, theme)
        const session = await page.request.post('/api/v1/customer/session', {
          data: { name: 'Neighbour' },
        })
        expect(session.ok()).toBe(true)
        const threadResponse = await page.request.post(
          '/api/v1/customer/shops/demo-story-bengaluru-chai/threads',
          { data: { text: 'Are you open today?' } },
        )
        expect(threadResponse.ok()).toBe(true)
        const chat = await threadResponse.json()
        const screens = [
          ...pages,
          ['thread', `/explore/chats/demo-story-bengaluru-chai/${chat.thread.id}`, 'header'],
        ]
        for (const [name, path, selector] of screens) {
          await page.goto(path)
          const header = page.locator(selector).first()
          await expect(header).toBeVisible({ timeout: 20_000 })
          if (name === 'owner')
            await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          if (name === 'landing') {
            // The theme's body size: 15px on phones since OB-198, 16px on larger windows.
            await expect(page.locator('.lp-hero-phone .lp-review small')).toHaveCSS(
              'font-size',
              viewport.width < 600 ? '15px' : '16px',
            )
            if (viewport.width === 360) {
              const firstView = await page.evaluate(measure, true)
              expect(
                firstView.fontSizes.length,
                'OB-89: no extra first-view type size',
              ).toBeLessThanOrEqual(6)
            }
          }
          // OB-88/OB-146: Ask keeps the area and controls on the shared single-row baseline.
          const height = 64
          await expect(header, name).toHaveCSS('height', `${height}px`)
          // The separator never contributes an extra pixel to the shared baseline.
          await expect(header, name).toHaveCSS('border-bottom-width', '0px')
          const strokes = await header
            .locator('svg.lucide')
            .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('stroke-width')))
          if (strokes.length)
            expect(strokes, `${name}: shared icon stroke`).toEqual(strokes.map(() => '2'))
          if (name === 'owner') {
            const title = header.locator('button[aria-haspopup="menu"] [title]')
            await expect(title).toHaveCSS('white-space', 'nowrap')
            await expect(title).toHaveAttribute('title', await title.innerText())
          }
          const targets = header.locator('button:visible, a[href]:visible')
          for (const control of await targets.all()) {
            const bounds = (await control.boundingBox())!
            expect(bounds.height, `${name}: target height`).toBeGreaterThanOrEqual(48)
            expect(bounds.width, `${name}: target width`).toBeGreaterThanOrEqual(48)
            expect(bounds.x, `${name}: left edge`).toBeGreaterThanOrEqual(0)
            expect(bounds.x + bounds.width, `${name}: right edge`).toBeLessThanOrEqual(
              viewport.width,
            )
          }
          await page.screenshot({
            path: `output/playwright/ob89/${viewport.width}-${theme}-${name}.png`,
          })
          // Safe area is added to the baseline, rather than consuming the controls' space.
          await header.evaluate((el) =>
            (el as HTMLElement).style.setProperty('--app-header-safe-top', '24px'),
          )
          await expect(header, `${name}: safe area`).toHaveCSS('height', `${height + 24}px`)
          await header.evaluate((el) =>
            (el as HTMLElement).style.removeProperty('--app-header-safe-top'),
          )
          // Larger text can grow a bar: it must never become a fixed, clipping container.
          await page.evaluate(() => (document.documentElement.style.fontSize = '32px'))
          await expect(header, `${name}: text scaling`).toHaveCSS('overflow-y', 'visible')
          for (const control of await targets.all()) {
            const bounds = (await control.boundingBox())!
            const bar = (await header.boundingBox())!
            expect(bounds.y, `${name}: scaled control top`).toBeGreaterThanOrEqual(bar.y)
            expect(bounds.y + bounds.height, `${name}: scaled control bottom`).toBeLessThanOrEqual(
              bar.y + bar.height,
            )
          }
          await page.evaluate(() => (document.documentElement.style.fontSize = ''))
        }
      })
    })
