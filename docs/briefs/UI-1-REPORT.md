# UI-1 report — Coach screen (phone first)

Branch `ui/coach-screen`. No backend or API changes, no proposal/confirm flow changes, no new
dependencies.

## What changed

1. **One-line composer** (`screens/CoachScreen.tsx`). One rounded bar: attach photo
   (`ImagePlus`), text field, mic, send/stop. The mute button appears beside the mic only during
   voice. All targets are 48dp. The field grows upward for long text (buttons stay bottom-aligned).
   It stays at 16px so iOS does not zoom on focus. Enter-to-send still only applies to non-touch
   pointers. `--nav-offset` and the safe-area insets are unchanged. The voice/photo status line
   ("Listening…", "Checking your photo…") now sits above the bar as a `role="status"` line that
   takes no space when empty.
2. **Decluttered top.** "+" was `resetThread` (start a new conversation). It and the history
   button now live in one ⋮ "More options" menu: New conversation, then "Earlier conversations"
   with dated entries. The row with the offline/Gemini label and ⋮ is hidden on a fresh screen
   (no mode yet, no thread, no history). The "Only your private records change…" line is hidden
   below 600px. It still shows on wider windows and in `ReviewDialog`.
3. **Self-filling shop card** (`ShopCard.tsx`, replaces `NextAction.tsx`).
   - **No shop yet:** the greeting plus one `StartCard` and nothing else. Its title is "Scan your
     menu or shop board" and its body is "Send a photo of your shop board, or tell me your
     shop's name." Actions: **Take a photo** and **Add my shop**.
   - **Shop exists, empty thread:** a full card shows:
     - name, readiness (`5 of 6 ready`) and a progress bar
     - category, hours, location and item count; a missing field shows its muted label as a
       placeholder until it is filled
     - up to 4 item chips plus "+N"
     - the old next-step logic as one text button (e.g. "Add your phone →")

     Two quick-start chips sit below: Update a price, Change opening hours.

   - **During a conversation:** a dense one-row card stays pinned under the app bar. It has a
     readiness ring (`5/6`), the name, and "Kopitiam · 7am-3pm · 2 items".
   - **Animation:** a field fades in when its value changes after the first render, not on mount.

   Readiness uses the same 6 checks as the Google screen, so the two always agree. The brief's
   "3/5" was only an example. The next-step logic moved unchanged to `shopProgress.tsx`.

4. **Tap → bottom sheet** (`Sheet.tsx`, `ShopSheet`).
   - **Shared component:** `Sheet` wraps MUI `SwipeableDrawer` on compact windows: drag handle,
     scrim, swipe down / Esc / scrim to close, modal focus trap. It unmounts when closed. Windows
     600px and wider get a `Dialog`.
   - **Consistency:** `ReviewDialog` now uses the same `Sheet`, so both sheets share shape,
     padding and motion.
   - **Shop sheet contents:** readiness, a details grid, and the product list (each row opens
     the product editor). Actions: Add product, My shop, Edit details.
   - **Editing:** opening an editor closes the sheet first, so modals never stack.
   - **Item chips:** tapping one opens the sheet with focus on that item.
5. **Motion tokens** (`design/theme.ts`).
   - `motion.easing`: emphasized, emphasized-decelerate, emphasized-accelerate, standard.
   - `motion.duration`: enter 400 / exit 200 / short / medium.
   - Helpers: `enterRise` (fade + 12px rise) and `fieldFade`.
   - Sheets use 400ms enter / 200ms exit. MUI's `easeOut`/`sharp` easings are now the M3
     emphasized-decelerate/accelerate curves, so they apply app-wide; see open questions.
   - Only `transform`/`opacity` animate. The existing global `prefers-reduced-motion` rule makes
     all of this instant. MUI 9's Slide also honours reduced motion.
6. **Phone type scale.** Below 600px: bodyLarge 15/22, bodyMedium 14/20, with tighter tracking on
   body and labels. Nothing is smaller than 12px, and targets are unchanged.

**Copy:** three new keys, `moreOptions`, `shopDetails` and `itemCount(n)`, are in `strings.ts`
plus real translations in all 9 locale files. All existing labels are kept.

**Test change:** in `tests/v1.spec.ts`, the Google readiness assertion is now scoped to the
Google region. The coach (kept mounted while hidden) now also contains "1 of 6 ready", so the
unscoped `getByText` was ambiguous.

## Screenshots (`docs/briefs/ui-1-shots/`, 412×915, light + dark)

The `before-*` shots show the original screen. The `after-*` set:

| File                     | What it shows                                                    |
| ------------------------ | ---------------------------------------------------------------- |
| `after-1-before-shop-*`  | Before a shop exists: greeting + start card                      |
| `after-2-shop-start-*`   | Just after saving a shop: full card, mostly placeholders, 1 of 6 |
| `after-3-review-*`       | Review sheet over a conversation (shared `Sheet`)                |
| `after-4-conversation-*` | Conversation with the pinned dense card (5/6, 2 items)           |
| `after-5-sheet-*`        | Shop sheet open                                                  |
| `after-6-menu-*`         | Overflow menu                                                    |
| `after-7-shop-card-*`    | Full card after "New conversation": filled fields + item chips   |

I looked at each shot and fixed what looked off before this report:

- the lone ⋮ row on a fresh screen
- "0 items" in the dense card
- a photo chip that duplicated the next-step action
- the same store icon used twice on the card

I used a throwaway Playwright script for the shots; it is not committed. It also checked that a
chip tap focuses `Edit Kaya toast` in the sheet and that Esc closes it.

## Checks run

- `npx tsc -b`: pass
- `npx eslint src --max-warnings 0`: pass
- `npx prettier --check src tests`: pass
- `CI=1 npx playwright test tests/v1.spec.ts tests/v1-a11y.spec.ts --project=phone`: **27/27
  passed**, including axe in light and dark.
  - An earlier run had two `page.goto` timeouts on the very first tests. The cause was the cold
    Vite dev server, and they passed on the rerun.
  - The final icon swap came after that run. Only tsc/eslint/prettier and the screenshot script
    were rerun after it.
- **Not run:** the desktop project, the other specs (google-sim, i18n, starter… click
  "Add my shop", which still exists as a button), and `npm run check`. No physical phone test:
  swipe-to-close is MUI's built-in gesture and was not exercised with real touch here.

## Open questions

1. **Overflow menu on desktop.** The ⋮ menu is used at all widths, not just on phones. This was
   simpler, and desktop has the same clutter. I can restore separate icons at ≥600px if wanted.
2. **Theme-wide easing.** Changing the theme's `easeOut`/`sharp` easings also changes menus,
   dialogs and the snackbar app-wide to M3 emphasized curves. I can scope it to the sheets only
   if the lead prefers.
