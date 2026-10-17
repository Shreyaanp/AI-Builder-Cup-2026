# Handoff: stable release 3 (`release/stable-3`)

Base: `origin/release/stable-2-main` (d507392, PR #50). Twelve PRs merged in the brief's order with
`git merge --no-ff origin/<branch>`, one merge commit each, conflicts resolved before the next merge.
#42 and #54 were fetched again right before merging. Both were at their latest heads (74d2e5e and
2198da2), and both PRs are now green on CI. A last fetch before the push confirmed that every merged
branch's head is in this branch. `fix/voice-reliability` (onboarding v2) is **not** merged. It goes
into this branch when it lands.

Part 2 (see [Part 2](#part-2-main-and-five-more-prs) below) brought in origin/main and #61, #62,
#63, #64 and #67 on top of that.

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

## Part 2: main and five more PRs

Same rules: `git merge --no-ff origin/<branch>` in the brief's order, one merge commit each. A
fetch right before the push confirmed every branch below was still at the merged head.

| Order | PR  | Branch                   | Head    | What it brings                                                                                         |
| ----- | --- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| 1     | —   | `main`                   | 8073239 | No file changes: #55 came in with release 2, and #53 #57 #42 #49 #51 #48 were merged from their branch |
| 2     | #61 | `fix/hindi-e2e`          | b251c03 | Hindi end to end: prompts, offline playbook, localised skip link and tab bar, dates, units, 360px spec |
| 3     | #62 | `fix/code-quality-audit` | f43fa57 | Code quality audit doc (docs only)                                                                     |
| 4     | #63 | `fix/welcome-stamps`     | 6c07cfb | One stamp count, welcome stamps included, on the shop button, stamp card and passport                  |
| 5     | #64 | `feat/customer-story`    | 8933f06 | Customer answers as compact 88px rows under a map strip, our shops then Google places                  |
| 6     | #67 | `fix/face-check-v2`      | ca7d1b0 | Face check calibration, sampled JPEG frames, live guidance, warmup route, incident doc                 |

**Skipped:**

- `fix/customer-layout` (PR #78): it was not on origin when the merges started. It was pushed
  during the run, but it isn't green: its only check is GitGuardian. It conflicts with main, so
  CI never ran on it. Merge it here once it's rebased and green.
- `wip/customer-places-cache` and `fix/voice-reliability`: not merged, as the brief says.

### For the owner: #67 lowers the face check's liveness thresholds

`backend/face_worker.py`, calibrated in #67 for real front cameras (low light, glasses, darker
skin tones). `docs/qa/face-check.md` has #67's before/after pass rates. All of these make the
check easier to pass, so please confirm them before release:

| Setting                         | Before | After                                 |
| ------------------------------- | ------ | ------------------------------------- |
| `REAL_MIN` (mean liveness)      | 0.5    | 0.30 (screens and prints score <0.15) |
| `MIN_FACE_SHARE`                | 0.6    | 0.40                                  |
| Face detection confidence       | 0.8    | 0.60                                  |
| Smallest face crop              | 60 px  | 45 px                                 |
| Look-up pitch (`PITCH_MIN`)     | 10°    | 7°                                    |
| Head-turn yaw (`YAW_MIN`)       | 10°    | 10° (unchanged)                       |
| Gap between frames used (video) | 0.45 s | 0.30 s (JSON frames), 0.35 s (video)  |

### Conflicts and how they were resolved

- **main**: conflicts in 16 files, all copies of the same PRs. The backend files (`agent.py`,
  `main.py`, `streaming.py`, `voice_tools.py`) kept release 3's extra imports and handlers. #55's
  own changes were already identical here. The other files kept release 3's version, since it
  already holds those PRs' branch heads plus the release 2 and 3 resolutions.
- **#63, `StampCard.tsx`**: took #63's count, welcome stamps included. That count is never below
  2, so #53's singular "1 stamp" can't show on the card any more. The singular `t.stamp` string
  stays in the copy, now unused. In the five specs, only the conflicting hunks took #63's counts ("1 stamp" becomes
  "3 stamps"). Release 3's other test fixes in those files (S3's `/^Kopi/` anchors) were kept.
  `tests/stories/director/walk.mjs` got the same "3 stamps".
- **#64, `AskHome.tsx`**: #64's vertical `PickList` replaces the old horizontal card row. The row
  used #56's `scrollArea`, which a vertical list doesn't need, so its import was dropped.

### Fixes for breakages from the combination

- **Answer order (#64 + release 2's maps story)**: #64 put the map first and moved our rows under
  it. That left Google's area answer card above our shops, and `stories/maps.spec.ts` ("our shop
  first") failed. The area answer now sits under our rows and above Google's rows: map, our shops,
  Google. This matches #64's own comment.
- **Contract**: #67 added `/api/v1/face/warmup` and `exclude_prompts` without regenerating.
  `docs/openapi.json` and `src/api/generated.d.ts` are now regenerated.
- **#61 Hindi spec on release 3's front door (#60)**: the customer front door opens on the Ask,
  with no welcome step, so the test now checks the Ask heading. It fills the Ask box through its
  `search` role, because the first textbox is now #60's inline "where" field. `Indiranagar`, #54's
  area fallback for a rupee phone, joins the allowed place names. Its customer screenshots 20–24
  were refreshed to show release 3's screens.
- **#61 localised the tab bar label**, so the QA `tamil()` helper couldn't find the
  `navigation "Main"` after switching. That broke six Tamil QA tests. It now returns to the tab
  through the Tamil label.
- **S9 story**: it tapped the stamp moment before the check had finished, so the tap skipped
  nothing. Axe then read lines that were still fading in: a contrast failure in both themes,
  exposed by #64's timing. It reproduced alone. S9 now waits for the progress indicator to go and
  for the lines to reach opacity 1, as S8 already does.
- `ruff format` on #67's `test_face_worker.py`. Prettier on #64's brief and on #67's
  `FaceDialog.tsx` and `face-check.md`.

### Part 2 test results (same machine and env as above, `--workers=1`)

| Check                                                | Result                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `uv run ruff check` / `ruff format --check` (CI set) | clean (after the format fix above)                                                    |
| `uv run mypy`                                        | clean (101 files)                                                                     |
| `uv run pytest -q`                                   | 1019 passed, 246 skipped                                                              |
| `npx tsc -b`, `npm run lint`, `npm run format:check` | clean                                                                                 |
| `npm run test:hooks`, `npm run build`                | passed                                                                                |
| OpenAPI / generated types                            | regenerated (#67's warmup route), no diff after                                       |
| Browser suite, phone (405)                           | all pass, 6 skipped, after the fixes above. Ask-related specs rerun after the reorder |
| Browser suite, desktop (408)                         | 296 passed, 112 skipped (phone-only), no failures                                     |
| `npm run test:qa`, phone + desktop (186)             | all pass. Tamil coach is the expected failure (`test.fail`, bug Q1)                   |

**Load, not bugs (each passed when rerun alone):**

- QA phone "Close the day honours reduced motion": the dialog didn't open within 60 s, late in a
  long batch. The whole file passed twice alone.
- QA desktop close-day, first two tests: `page.goto('/')` timed out on a cold dev server (the
  cold-start flake above). All six passed alone.

**Test data**: S3 failed once because the local SQLite DB had grown to dozens of "Courtyard Chai"
test shops, and the ask answer shows only 8. That's the DB growth noted under Flakes. The
worktree's `backend/data/*.sqlite3` (gitignored, test data only) was moved aside, not deleted,
and the suites ran on a fresh DB, as on CI. S3 then passed.

The full `npm run test:qa` runs over 10 minutes per project on this machine, so it ran as two
file batches per project.

## Not done / for later

- `fix/customer-layout` (#78): merge once it is rebased on main and green.
- `fix/voice-reliability` (onboarding v2) goes in when it lands. #54's description lists the
  `NewShopFlow.tsx` / `MapCard.tsx` changes that onboarding v2 has to carry over.
- No physical phone, live Gemini, or hosted Google sign-in in this run.
