# Post-merge review

Last reviewed commit: 36368f0b (first pass, range 2b0202ee..36368f0b, 19 PRs).

Checks on main at that commit: `tsc -b`, `eslint --max-warnings 0` and `test:hooks` clean; backend pytest for the touched modules 122 passed, 13 skipped; 14 phone specs (90 tests, `--workers=1`) 89 passed, 1 flaky (below).

| PR | Verdict |
| --- | --- |
| #176 CI phone shards on PRs | OK |
| #186 Main green (rules, analytics tests) | OK |
| #184 Face check measure/review | OK (backend and trust specs pass) |
| #144 Mobile navigation | OK. History goes through `app/history.ts`; `ShopStamp.tsx` still calls `history.replaceState` directly (keeps state, harmless). |
| #133 Tour story worlds | OK |
| #171 Synthetic supply demo data | OK. Overlaps in purpose with #133 and #169 seeding, see #207. |
| #169 Supply showcase | Issue #207 (flaky `supply-showcase-phone`: sheet close then `go('coach')` raced by the Back-stack release; DEV-only button) |
| #200 Onboarding go-live | OK |
| #196 Landing For business button | OK |
| #195 Navigation tab draft marker | OK |
| #181, #189 Codex flow fixes | OK |
| #185 Phone load speed | OK. Trust strip strings present in all 14 locale files after the lazy-locale change. |
| #194 Trust strip | OK |
| #170 GA4 | OK. Consent-gated, params whitelisted, ids stripped from paths. |
| #167, #159, #160 Guards and localized copy | OK |
| #157 Acceptance flows | OK (not run: spec is outside the phone set above) |

No silently removed features found: the only deletions in the range are old QA screenshots (#144).
