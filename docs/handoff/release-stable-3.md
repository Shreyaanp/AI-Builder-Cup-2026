# Handoff: stable release 3 (`release/stable-3`)

Base: `origin/release/stable-2-main` (d507392, PR #50). Twelve PRs merged in the brief's order with
`git merge --no-ff origin/<branch>`, one merge commit each, conflicts resolved before the next merge.
#42 and #54 were fetched again right before merging. Both were at their latest heads (74d2e5e and
2198da2), and both PRs are now green on CI. A last fetch before the push confirmed that every merged
branch's head is in this branch. `fix/voice-reliability` (onboarding v2) is **not** merged. It goes
into this branch when it lands.

## What is in

| Order | PR  | Branch                        | What it brings                                                                                        |
| ----- | --- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1     | #53 | `fix/bughunt-main`            | One line per trust notice, `viewTransition()` helper, one item in two sizes, "1 stamp"                |
| 2     | #57 | `fix/qa-findings-v2`          | Money formatting in generated replies, outlined Follow, single business link on the landing           |
| 3     | #42 | `fix/customer-audit-quick-v2` | Language picker, one currency per area, ₹ placeholder, food-only rescue, name dedupe, area chip       |
| 4     | #49 | `docs/impact-measurements`    | Impact scripts and figures (docs and scripts only)                                                    |
| 5     | #51 | `fix/manual-tests-v2`         | Manual test script v2 with the 15-minute smoke (docs only)                                            |
| 6     | #48 | `docs/submission`             | README, architecture, Google AI list, submission checklist                                            |
| 7     | #56 | `fix/stamps-scrollbar`        | Stamps only when the shop has a reward, global thin scrollbar, `scrollArea` helper                    |
| 8     | #58 | `fix/chat-markdown`           | `RichText` Markdown for AI output, `PlainText` for people, Markdown stripped before speech            |
| 9     | #59 | `fix/journey-quick`           | PO technical view behind a disclosure, Tamil headline at 360px, 48px targets, scratch card, close day |
| 10    | #54 | `fix/manual-v2-bugs`          | In-chat map fits at 360x800, area currency hints, Today skeleton, calm empty passport board           |
| 11    | #52 | `fix/journey-audit`           | Human journey audit: report, data, recordings, walker script (docs only)                              |
| 12    | #60 | `feat/customer-front-door`    | Phone-first customer front door: inline "where", thumb-zone dock, Near you now cards                  |

No PR was skipped.

## Conflicts and how they were resolved

- **#57, `Marketing.tsx`**: release 2 rewrote the landing (owner and customer journeys). #57 edited
  the old landing. Kept release 2's landing, which already meets #57's intent: the header "For
  businesses" link is outlined, and the hero has no second "For businesses" button. Its actions are
  "Run my shop" and "Explore nearby". `tests/qa-fixes-v2.spec.ts` now checks "Explore nearby"
  instead of the old "Find places near me" contained button.
- **#42, `discover_ask.py` and `Marketing.tsx`**: #60 had already merged #42 into release 2
  (187ba61). Release 3's copies of both files were identical to that merge's base, so #60's
  resolution was taken as is. The search engine ranking keeps the Singapore/India filters and the
  "(Tour)/(Demo)" name dedupe, and the language picker sits in the landing nav. #42's newer
  commits only carry main/#47, which release 2 already had.
- **#48, `docs/architecture.md`** (both sides added it): the submission overview (diagram, request
  flow, boundaries) comes first, then release 2's "Google services added in release 2" table and
  its deployment and scaling evidence. Two submission paragraphs said Document AI, Maps grounding,
  Recommendations AI, the BigQuery export and Looker were absent. They predate release 2, so they
  now point to `document_ai.py`, `maps_grounding.py`, `retail_recs.py` and `analytics.py`.
  `docs/google-ai.md` "Pending services" got the same update. Those services stay "not counted as
  used" until a fresh live check.
- **#58, `Chats.tsx` and `ConversationView.tsx`**: AI and demo replies render through `RichText`
  with #57's `formatMoneyText`. Translations render through `RichText`. Human messages stay
  `PlainText`. **`AskHome.tsx`** imports both `RichText` and `scrollArea`.
- **#59**: its spec runs had rewritten 290 story screenshots and `RESULTS.json`. The PR doesn't
  mention them, so they were restored to release 2's versions (separate commit).
- **#54, `AskHome.tsx`**: #54's `fallbackPlace()` (area by device currency) and
  `useConversationCopy(areaCurrency(place))` combined with release 2's "you" label fix and reverse
  place lookup. The older `$3 → ₹50` replace stays as a harmless fallback.
  **`useTodayPlan.ts`**: waits for `productsLoaded` (#54) and keeps `markCloseDay` (#59).
  **`today.spec.ts`**: both new tests kept (#59 evening Close the day, #54 skeleton).
- **#60, `AskHome.tsx`**: #60's front door, with #54's `fallbackPlace` and area currency kept
  (#60's fixed `FALLBACK` dropped). #60's `Summary` (More/Less clamp) now takes `markdown`. AI
  answers render through `RichText` (#58) with a height clamp, and other lines stay plain text.
  **`ResultsMap.tsx`**: #60's comment with #59's `pointerEvents="all"` on the 48px pin target.
  **Customer story screenshots**: #60's, since they show the new front door.

## Fixes for breakages from the combination

- `scripts/walk-journeys.mjs` (#52) failed `eslint .`, because #52 only linted `src`. Removed
  unused imports and declared the in-page globals.
- Prettier on five merged files, and `ruff format` on `passport_routes.py` (#56).
- `tests/stories/s3.spec.ts`: "Kopi" matched both the menu row and release 2's "Similar nearby"
  strip, which lists a test shop from the shared local DB. Both menu checks now anchor on the
  row's start (`/^Kopi/`, `/^Kaya toast/`).
- `tests/qa/rewards-settings.spec.ts` and `tests/stories/director/walk.mjs` still expected
  "1 stamps". #53 changed the copy to "1 stamp".

## Test results (Windows, `--workers=1`, WEB_PORT=3855, API_PORT=3955, RECALL_PATH=data/test-vectors)

| Check                                                | Result                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `uv run ruff check` / `ruff format --check` (CI set) | clean                                                                         |
| `uv run mypy app`                                    | clean (99 files)                                                              |
| `uv run pytest -q`                                   | 1001 passed, 245 skipped                                                      |
| `npx tsc -b`, `npm run lint`, `npm run format:check` | clean                                                                         |
| `npm run test:hooks`                                 | passed                                                                        |
| `npm run build`                                      | passed                                                                        |
| OpenAPI / generated types                            | regenerated: no diff beyond line endings                                      |
| Browser suite, phone (396)                           | 390 passed, 6 skipped. S3 failed once (fixed above, then passed)              |
| Browser suite, desktop (396)                         | 295 passed, 101 skipped (phone-only). 2 cold-start flakes passed on rerun     |
| `npm run test:qa`, phone + desktop (186)             | all passed. The Tamil coach test is an expected failure (`test.fail`, bug Q1) |

The suites ran in batches of up to about 7 minutes, by spec file. `npm run test:qa` ran per project
with `--workers=1` (its config defaults to 2).

## Flakes

- **Cold start**: the first one or two tests after a fresh dev server sometimes time out on
  `page.goto('/')` with a blank page while Vite compiles on first load. Seen on desktop
  `v1-a11y` Welcome/Consent (light), QA phone `sourcing` and `voice-continuity` theme tests. Each
  passed on rerun. #53's bug-hunt doc already lists this flake.
- **Batch length**: phone `voice-continuity` once took about 25 s per test in a long batch, but
  1.7 min for all 22 alone. The same story batch also hit the 10-minute guard once. After either
  guard hit, the leftover dev servers on 3855/3955 were stopped by PID.
- The shared local SQLite DB keeps growing with test shops. This is what made S3's "Kopi"
  ambiguous (see #53's note about `customer-ask`).

## Not done / for later

- `fix/voice-reliability` (onboarding v2) goes in when it lands. #54's description lists the
  `NewShopFlow.tsx` / `MapCard.tsx` changes that onboarding v2 has to carry over.
- No physical phone, live Gemini, or hosted Google sign-in in this run.
