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

## Second pass

Last reviewed commit: 6d92975e (range 36368f0b..6d92975e, 8 PRs). `tsc -b` clean. Backend pytest for the touched modules 155 passed, 7 skipped, 1 timing failure (below). Phone specs (speaker-toggle, qr-poster, public-demo, screen-photos, voice-wake-lock, region) 40 of 41 passed with `--workers=1`.

| PR | Verdict |
| --- | --- |
| #145 Speaker off, stop ends chat | Fixed: `asks_to_end` backtracked exponentially on a long run of finishing words (28 x "bye" + "x" blocked the event loop for 7 s; the 120-char cap allows far worse). Clauses over 40 characters now return False; regression test added. Also: `qrCaption` is unused after #198 (see below). |
| #192 Bad network | OK |
| #198 QR poster, WhatsApp | OK. `qrCaption` is now dead in `strings.ts` and the 14 locale files (replaced by `scanStamps`); removal touches 15 files, left for a cleanup. |
| #197 Demo shop | OK. Seeding duplicates the #133/#171 tour fixtures by design (reuses `seed_workspace`). `test_rate_limit_per_ip_...` failed once under load (six demo opens at ~3 s each), passes alone. The first `/demo` goto in `public-demo.spec.ts` timed out twice on a cold dev server (`page.goto` 60 s); the other 12 pass. |
| #190 Photo import | OK. The two `photoCopy.ts` files (coach, connect) hold different strings. |
| #182, #183 Flow fixes | OK. The only removals are the Tiong Bahru fallback, replaced by `phoneArea()`, and wording replaced in place. |
| #202 Voice stability | OK. The title mentions text retries and a fallback; this diff holds none (save settling, wake lock, close codes only). |
