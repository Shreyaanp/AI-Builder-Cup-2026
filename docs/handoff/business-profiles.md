# Track B: business profiles, name first

16 October 2026. Worktree branch: `feat/business-profiles`, based on fetched
`origin/feat/new-shop-flow` at `0af4295`. Uncommitted; the assistant owns commit/review/release.
The new-shop UI, voice hook and customer UI were not edited.

## Implemented

- Coach instructions and the offline greeting ask the real business name first, then the
  business kind. An unsolicited menu or business description can still enter an unnamed
  draft. Neither the fixture nor the instructions invent a name. Both stores still require
  a name at commit.
- `backend/app/vendor_profile.py` defines a versioned, bounded `BusinessTypeProfile`: food,
  tailor, salon, retail, grocer, service, or generic. Only the matching attribute block is
  permitted. Food stores cuisine/diet/meat/relevance; tailor stores services/turnaround/
  measurements; salon stores services/booking/walk-ins; retail/grocer stores categories/
  delivery; service stores services/service area/appointments.
- The existing Gemini coach classifies from owner words, menus and photos by passing
  `profile` to `propose_business`. This uses the existing model turn and review boundary,
  with no extra classifier model call. An English/multilingual-keyword offline fallback
  handles older callers; uncertainty remains generic. It never infers a business type from
  the business name or claims halal certification from a photo.
- `get_question_plan` gates name and category before customer questions. Typed profiles use
  a deterministic relevant checklist; the existing generic planner remains available for
  legacy/general vendors. Butchers get cuts/weight/sourcing, home bakers get bakes/custom
  orders, tailors get fittings/turnaround, and salons get booking/walk-ins.
- Halal is a question only for a food profile explicitly marked as serving meat **and**
  regionally relevant. Vegetarian/vegan profiles disable both flags and omit halal and
  redundant vegetarian-options questions. Relevance is an eligibility flag, **not** a halal
  claim; an actual halal answer remains a separately reviewed fact.
- The profile supplies menu/items/services vocabulary and suggested units. Existing numeric
  prices and owner-stated selling units are unchanged. Suggestions do not convert units or
  overwrite prices. The profile is included in the coach snapshot and question-plan result.
- `propose_customer_facts` rejects irrelevant typed answers with the existing repair flow.
  Type-specific answers update the corresponding profile attributes as well as compatible
  custom facts. Food-choice corrections remove inapplicable fields in the proposed review;
  nothing changes until approval. Retail delivery answers update both representations.
- Customer projections include the confirmed typed profile and applicable facts. Inapplicable
  old custom facts are retained privately but excluded from the typed customer projection.
- OpenAPI and TypeScript API declarations were regenerated. No dependency change was needed.

## Migration and compatibility

SQLite and Firestore use the same additive migration helper. A record without a profile reads
as `{version: 1, kind: "generic", subtype: ""}`; reads do not write, increment revisions or
guess attributes. The next approved business write persists that default. Existing sealed
proposal payloads/digests and replay receipts are never rewritten. Confirmed legacy facts
remain available under generic behaviour, but unknown meat/relevance never triggers a halal
question. A clearly vegetarian legacy category also suppresses halal and redundant vegetarian
questions/customer facts without deleting its old private record. Normal edits from an older
client that omits `profile` preserve the approved
profile in both repositories. An explicitly supplied generic profile is an intentional reset.

No production backfill was run. This is a lazy schema migration, not a bulk update.

## Verification evidence

- Offline dependency setup: `uv sync --offline --locked` and offline npm installation.
  No dependency/lockfile edits or registry calls.
- Ruff check and format check passed; mypy passed for 68 application files.
- Full backend rerun: **858 passed, 2 skipped**, including local Firestore emulator RPCs,
  owned sessions and streaming/voice cleanup. After the last legacy-vegetarian guard, the
  affected profile/coach/category/store tests were rerun: **217 passed**. The earlier focused
  run including new-shop transport tests passed **228** cases.
- `npm run check`: ESLint, TypeScript/Vite build and hook enforcement passed. Its full
  four-worker browser run repeatedly timed out on the startup screen in unrelated customer,
  budget and screenshot cases and was stopped. It is **not** a green full-browser result.
- Prettier check on changed contracts/tests/handoff and `git diff --check` passed.
- `graphify update .` completed without model calls (AST extraction; 4,986 nodes at the first
  rebuild). The final rebuild produced **4,996 nodes / 15,484 edges**, without semantic/model
  labeling.

The initial browser attempt was stopped because a dependency junction put fonts outside
Vite's allowed paths. Dependencies were then installed locally from the offline cache. A
stale story fixture occupied API port 3537; it was replaced with this worktree's Python
backend and its OpenAPI was checked for `BusinessTypeProfile` before rerunning.

## Still unvalidated / the assistant follow-up

- No real Gemini, voice recognition, cloud database, deployment, billing/IAM change or external
  business operation was performed. The only network fetch was the explicitly requested Git
  branch fetch. Local browser emulation is not a physical-phone test.
- Run the live name-first conversation for tea stall, vegetarian restaurant, halal butcher,
  tailor, salon, hardware shop and home baker. Check that Gemini actually supplies `profile`
  using evidence from words/menu/photos, uses local vocabulary, and never asks halal without
  meat and regional relevance. The regional flag is model-proposed, not a geographic lookup.
- Offline fallback classification is conservative and cannot establish multilingual/live
  photo inference accuracy. Typed checklists are intentionally bounded; unfamiliar businesses
  retain the generic planner until classified.
- Account 2 retains ownership of the new-shop UI. The backend carries profile data through the
  draft/proposal, but this change adds no dedicated profile editor or new UI card.

## Final check results

- Backend: Ruff check/format and mypy passed; full pytest **858 passed / 2 skipped**;
  latest affected policy tests **217 passed** (SQLite + local Firestore emulator).
- Frontend: lint/build/hooks passed through `npm run check`. Full browser verification is
  blocked: repeated startup/screenshot timeouts, and the one-worker 66-case onboarding run
  stalled without a completed result. A final single phone/menu/name smoke also stalled.
  These browser attempts were stopped; do not treat them as passing.
- Changed-file Prettier and whitespace checks passed. Generated test screenshots were removed
  from the diff. The protected new-shop/voice and customer implementation files are unchanged.
- Local command logs are in the ignored `output/business-profiles/` folder. No commit, push
  or release was performed.
