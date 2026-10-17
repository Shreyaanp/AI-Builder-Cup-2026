# Product rules

`npm run rules` runs these in under 3 seconds; the `rules` job in `.github/workflows/checks.yml` runs them on every pull request and every push to main. Each failure says which rule, why, and how to fix it.

Existing violations are recorded in `scripts/rules/baseline.json` (a count per file), so CI fails only on new ones. Fix an old one and lower its count; never raise a count to get green. Regenerate with `node scripts/rules/index.mjs --update-baseline` only after removing violations.

1. **Commits** (`commits.mjs`): no `Co-Authored-By` / `Generated with` AI trailers in a PR's commits.
2. **Money** (`money.mjs`): no `Intl.NumberFormat` currency formats, hard-coded `₹` / `S$` / `$` price concatenation or `INR ` prefixes outside `src/features/v1/format.ts`.
3. **Region** (`region.mjs`): no new hard-coded `SGD` / `Asia/Singapore` in `src` or `backend/app` (tests and fixtures are fine).
4. **i18n** (`i18n.mjs`): every key in a locale table exists in all 15 locales (tables and `locales/` folders); no new user-visible English literals in `src/features` TSX (heuristic).
5. **Duplicates** (`duplicates.mjs`): `Drawer` / `SwipeableDrawer` only in `Sheet.tsx`; the Google Maps script loader only in `mapsSdk.ts`; `MediaRecorder` / `SpeechRecognition` only in the shared voice hooks (`useVoice.ts`).
6. **Size** (`size.mjs`): new files over 800 lines fail; existing files over 800 lines may not grow by more than 150 lines per PR (the long list is printed as a warning).
7. **Layout** (`layout.mjs`): the browser job keeps running the `phone` project and enough specs assert no horizontal scroll (`scrollWidth`); the specs themselves run in the browser job.
8. **Voice** (`voice.mjs`): every `backend/app` module that calls Gemini pins the reply language (`language_rule` / `reply_language`).
9. **Bugs** (`bugs.mjs`): a PR from a `fix/` branch should say `Fixes #n` (warning only).
