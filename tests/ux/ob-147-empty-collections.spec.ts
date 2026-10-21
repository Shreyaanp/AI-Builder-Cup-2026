import { expect, test } from '@playwright/test'
import { THEMES, VIEWPORTS } from './rules.ts'

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    for (const tab of ['saved', 'chats'] as const) {
      test(`OB-147 ${tab} action stays reachable · ${viewport.width} · ${theme}`, async ({
        page,
      }, info) => {
        await page.setViewportSize(viewport)
        await page.route('**/*', (route) =>
          ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
            ? route.fallback()
            : route.abort(),
        )
        await page.addInitScript((appearance) => {
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
          localStorage.setItem('chalkboard.customer.journey', 'done')
        }, theme)
        const session = await page.request.post('/api/v1/customer/session', {
          data: { name: 'Neighbour' },
        })
        expect(session.ok()).toBeTruthy()
        await page.goto(`/explore/${tab}`)
        const action = page.getByRole('main').getByRole('link', { name: 'Find shops', exact: true })
        await expect(action).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const button = await action.boundingBox()
        const nav = await page.locator('nav.c-nav').boundingBox()
        expect(button).not.toBeNull()
        expect(nav).not.toBeNull()
        expect(button!.height).toBeGreaterThanOrEqual(48)
        expect(button!.x).toBeGreaterThanOrEqual(16)
        expect(button!.x + button!.width).toBeLessThanOrEqual(viewport.width - 16)
        expect(button!.y + button!.height).toBeLessThanOrEqual(nav!.y - 16)
        if (viewport.width < 600) {
          expect(button!.y).toBeGreaterThanOrEqual((viewport.height * 2) / 3)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        )
        await action.focus()
        await expect(action).toBeFocused()
        await page.screenshot({ path: info.outputPath(`${tab}-${theme}.png`) })
        await action.press('Enter')
        await expect(page).toHaveURL(/\/explore\/$/)
        await expect(page.locator('nav.c-nav [aria-current="page"]')).toHaveAttribute(
          'href',
          '/explore/',
        )
      })
    }
  }
}
