# S7 · Review localized display text and fallbacks at large text

Owner area: **my shop**. Dispatcher: the assistant. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 16 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s7/phone-light/run.json), [video](../stories/director/s7/phone-light/walk.webm), [contract](../../STORIES.md#s7--language-country-appearance-and-optional-install).

- Tamil UI sample only; Hindi/CJK, audible TTS, 200% text, IME, physical installation and full 15-locale review remain unvalidated.

## Smallest fix / next proof

Tamil UI and optional install dismissal are recorded. Tamil phone checkpoints measure a 391×847 CSS layout viewport inside 390×844 raster evidence in both themes. Reproduce the small expansion after Settings closes before attributing it to glyph metrics or tooltip overflow. Compare Tamil/Hindi/Bengali/Japanese at 200% and 320px; preserve script marks and wrapping rather than shrinking controls.

Locate: src/i18n/fonts.ts:29; src/design/theme.ts:132; src/features/passport/TodayDeck.tsx:240. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] 200% text and 320px reflow remain manual release checks.
- [ ] Indic marks not clipped; no grapheme-by-grapheme animation.
- [ ] No multilingual offline model quality claim.
- [ ] Install never blocks use.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
