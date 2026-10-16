/* global document, innerWidth, innerHeight, getComputedStyle */
import { AxeBuilder } from '@axe-core/playwright'
import { writeFile } from 'node:fs/promises'

export async function capture(page, directory, name) {
  await page.evaluate(() => document.fonts.ready)
  const loadedFonts = await page.evaluate(() =>
    [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family),
  )
  if (!loadedFonts.some((font) => font.includes('Google Sans Flex')))
    throw new Error('Brand font did not load; this screenshot is not valid typography evidence.')
  await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' })
  const metrics = await page.evaluate(() => {
    const width = innerWidth,
      height = innerHeight
    const candidates = [
      ...document.querySelectorAll(
        'h1,h2,h3,p,li,button,a,input,textarea,[role="button"],[role="status"],[role="alert"],.MuiCard-root',
      ),
    ]
    const elements = candidates.flatMap((el) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el)
      if (
        r.width < 2 ||
        r.height < 2 ||
        r.bottom <= 0 ||
        r.top >= height ||
        r.right <= 0 ||
        r.left >= width ||
        s.visibility === 'hidden' ||
        s.display === 'none' ||
        Number(s.opacity) === 0 ||
        el.closest('[aria-hidden="true"],[inert]')
      )
        return []
      const x = Math.max(0, r.x),
        y = Math.max(0, r.y)
      const w = Math.min(width, r.right) - x,
        h = Math.min(height, r.bottom) - y
      const hit = document.elementFromPoint(x + w / 2, y + h / 2)
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) return []
      return [
        {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          x,
          y,
          w,
          h,
          background: s.backgroundColor,
          color: s.color,
          font: parseFloat(s.fontSize),
          gap: s.gap,
          spacing: [
            s.paddingTop,
            s.paddingRight,
            s.paddingBottom,
            s.paddingLeft,
            s.rowGap,
            s.columnGap,
          ]
            .map(parseFloat)
            .filter(Number.isFinite),
          target: el.matches('button,a,input,textarea,[role="button"]'),
        },
      ]
    })
    const grid = Array.from({ length: 12 }, () => Array(6).fill(0))
    for (const e of elements)
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 6; x++) {
          if (
            e.x < ((x + 1) * width) / 6 &&
            e.x + e.w > (x * width) / 6 &&
            e.y < ((y + 1) * height) / 12 &&
            e.y + e.h > (y * height) / 12
          )
            grid[y][x]++
        }
    const accents = new Map()
    for (const e of elements) {
      const rgb = e.background.match(/[\d.]+/g)?.map(Number)
      if (!rgb || (rgb.length === 4 && rgb[3] < 0.5)) continue
      const max = Math.max(...rgb.slice(0, 3)),
        min = Math.min(...rgb.slice(0, 3))
      if (max - min < 45) continue
      const d = max - min,
        [r, g, b] = rgb
      const hue =
        ((max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d) * 60 + 360) % 360
      const bin = Math.round(hue / 30) * 30
      accents.set(bin, (accents.get(bin) || 0) + 1)
    }
    const spacing = elements.flatMap((e) => e.spacing).filter((v) => v > 0)
    return {
      viewport: { width, height },
      horizontalOverflow: document.documentElement.scrollWidth > width + 1,
      visibleElements: elements.length,
      elementsPer100kPixels: +((elements.length / (width * height)) * 100000).toFixed(2),
      accentHueBins: Object.fromEntries(accents),
      competingAccents: accents.size,
      spacingOn4pxRhythm: spacing.length
        ? +(
            spacing.filter((v) => Math.abs(v / 4 - Math.round(v / 4)) < 0.05).length /
            spacing.length
          ).toFixed(3)
        : null,
      smallTargets: elements.filter((e) => e.target && (e.w < 44 || e.h < 44)),
      grid,
      elements,
    }
  })
  const { violations, incomplete } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const result = {
    recordingViewport: page.viewportSize(),
    ...metrics,
    loadedFonts: [...new Set(loadedFonts)],
    method:
      'DOM viewport density proxy; overlapping parent/child elements count separately. Not eye tracking or a medical eye-strain measurement.',
    contrast: {
      violations: violations.filter((v) => v.id.includes('contrast')),
      manualReview: incomplete.filter((v) => v.id.includes('contrast')),
    },
    accessibility: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  }
  await writeFile(`${directory}/${name}.json`, JSON.stringify(result, null, 2))
  const { width, height } = metrics.viewport
  const maximum = Math.max(1, ...metrics.grid.flat())
  const cells = metrics.grid
    .flatMap((row, y) =>
      row.map(
        (count, x) =>
          `<rect x="${(x * width) / 6}" y="${(y * height) / 12}" width="${width / 6}" height="${height / 12}" fill="red" opacity="${(0.55 * count) / maximum}"/><text x="${((x + 0.5) * width) / 6}" y="${((y + 0.5) * height) / 12}" fill="black" stroke="white" paint-order="stroke" stroke-width="3" text-anchor="middle" font-size="18">${count}</text>`,
      ),
    )
    .join('')
  await writeFile(
    `${directory}/${name}-heatmap.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 48}" viewBox="0 0 ${width} ${height + 48}" role="img" aria-label="DOM density heatmap, not eye tracking"><image href="${name}.png" width="${width}" height="${height}"/>${cells}<rect y="${height}" width="${width}" height="48" fill="white"/><text x="8" y="${height + 20}" font-size="13">DOM density proxy · red = more elements</text><text x="8" y="${height + 38}" font-size="13">Accents ${metrics.competingAccents} · 4px rhythm ${metrics.spacingOn4pxRhythm} · contrast issues ${result.contrast.violations.length}</text></svg>`,
  )
  return {
    name,
    visibleElements: metrics.visibleElements,
    competingAccents: metrics.competingAccents,
    spacingOn4pxRhythm: metrics.spacingOn4pxRhythm,
    overflow: metrics.horizontalOverflow,
    contrastViolations: result.contrast.violations.length,
    manualContrast: result.contrast.manualReview.length,
    accessibilityViolations: result.accessibility.length,
    smallTargets: metrics.smallTargets.length,
  }
}
