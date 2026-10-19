export type Measured = {
  overflow: string[]
  targets: string[]
  overlap: string[]
  primary: string[]
  fontSizes: string[]
  spacingTotal: number
  spacingOff: number
  spacingValues: string[]
}

/**
 * Runs in the page (serialised by Playwright, so it must not close over anything). Reads the first
 * viewport the way tests/heatmap/customer-heatmap.spec.ts does, plus the whole page for overflow
 * and fixed-bar overlap. Returns plain findings; the spec decides what is allowed.
 */
export function measure(phone: boolean): Measured {
  const W = innerWidth
  const H = innerHeight
  const label = (el: Element) =>
    `${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28)}”`
  const shown = (el: Element) => {
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const inFirstView = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W
  }
  const everything = Array.from(document.querySelectorAll('body *')).filter(
    (el) => shown(el) && !el.closest('[aria-hidden="true"]'),
  )
  const first = everything.filter(inFirstView)
  const CONTROL =
    'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab], [role=checkbox], [role=link]'

  // Fixed bars: top/bottom nav, chat bar, banners. Sheets and dialogs cover the page on purpose.
  const bars = everything.filter((el) => {
    const s = getComputedStyle(el)
    if (s.position !== 'fixed' && s.position !== 'sticky') return false
    if (el.closest('[role=dialog], .MuiModal-root, .MuiPopover-root, .MuiBackdrop-root'))
      return false
    const r = el.getBoundingClientRect()
    return r.width >= W * 0.5 && r.height >= 24 && r.height <= H * 0.4 && r.bottom > 0 && r.top < H
  })
  const insideBar = (el: Element) => bars.some((b) => b !== el && b.contains(el))

  // 1. No horizontal overflow.
  const overflow: string[] = []
  const de = document.documentElement
  if (de.scrollWidth > W + 1) overflow.push(`page ${de.scrollWidth}px wide in ${W}px`)
  for (const el of first) {
    const r = el.getBoundingClientRect()
    if (r.right > W + 1 && !el.closest('[data-scroll-x], .MuiTabs-scroller')) {
      const ancestorClips = (() => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
        }
        return false
      })()
      if (!ancestorClips) overflow.push(`${label(el)} ends at ${Math.round(r.right)}px`)
    }
  }

  // 2. Tap targets (phones): same rule as the heatmap, first viewport.
  const targets: string[] = []
  if (phone) {
    for (const el of first.filter((e) => e.matches(CONTROL))) {
      const field = el.matches('input, textarea') ? el.closest('.MuiInputBase-root') : null
      const r = (field ?? el).getBoundingClientRect()
      if (getComputedStyle(el).display === 'inline' && el.closest('p')) continue
      if (r.width < 47.5 || r.height < 47.5)
        targets.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
  }

  // 3. Fixed bars against content: the last content must clear the bottom bar, and no control
  //    outside a bar may sit under one.
  const overlap: string[] = []
  const hit = (a: DOMRect, b: DOMRect) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
  const barRects = bars.map((b) => [b, b.getBoundingClientRect()] as const)
  for (const el of first.filter((e) => e.matches(CONTROL) && !insideBar(e))) {
    for (const [b, br] of barRects)
      if (!b.contains(el) && hit(el.getBoundingClientRect(), br))
        overlap.push(`${label(el)} under ${label(b)}`)
  }

  // 4. Primary action in the bottom half (phones): the largest filled button in the first view.
  const primary: string[] = []
  if (phone) {
    const filled = first.filter(
      (el) =>
        el.matches('button, a[href], [role=button]') &&
        !insideBar(el) &&
        !el.closest('nav, [role=tablist], [role=dialog]') &&
        (el.matches('.MuiButton-contained, .MuiFab-root') ||
          /^rgba?\((?!0, 0, 0, 0\))/.test(getComputedStyle(el).backgroundColor)) &&
        /^rgb\(/.test(getComputedStyle(el).backgroundColor) &&
        el.getBoundingClientRect().width >= 120,
    )
    const biggest = filled.sort(
      (a, b) =>
        b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height,
    )[0]
    if (biggest) {
      const r = biggest.getBoundingClientRect()
      if (r.top + r.height / 2 < H / 2)
        primary.push(`${label(biggest)} centred at ${Math.round(r.top + r.height / 2)}px of ${H}`)
    }
  }

  // 5. Font sizes among the text in the first viewport.
  const hasText = (el: Element) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0)
  const fontSizes = Array.from(
    new Set(first.filter(hasText).map((el) => getComputedStyle(el).fontSize)),
  ).sort((a, b) => parseFloat(a) - parseFloat(b))

  // 6. Spacing on the 4-px grid.
  const spacing: number[] = []
  for (const el of first) {
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
  const off = spacing.filter((v) => v % 4 !== 0)
  const counts = off.reduce<Record<string, number>>(
    (acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }),
    {},
  )
  const spacingValues = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([v, n]) => `${v}px×${n}`)

  return {
    overflow: overflow.slice(0, 6),
    targets: targets.slice(0, 20),
    overlap: overlap.slice(0, 6),
    primary,
    fontSizes,
    spacingTotal: spacing.length,
    spacingOff: off.length,
    spacingValues,
  }
}

/** Scrolled to the end: the last content must end above the bottom bar (bar height + safe area). */
export function lastContentClears(): string[] {
  const H = innerHeight
  const W = innerWidth
  const visible = (el: Element) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width >= 2 && r.height >= 2
  }
  const all = Array.from(document.querySelectorAll('body *'))
  const bars = all.filter((el) => {
    if (getComputedStyle(el).position !== 'fixed' || !visible(el)) return false
    if (el.closest('[role=dialog], .MuiModal-root, .MuiPopover-root, .MuiBackdrop-root'))
      return false
    const r = el.getBoundingClientRect()
    return r.width >= W * 0.5 && r.height >= 24 && r.height <= H * 0.4 && r.top > H / 2
  })
  if (!bars.length) return []
  const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top))
  const content = all.filter(
    (el) =>
      visible(el) &&
      !bars.some((b) => b.contains(el)) &&
      getComputedStyle(el).position !== 'fixed' &&
      !el.closest('[aria-hidden="true"], [role=dialog]') &&
      (Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()) ||
        el.matches('img, svg, input, textarea, button')),
  )
  const lowest = content.sort(
    (a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom,
  )[0]
  if (!lowest) return []
  const bottom = lowest.getBoundingClientRect().bottom
  return bottom > barTop + 1
    ? [
        `last content “${(lowest.textContent ?? lowest.tagName).trim().slice(0, 28)}” ends at ${Math.round(bottom)}px, bar starts at ${Math.round(barTop)}px`,
      ]
    : []
}
