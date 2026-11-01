import { expect, type Page } from '@playwright/test'

/** Counts of what the owner can see, so "simple" is a number a test can hold (simplify plan, §7). */

const TAPPABLE =
  'button,a[href],[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],input,textarea,select,[role="combobox"]'

/** The visible tappable things in the first screenful (`role` narrows to one ARIA role/tag). */
export async function firstViewCount(page: Page, role?: string): Promise<number> {
  return page.evaluate(
    ([selector, tappable]) => {
      const root =
        document.querySelector<HTMLElement>('[role="dialog"]:not([aria-hidden="true"])') ??
        document.body
      const query = selector ? `${selector},[role="${selector}"]` : tappable
      return Array.from(root.querySelectorAll(query!)).filter((el) => {
        const box = el.getBoundingClientRect()
        return (
          box.width > 1 &&
          box.height > 1 &&
          box.top < innerHeight &&
          box.bottom > 0 &&
          (el as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })
        )
      }).length
    },
    [role, TAPPABLE] as const,
  )
}

interface TextLeaf {
  text: string
  size: number
  firstView: boolean
  body: boolean
}

/** Every visible piece of text with its rendered size (screen readers' hidden text is skipped). */
async function leaves(page: Page): Promise<TextLeaf[]> {
  return page.evaluate(() => {
    const root =
      document.querySelector<HTMLElement>('[role="dialog"]:not([aria-hidden="true"])') ??
      document.body
    const out: { text: string; size: number; firstView: boolean; body: boolean }[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
      const el = node.parentElement
      if (!text || !el || el.closest('svg')) continue
      const box = el.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) continue
      if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue
      const style = getComputedStyle(el)
      if (style.clipPath.startsWith('inset(50%') || style.clip === 'rect(0px, 0px, 0px, 0px)')
        continue
      out.push({
        text,
        size: parseFloat(style.fontSize),
        firstView: box.top < innerHeight,
        body: Boolean(el.closest('.MuiTypography-bodyLarge, .MuiTypography-bodyMedium')),
      })
    }
    return out
  })
}

/** Words on screen, or only in the first screenful. */
export async function wordCount(page: Page, options: { firstView?: boolean } = {}) {
  const all = await leaves(page)
  return all
    .filter((leaf) => !options.firstView || leaf.firstView)
    .reduce((sum, leaf) => sum + leaf.text.split(/\s+/).filter(Boolean).length, 0)
}

/** The distinct rendered text sizes (px), plus the smallest paragraph text. */
export async function textSizes(page: Page) {
  const all = await leaves(page)
  const sizes = [...new Set(all.map((leaf) => Math.round(leaf.size)))].sort((a, b) => a - b)
  const paragraphs = all.filter((leaf) => leaf.body).map((leaf) => leaf.size)
  return { sizes, smallestBody: paragraphs.length ? Math.min(...paragraphs) : null }
}

/** Fails if any of `words` is on screen (case-sensitive: "SAP" must not match "Sapna"). */
export async function noJargon(page: Page, words: readonly string[]) {
  const text = (await leaves(page)).map((leaf) => leaf.text).join('\n')
  const hits = words.filter((word) => text.includes(word))
  expect(hits, `developer words on screen: ${hits.join(', ')}`).toEqual([])
}
