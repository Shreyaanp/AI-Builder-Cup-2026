# Handoff: stable release 4 (`release/stable-4`)

Base: `release/stable-3` (PR #66, now on main as 6ebf1a49). Eight PRs merged with
`git merge --no-ff origin/<branch>`, one merge commit each, conflicts resolved before the next
merge. Then main was merged in twice: 6ebf1a49 (release 3 as a squash, same tree as
`release/stable-3`, so every file kept this branch's version) and 4d5afdd1 (#99, main-green test
fixes and the landing restore). A fetch before the push confirmed every branch head below is in.

## What is in

| Order | PR  | Branch                   | Head     | Fixes    | What it brings                                                                         |
| ----- | --- | ------------------------ | -------- | -------- | -------------------------------------------------------------------------------------- |
| 1     | #80 | `fix/rename-shop`        | d74839d2 | #68      | Owner renames the shop from the Shop tab, Review my shop, or by telling the coach      |
| 2     | #86 | `ci/product-rules`       | 426a0570 | —        | `npm run rules`: product rules as code, with a CI job and `docs/RULES.md`              |
| 3     | #81 | `fix/owner-css`          | f424b2bc | #69      | Owner CSS fixes from the heatmap                                                       |
| 4     | #65 | `fix/test-db-isolation`  | 745da076 | —        | Browser tests get a fresh database per run (`FRESH_TEST_DATA`)                         |
| 5     | #87 | `fix/chat-photo-routing` | 8fca615b | #82      | A chat photo is classified, confirmed in one line with chips, then routed              |
| 6     | #90 | `fix/sg-languages-e2e`   | 9bbe1baa | #75, #77 | Region persona: the shop's location sets money, languages, payments; Singapore locales |
| 7     | #78 | `fix/customer-layout`    | 44c9234a | —        | Customer cards, location box toggle, shop header, back/scroll preservation             |
| 8     | #89 | `fix/tamil-coach`        | 0cb3d127 | #88      | Tamil (and Chinese, Malay) offline coach replies                                       |

#90 had no CI run of its own (it conflicted with main, so only GitGuardian ran). #89 and #78
were merged only after `gh pr checks` showed them all green. #78 went in before #89, because
#89's CI was still pending at #78's turn.

## Conflicts and how they were resolved

- **#81, `tests/stories/s1.spec.ts`**: both sides scoped the menu row away from "Similar
  nearby". Kept release 3's comment and `.first()` with #81's anchored `/^Chai/`.
- **#87, `CoachScreen.tsx`**: both sides' imports and state kept (release 3's `RichText` and
  Connect sheet, #87's photo routing and close-day photo). The duplicate `CloseDay` import was
  removed in a follow-up commit.
- **#87, `backend/app/photos.py`**: this conflict was committed with its markers in the merge
  and fixed in the next commit (fc569827). It now has #87's `_client()` and `classify`, plus
  release 3's (#61) language-aware `extract(image, language)` with the localised offline note.
- **#90, `format.ts`**: #90's region-based `shopCurrency` and `formatPrice` (money grouped by
  the currency's home: ₹1,00,000 and S$100,000 in any language). Release 3's `areaCurrency` was
  kept, since AskHome and `conversationCopy` use it. `INDIC_LOCALES` was dropped as unused.
  `format.ts` and `region.ts` import with `.ts` extensions, and `regions.json` with
  `with { type: 'json' }`, because specs import `format.ts` under node resolution.
- **#90, `CustomerApp.tsx`**: release 3's front door (no welcome wizard) plus #90's
  language-step dialog after sign-in.
- **#90, `PublicShop.tsx`**: release 3's `stampsEnabled` gating and #63's ShopStamp props, with
  #90's `shopZone(shop)` in place of the `'Asia/Singapore'` default.
- **#90, `AskHome.tsx` / `Discover.tsx`**: release 3's front door, with its wider
  `fallbackPlace()` and `areaCurrency()`. #90's region money for the Ask examples was ported
  afterwards (see below).
- **#90, `TodayView.tsx`**: both imports kept.
- **#78, `tests/discover.spec.ts`**: #78's card shows only the first dish ("Teh tarik"), with
  #90's `S$2.20`.
- **#89 + #90, `backend/app/agent.py`**: both PRs added `ta`/`zh`/`ms` offline replies. One
  set kept: #89's, which its backend, QA and S7 tests check. The Chinese line uses #90's
  full-width punctuation.

## Fixes for breakages from the combination

- **Product rules (#86) on #90's code**: payment rails had hard-coded `SGD`/`INR`. They now
  take their currency from the region profile: `rail_currency()` in `region.py` and
  `railCurrency()` in `region.ts`, used by `payments.py`, `PaymentsScreen.tsx` and `links.ts`.
- **Rules baseline**: #86's baseline was taken on main before release 3 landed. Release 3's
  existing debt (region, i18n and voice in files such as `connector.py`, `maps_grounding.py`,
  `playbook.py`, `search_engine.py`, `supply_docs.py` and `AnswerCards.tsx`) is now recorded in
  `scripts/rules/baseline.json`. Counts this release paid down were lowered. Before that, a run
  on the `release/stable-3` tree with the same rules gave the same list, so the release adds no
  violations of its own. `Marketing.tsx` keeps #86's count of 3, which came back with main's
  landing restore. **The voice debt is real**: those five Gemini modules don't pin the reply
  language yet.
- **Ask examples (#90 on release 3's front door)**: India and Singapore samples now come from
  the region profile (`askBudget` + `formatAmount`): "coffee under ₹30" and "S$3". #42's spec
  now expects ₹30, not ₹50. Other currencies keep release 3's samples.
- **Malay**: `editProduct` / `editDetails` are now "Sunting" / "Sunting butiran", not "Edit".
  #80's rename button showed the English word on the shop screen, and #90's Malay check caught
  it.
- **Specs on release 3's front door**: `hindi.spec.ts` confirms the chat photo as मेन्यू in
  #87's one-line question before the sheet. `sg-languages.spec.ts` finds the Ask box by its
  `search` role, because the first textbox is the inline "where" field.

## Test results (Windows, `--workers=1`, WEB_PORT=3855, API_PORT=3955)

| Check                                                 | Result                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run rules`                                       | all ok                                                                                                                                                                                                                       |
| `ruff check` / `ruff format --check` (CI set), `mypy` | clean (102 files)                                                                                                                                                                                                            |
| `pytest -q`                                           | 1068 passed, 249 skipped. A `GOOGLE_CLOUD_PROJECT` set in the shell makes `test_settings` fail. It's the environment, not the code: it passes unset, as on CI.                                                               |
| `tsc -b`, `lint`, `format:check`, `test:hooks`        | clean                                                                                                                                                                                                                        |
| `npm run build`                                       | passed                                                                                                                                                                                                                       |
| OpenAPI / generated types                             | regenerated: no diff beyond line endings                                                                                                                                                                                     |
| Phone suite (438), before the last fixes              | 7 batches, 279 passed, 7 failed. The real failures were region ×2, Hindi photo, sg-languages and Malay; all are fixed above. The other failures were `page.goto` timeouts and Today's evening window (fixed on main by #99). |
| Focused phone specs after the fixes                   | region, sg-languages, customer-audit-quick, hindi, photo-routing, rename-shop: 25 passed (Fix 1 timed out cold on its first goto, then passed alone)                                                                         |
| Focused phone specs after the fixes                   | discover, front-door-layout, customer-layout, S1, owner-tools, phone-shell: 40 passed                                                                                                                                        |

The desktop project and `npm run test:qa` were not rerun locally after the reboot. CI runs both
browser projects in full on the PR. Seven other worktrees were running Playwright on the same
machine, which explains the cold-start `page.goto` timeouts.

## Not done / for later

- The five Gemini modules in the voice baseline need `language_rule(reply_language(tag))`.
- The other release 3 region debt in the baseline (`StampMoment.tsx` and `todayPlan.ts` default
  to `Asia/Singapore`) can now use `shopZone()` from #90.
