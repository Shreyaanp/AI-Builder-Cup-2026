import { expect, test, type Page } from '@playwright/test'

// OB-31: one logo and one primary button style on every front door and app.
// OB-61: on desktop the trust block ends where the phone video ends (no empty space beside it).
test.setTimeout(60_000)

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `brand-${info.testId}` })
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
})

const styles = (page: Page) =>
  page.evaluate(() => {
    const pick = (el: Element | null, keys: string[]) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      return Object.fromEntries(keys.map((k) => [k, (cs as unknown as Record<string, string>)[k]]))
    }
    const mark = document.querySelector('[data-brand-mark]')
    const name = document.querySelector('[data-brand-name]')
    const button = document.querySelector('.MuiButton-contained:not(.Mui-disabled)')
    const size = button?.className.match(/MuiButton-size(Small|Medium|Large)\b/)?.[1] ?? 'none'
    return {
      mark: pick(mark, ['width', 'height', 'backgroundColor', 'borderRadius']),
      name: pick(name, ['fontSize', 'fontWeight', 'letterSpacing', 'fontFamily']),
      nameText: name?.textContent,
      button: pick(button, ['borderRadius', 'backgroundColor', 'fontFamily', 'height']),
      size,
    }
  })

const pages: [string, string][] = [
  ['landing', '/landing-preview'],
  ['business sign-in', '/'],
  ['owner app', '/demo'],
  ['customer app', '/explore/saved'],
]

for (const mode of ['light', 'dark'] as const) {
  test(`OB-31 the logo and the primary button look the same everywhere (${mode})`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone first; the desktop check is below')
    await page.addInitScript(
      (m) =>
        localStorage.setItem(
          'niva.starter.preferences',
          JSON.stringify({ language: 'en', appearance: m }),
        ),
      mode,
    )
    // Colours are read after the 150ms button transitions, never in the middle of one.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const seen: Record<string, Awaited<ReturnType<typeof styles>>> = {}
    for (const [label, path] of pages) {
      await page.goto(path)
      await page.locator('[data-brand-mark]').first().waitFor()
      await page.locator('.MuiButton-contained').first().waitFor()
      await page.waitForTimeout(400)
      seen[label] = await styles(page)
    }
    const [first, ...rest] = Object.values(seen)
    for (const other of rest) {
      expect(other.mark).toEqual(first.mark)
      expect(other.button?.borderRadius).toBe(first.button?.borderRadius)
      expect(other.button?.backgroundColor).toBe(first.button?.backgroundColor)
      expect(other.button?.fontFamily).toBe(first.button?.fontFamily)
    }
    // The wordmark is shown on the front doors; the apps keep only the mark on a phone.
    expect(seen['landing'].name).toEqual(seen['business sign-in'].name)
    expect(seen['landing'].nameText).toBe('Chalkboard')
    expect(seen['business sign-in'].nameText).toBe('Chalkboard')
    // Same size class, same height.
    const heights = new Map<string, string>()
    for (const s of Object.values(seen)) {
      const known = heights.get(s.size)
      if (known) expect(s.button?.height).toBe(known)
      else heights.set(s.size, s.button?.height ?? '')
    }
  })
}

test('OB-61 desktop: the trust block ends within 48px of the video', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop layout')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/landing-preview')
  const videos = page.locator('.l2-pair .l2-videos')
  const trust = page.locator('.l2-pair .l2-trust-col')
  await videos.scrollIntoViewIfNeeded()
  const v = await videos.boundingBox()
  const t = await trust.boundingBox()
  expect(Math.abs(v!.y + v!.height - (t!.y + t!.height))).toBeLessThanOrEqual(48)
  // They really are side by side.
  expect(t!.x).toBeGreaterThan(v!.x + v!.width - 1)
})
