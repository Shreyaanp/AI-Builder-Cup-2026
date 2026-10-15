# UI-1 — Coach screen: self-filling cards, bottom sheets, motion (phone first)

You are a second Claude Code session working on branch `ui/coach-screen` in this worktree. The
lead session (another Claude) reviews and merges your work. **Do not commit to main, push, or
release.** Commit on this branch only, with plain messages and **no AI/Claude co-author
trailers**. Finish by writing `docs/briefs/UI-1-REPORT.md` (what changed, screenshots taken,
checks run, open questions).

## Read first (short)

- `AGENTS.md` / `../rules.md` if present, and `docs/codex/CONVENTIONS.md` — product rules: the AI
  only *prepares* changes, the owner confirms a sealed proposal; never claim Google publishing;
  APAC/Singapore market (kopi, kaya toast, SGD), English default, all copy via
  `src/features/v1/strings.ts` + the 9 locale files in `src/features/v1/locales/` (typed `Copy`,
  so new keys must be added to every locale — write real translations, not English).
- `.agents/skills/material-design-3-ui/` and `.agents/skills/web-interface-guidelines/SKILL.md`
  (motion, forms, focus, safe areas). Theme roles/type/shape live in `src/design/theme.ts`.

## The problem (from the owner, testing on a real phone)

The coach screen is usable but not pretty and feels cluttered. After a conversation starts,
the cards should feel alive: they **fill themselves in** from what the owner says, and tapping
one **slides up a bottom sheet** with smooth, expressive Material 3 motion. Desktop is secondary.

## What to build

1. **Composer = one line.** A single rounded bar: attach (photo), text field, mic, send. No
   two-row composer. Keep 48dp targets, Enter-to-send only on non-touch, the existing
   `--nav-offset` behaviour (bottom nav hides while typing), safe-area insets.
2. **Declutter the top.** On phone, move conversation history and "+" (check what "+" does in
   `CoachScreen.tsx` first) into one overflow menu. Remove the "Only your private records
   change, nothing is published to Google" line from the coach screen on phone — the review
   sheet (`ReviewDialog.tsx`) already says it; keep it there.
3. **Self-filling shop card.** A compact card at the top of the conversation showing the shop as
   it is being built: name, category, hours, location, item count, readiness (e.g. 3/5). Fields
   fill in with a subtle animation as proposals are confirmed (data already in the workspace
   context: `useWorkspace()` → `active`, `products`). Before a shop exists, show **one** start
   card instead ("Send a photo of your shop board" / "Tell me your shop's name"), and nothing else
   — no fake cards. `NextAction.tsx` is the current next-step card; replace or fold it in.
4. **Tap → bottom sheet.** Tapping the shop card (or an item chip on it) opens an M3 modal bottom
   sheet (drag handle, scrim, swipe-down to close, focus trap, Esc) with the details and the
   existing edit actions (`openEditor` in the workspace). Reuse the pattern already used by
   `ReviewDialog` on compact screens; make both feel consistent.
5. **Motion.** M3 emphasized easing/durations (define motion tokens in `src/design/theme.ts` if
   missing: e.g. emphasized-decelerate ~400ms for enter, emphasized-accelerate ~200ms for exit).
   Sheet slides up from the bottom; cards enter with fade + small rise; field updates crossfade.
   Animate only `transform`/`opacity`. Respect `prefers-reduced-motion` (instant / fade only).
6. **Phone type scale.** Slightly tighter body/label sizes on compact width, keeping 48dp targets
   and contrast.

## Constraints

- Don't touch backend code or API contracts. Don't change the proposal/confirm flow semantics.
- Keep all existing labels that tests rely on, or update the tests in `tests/` accordingly
  (search for the label first).
- No new heavy dependencies. MUI + existing libs (`@mui/material`, `lucide-react`) are enough;
  if you need a gesture for swipe-to-close, use MUI `SwipeableDrawer`.

## Checks (targeted only — the lead runs the full suite in CI)

- `npx tsc -b`, `npx eslint src --max-warnings 0`, `npx prettier --check src tests`
- `CI=1 npx playwright test tests/v1.spec.ts tests/v1-a11y.spec.ts --project=phone`
- Screenshots of the coach screen at 412px (before shop, during conversation, sheet open) in
  light and dark, saved under `docs/briefs/ui-1-shots/`. Look at them yourself and fix what looks
  off before reporting.
