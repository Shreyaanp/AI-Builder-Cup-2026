/**
 * The phone UX rules the gate enforces (owner, 18 Oct; full text in the orchestrator's
 * PHONE-UX-RULES.md). Judge every screen at 360, 390 and 412 px first, desktop last.
 *
 *  1. One primary action per screen, in the thumb zone, full width or >= 48 px tall.
 *     -> `primary`: on phones the biggest filled button in the first viewport sits in the bottom half.
 *  2. 8-pt spacing scale (4, 8, 12, 16, 24, 32); 16 px side margins.
 *     -> `spacing`: padding, margin and gaps that are not multiples of 4, against a committed baseline.
 *  3. No horizontal scroll, nothing cut off, nothing overlapping (fixed bars never cover content).
 *     -> `overflow` and `overlap`.
 *  5. Max 3 text sizes per screen.
 *     -> `fonts`: distinct font sizes among the text in the first viewport, against a baseline.
 *  6. Contrast WCAG AA in light AND dark.
 *     -> `axe`: axe-core wcag2a + wcag2aa, zero violations.
 *  Tap targets >= 48x48 on phones (inline links inside a paragraph are excluded, as the heatmap does).
 *     -> `target`.
 *
 * Known failures that predate the gate live in allowlist.json (one OB number each); the gate fails
 * on anything not listed there. Counts (`spacing`, `fonts`) live in baseline.json and may only fall.
 */
export const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
] as const

export const THEMES = ['light', 'dark'] as const

export const RULES = [
  'overflow',
  'target',
  'overlap',
  'axe',
  'primary',
  'spacing',
  'fonts',
] as const
export type Rule = (typeof RULES)[number]

export const MIN_TARGET = 48
export const MAX_FONT_SIZES = 3
/** Spacing counts may wobble by a couple of values between runs (animations, fonts loading). */
export const SPACING_SLACK = 2
/** Allowed off-grid share for a screen with no baseline entry yet. */
export const SPACING_DEFAULT_SHARE = 0.15

export type Violation = { rule: Rule; detail: string }
