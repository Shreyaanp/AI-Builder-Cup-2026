# Design foundation

Intent: one clear next step, a living business card and calm coaching. The Pixel health/coach reference is a product interaction reference; no health metrics, Google identity or unsupported native connection is implied.

## Adopted external sources

- [Material Design 3 UI Skill](https://github.com/skydashnet/material-design-3-ui-skill): vendored under `.agents/skills/material-design-3-ui`, with its license and source revision.
- [Google Material Design 3](https://m3.material.io/): design authority. [Official type scale](https://developer.android.com/develop/ui/compose/designsystems/material3#typography).
- [Google Material Color Utilities](https://github.com/material-foundation/material-color-utilities): generates light/dark semantic roles. The generator runs at build time so its full engine is not shipped to phones.
- [MUI theme API](https://mui.com/material-ui/customization/theming/): React components, keyboard/dialog conventions and centralized theme. MUI is not an official complete Material 3 React implementation; the custom theme is documented as Niva's adaptation.
- [Google PWA app design](https://web.dev/learn/pwa/app-design/): standalone appearance, safe areas and reduced motion.
- [NN/G usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): task clarity, feedback, consistency and recovery.

## Layout and component map

Compact: header → greeting → business card → coach input. Labelled bottom navigation switches Coach, Business and Activity. Expanded: coach and card use supporting panes; navigation moves to the header with the same destinations. No hamburger menu or invented navigation chips.

One contained business unit uses a tonal surface and subtle outline. Location/hour rows use a list arrangement. Edit/example actions are secondary; exact review confirmation uses a filled button. Focused edits and confirmation use MUI dialogs with accessible names, Escape and focus restoration.

## Tokens and typography

`src/design/theme.ts` contains role mapping, typography, 4px spacing rhythm and component targets. The brand seed is in `scripts/material-source.mjs`; regenerate with `npm run theme:generate`. Colour literals stay in the generator, generated data and brand assets.

Roboto is paired with Noto Sans Devanagari for Hindi. Both are served locally. Scale: 36/44 greeting, 45/52 expanded greeting, 22/28 card title, 16/24 body, 14/20 controls, expressed in rem. These roles use official M3 baseline scales; weight/spacing adaptations are Niva choices. Wider layouts don't simply enlarge the phone canvas.

Proposed application spacing: 16px outer edges, 24px card padding, 8–32px grouping gaps. Touch controls target at least 48 CSS px in default sizing. Text wraps instead of clipping; controls can flow to another row. Vertical scrolling remains available for small windows, large text and keyboard display.

## States and motion

Empty card, partially entered card, session review, revised/unreviewed state, empty activity, invalid photo and offline message are explicit. Voice and connections explain what is pending. Essential integration status remains visible outside a snackbar. The theme respects reduced motion; routine components use their library interaction feedback, without a forced greeting delay.

## Integration boundaries

The manifest is a starting declaration only. Actual install promotion, Android icons/splash, service worker and offline recovery need their own execution evidence. Native placement, owner authorization and live Google writes cannot be inferred from the UI. Real audio, forecasts, request fulfillment, multilingual regional accuracy and account security are not established by this template's browser checks.
