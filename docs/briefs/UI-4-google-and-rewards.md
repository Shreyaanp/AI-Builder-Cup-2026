# UI-4 — Google onboarding redesign + customer rewards & back-in-stock (both HIGH priority)

Same rules as before: branch `ui/coach-screen` (already at main `d2fd8a8`), commit on the
branch only, no push/release, no AI co-author trailers, report in `docs/briefs/UI-4-REPORT.md`,
screenshots in `docs/briefs/ui-4-shots/` (412px light/dark). Read `docs/codex/CONVENTIONS.md`.
Note: the landing page / customer app restructure lives on branch `frontdoors` (not merged yet);
build Part B against today's main customer page and keep the code self-contained so it merges.

## Part A — Google onboarding (owner app, Google tab) — the owner says it "looks horrible"

Problem: the tab is a long simulator wizard with "Simulated", "fictional", "demo code 123456",
"trial" labels on every step. It feels fake and confusing.
Rules that still apply: we must never claim real Google verification/publication, and anything
not really connected must be labelled — but **once, clearly**, not on every line.

Redesign:
1. **One real path first.** The tab is a short, honest checklist toward getting on Google:
   (1) Shop details complete (readiness from our data, tap to fix), (2) Photos & menu ready,
   (3) **"Add or claim on Google"** — the official Google Business Profile flow opened in the
   browser (Live link, prefilled where Google allows), (4) "Verified on Google?" — the owner
   ticks it themselves after Google verifies (stored as owner-reported, shown as such).
2. A single info banner at the top: "Chalkboard prepares your details; Google verifies and
   publishes. We can't publish to Google for you yet." No other "simulated" text on the page.
3. The existing simulator moves behind one secondary button "Practice the steps" (a sheet),
   labelled once in its header. Keep its logic; just stop showing it by default.
4. Copy-ready listing: one card with name, category, hours, phone, address, description and
   menu link, each with a copy button (for pasting into Google's form).
5. Material 3 tiles + sheets like My shop; motion tokens; 9 locales; remove now-unused strings.
Tests: update `tests/google-sim.spec.ts` / `tests/v1.spec.ts` labels as needed; axe light/dark.

## Part B — Customer rewards (gamification) + back-in-stock alerts (customer side)

Keep it light, on-device first, no customer accounts:
1. **Stamp card per shop** (localStorage): a stamp when the customer opens the shop page via
   the shop's QR (`?source=qr`) at most once per day; 5 / 10 stamps show a celebratory
   animation + badge. Owner can optionally set a reward text in My shop ("10th kopi free")
   — new optional business field `reward_text` (≤ 80 chars, owner-confirmed proposal), shown on
   the customer page. The customer shows the stamp card at the counter (honest: no
   anti-fraud claims; label "Show this to the shop").
2. **Streak & badges** (on-device): "3 days in a row", "Tried 5 shops", "Early bird"; a small
   badge row in the customer page footer and in /discover "Your usuals". Expressive motion,
   respects reduced motion.
3. **Back-in-stock alerts:** on a sold-out item, a bell "Tell me when it's back". Implement with
   the Web Push API + service worker if feasible without paid services (VAPID keys from
   settings; if no keys configured, fall back to an in-page reminder: next visit shows
   "Kaya toast is back!" when it's available again). Backend: store subscriptions per shop+item
   (both store adapters, rate limited, expire after 7 days, deleted with the shop); when the
   owner flips the availability switch to available, notify subscribers. No email/SMS.
4. Strings in 9 locales; tests (backend both adapters; Playwright phone for stamps + the
   in-page back-in-stock fallback).

Checks (targeted): backend ruff/format/mypy + touched pytest (emulator if you can), contract
regen if API changed, tsc/eslint/prettier, touched Playwright specs on phone **and** desktop.
If ports 3200/3300 are busy, ask the lead instead of changing configs.
