# Handoff: stable release 2 (`release/stable-2`)

Base: `origin/release/stable-1` (2b8e65a). Ten PRs applied in the brief's order as 3-way patches
(`git diff origin/main...origin/<branch> --binary | git apply --3way --index`), one commit each,
conflicts resolved before the next apply. Screenshots: incoming version (one exception, #18).
`docs/openapi.json` and `src/api/generated.d.ts` were regenerated from the combined backend after
every PR (`backend/scripts/export_contract.py`, then `openapi-typescript`), never hand-merged.
Handoff markdown from every PR is kept.

## Per PR: conflicts and resolution

### 1. #19 `feat/supply-chain`

- `agent.py`: imports and tool list are a union: stable-1's voice tools plus `*SUPPLY_TOOLS`
  (`get_supplier_rules`, `set_supplier_rules`, `draft_reorder`, `get_purchase_orders`).
- `merchant.py`, `merchant_firestore.py`: erasure deletes `shop_daily` (stable-1) and
  `SUPPLY_KINDS`.
- `streaming.py`: keeps stable-1's `ACTION_TOOLS` action cards and `PROPOSAL_TOOLS`, adds the
  `SUPPLY_CARD_TOOLS` cards (`purchase_order`, `supply_rules`).
- `ShopTiles.tsx`: the PR added a Supply tile among tools that stable-1 had moved to Grow. The
  Supply tile ("Purchase orders") sits on Grow next to Orders; Shop keeps the stable-1 layout.
- `CoachScreen.tsx`: handles `action`, `purchase_order` and `supply_rules` events.

### 2. #15 `feat/connect-system`

- `main.py`: `connector_router` plus stable-1's `NewShopVoiceContext` import.
- `ShopTiles.tsx`: "Connect your system" tile on Shop (menu and sales import); the PR's re-added
  plan, readiness and recap tiles were dropped because they live on Grow in stable-1.

### 3. #28 `feat/guide-payments-landing`

- About 130 screenshots and both results JSON files (`docs/stories/RESULTS.json`,
  `docs/qa/results.json`): incoming. They are generated outputs matching the incoming screenshots.
- `agent.py`: the instruction keeps stable-1's onboarding and business-profile rules and adds the
  payment-link rule. The offline router runs new-shop routing first, then the payment-link
  shortcut.
- `contracts.py` and `stream.ts`: both `action` and `payment_link` event kinds.
- `AppShell.tsx`: rebuilt from stable-1 (new-shop flow, Shop/Grow/You tabs) plus the owner-feature
  overlay (guide, payments). Leaving for a tab closes the feature. The PR's entries in the old
  settings popover had nowhere to go (stable-1 moved settings to You), so:
  **Payments & rides is a Grow card** (brief) and "Talk to your coach" is a Help row on You.
- `CoachScreen.tsx`: action chips and payment cards in the conversation. The queued coach draft
  waits until the coach is visible and idle (both PRs' conditions). Guide chips sit under Today.
- `ruff format` applied to incoming connector files.

### 4. #27 `feat/google-services`

- `main.py`: union (supply-chain translator, `AnalyticsReader`; shop-today and analytics routers).
- `ShopTiles.tsx`: "Your week" (`WeekPulseTile`) goes on Grow beside the recap, where stable-1 keeps
  insights. Shop keeps Connect.

### 5. #31 `fix/devops-hardening`

- `main.py`: `DocumentAIReader` and `FeatureFlags` imports.
- `IdentityProvider.tsx`: `features` state plus stable-1's `name` field.
- `AppShell.tsx`: the `google_guide` flag is applied to the stable-1 shell. With the flag off, the
  Google sub-page falls back to Coach and Grow hides its Get on Google card.
- `docs/architecture.md`: both sections kept (Google services table, then deployment and scaling
  evidence).

### 6. #18 `fix/agy-qa-2` (QA findings)

The branch merged a pre-#11 snapshot of `feat/customer-ai-first`. Every code and test file it
touches is identical to `origin/main` (#11 is already in stable-1) or older than it. The apply
conflicted on 90 heatmap JSON files, `AskHome.tsx`, `navigation.ts` and `discover_ask.py`.

- Resolution: keep stable-1 for all code, heatmap data and screenshots. The incoming captures are
  older pre-#11 shots of the same flows, so taking them would misrepresent the shipped UI. This is
  a deliberate exception to "take incoming".
- Kept `docs/qa/agy-sweep-2.md` (the findings).
- Checked the High findings against the merged code:
  - Stamp-points contrast is already fixed (the light sunflower is `#7A5900`).
  - The customer chat's AI reply bubble still used the error-like `tertiaryContainer`. Switched
    to `secondaryContainer` (applied).
  - Header buttons fixed to the viewport edge on desktop, and two primary actions in StampMoment,
    are still open (see risks).

### 7. #30 `feat/maps-grounding`

This branch also sits on the pre-#11 snapshot (79b2b75), so `origin/main...branch` re-applied that
old snapshot (88 heatmap conflicts plus Ask files). Applied only its own five commits instead
(`git diff 79b2b75 origin/feat/maps-grounding | git apply --3way --index`).

- `discover_ask.py`: `AskResponse` keeps stable-1's `command` and adds `area`.
- `settings.py`: instant-path and context-cache settings plus the `maps_grounding` switch.

### 8. #29 `feat/recs-ai`

- `AskHome.tsx`: stable-1 rewrote Ask as a turn thread, so `recsEvent('ask')` now fires from the
  turn runner.

### 9. #33 `feat/search-engine`

- `discover_ask.py`: the response carries `command`, `area` and `engine`.
- `main.py`: the lifespan keeps the supply translator and builds the search engine.
- **One answer flow.** `/discover/ask` ranks our shops with the engine first (for you, best), adds
  the grounded Google area answer (#30) for area questions, and the map pins both.
- **"Similar nearby".** `/discover/similar` uses the new `retail_recs.SimilarShops` provider
  (Recommendations AI similar items mapped to other shops) when `RECS_ENABLED` is on, else
  embeddings. The `SimilarProvider` protocol gained a `products` argument (the anchor's menu) so
  the provider can build Retail product IDs. New unit test.

### 10. #32 `feat/shop-playbook`

- `agent.py`: imports union. `coordinator._propose_shop` keeps `closed_on`, `reward_text` and
  `stamps_needed` (voice tools) and adds `understanding` (owner goals).
- `main.py`: shop-today, analytics and playbook routers. `merchant.py`: `analytics_shops` and
  `playbook` / `set_playbook`.
- `coach_eval.py`: both scenario sets (voice-everything and playbook).
- `PrivacyScreen.tsx`: playbook section, stable-1 icons.
- **Grow order.** The PR reordered tool tiles on My shop, but those tools are on Grow in stable-1.
  Grow now orders its cards by `usePlaybook().view.grow` (supply follows orders, payments follows
  rescue, "Your week" follows recap).
- **Today.** `GET /businesses/{id}/today` returns `hints` when the shop has a saved playbook (read
  only, no model call).
  - `coach_line` (Today's personal line) says the first true line in the playbook's
    `line_topics` order.
  - `todayPlan` orders pulse numbers by `hints.pulse` and "Needs you now" by `hints.needs_you`.
  - Without a playbook, stable-1 behaviour is unchanged.

### Voice-everything for the new features

- Already exposed as agent (text and Live) tools: supply chain (`draft_reorder`,
  `get_purchase_orders`, `set_supplier_rules`) and payments (`prepare_payment_link`).
- Added:
  - a read-only `get_shop_playbook` tool;
  - `open_screen` targets `payments`, `supply`, `playbook` and `connect`, handled by the coach
    screen;
  - `app_guide` entries for each;
  - instant routes "open payments" and "show purchase orders".
- Fix: the stable-1 instant router sent "send a payment link for ₹240" to the share-page screen,
  so the payment tool never ran (`test_payments` failed). Share no longer matches payment or UPI
  links.

### Specs adapted to the Shop/Grow/You tabs

Several feature and story specs used the old Google, Privacy and "My shop" tabs or the settings
popover:

- analytics: "Your week" is on Grow.
- features: the Google card on Grow.
- owner-tools: payments from Grow, the guide from You. Back now returns to where it was opened.
- owner-tabs: Grow lists Payments & rides and Purchase orders.
- playbook: grow order on Grow; Privacy is under You.
- S2: needs behind the pill while chatting.
- S11: theme is set on You.
- S14: Connect is on Shop.
- A8: "Similar nearby" adds category art, so the locator takes the first match.

## Checks

| Check                        | Result                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| Ruff lint / format           | Passed / 196 files formatted                                    |
| mypy                         | Passed, 97 source files                                         |
| Backend pytest (full)        | **979 passed, 242 skipped**, 2 ADK experimental warnings, 150 s |
| `npm run lint`               | Passed (`--max-warnings 0`)                                     |
| Build                        | Passed, 3,118 modules (chunk-size warning as in stable-1)       |
| Hooks (`npm run test:hooks`) | Passed                                                          |
| `npx prettier --check .`     | Passed                                                          |
| API contracts                | Regenerated from the combined backend after each PR             |
| `git diff --check`           | Clean                                                           |
| graphify update              | 7,783 nodes, 24,059 edges (AST only)                            |

### Browser specs

All runs used `--workers=1`, `WEB_PORT=3751` and `API_PORT=3851`.

Totals: **242 passed, 2 failed (S9, pre-existing), 42 skipped.**

| Spec(s)                                   | Passed | Skipped | Notes                                  |
| ----------------------------------------- | ------ | ------- | -------------------------------------- |
| analytics, features                       | 10     | 0       | after spec updates                     |
| recs-events                               | 6      | 0       |                                        |
| owner-tools                               | 16     | 0       | after spec updates                     |
| frontdoors                                | 22     | 0       |                                        |
| playbook                                  | 4      | 0       | after spec updates                     |
| search-engine                             | 4      | 0       | rerun alone: timed out under load      |
| customer-ask                              | 14     | 0       | rerun on a clean local DB (see risks)  |
| customer-chat                             | 6      | 0       | after seeding the Singapore demo shops |
| today, voice-everything                   | 22     | 0       |                                        |
| owner-tabs                                | 6      | 0       | after spec update                      |
| new-shop, new-shop-inchat, new-shop-voice | 57     | 15      |                                        |
| stories a3–a12                            | 16     | 16      | A8 after locator fix                   |
| stories customer-flow, s1, s2             | 24     | 2       | S2 after spec update                   |
| stories s3, s5, s7, s8                    | 7      | 3       |                                        |
| stories s10, s13                          | 7      | 3       |                                        |
| stories s11                               | 2      | 0       | after spec update                      |
| stories s12                               | 6      | 0       | rerun alone on a clean DB              |
| stories s14, maps                         | 13     | 1       |                                        |
| stories s9-rescue                         | 0      | 2       | **2 failed**: also fails on stable-1   |

S2 and S9 were checked against a stable-1 baseline worktree on other ports. Both failed there the
same way. S2 is fixed here (spec); S9 is not (see risks).

## Open risks

- **S9 rescue story fails on stable-1 and here.** stable-1's tab redesign no longer mounts #4's
  owner Rescue sheet ("Closing-time rescue"), morning brief or "Asked nearby" radar. Grow's Rescue
  card starts a coach draft instead. Bringing them back is a product decision outside this
  release.
- **Test data accumulation.** The dev backend's SQLite DB (`backend/data`) is shared across spec
  files. After many runs, identical seeded "Courtyard Chai" shops tie at 10 m and the newest can
  fall outside the capped answer list (`customer-ask`). Light S12 also showed an axe contrast hit
  on a duplicate-review row. Both pass on a clean DB, and S12 passes on stable-1. Specs should get
  unique pins or a per-run DB.
- **Grow order with a playbook.** `view.grow` lists every default tool, so with a playbook the
  playbook's order replaces Grow's evening rule (close the day before prep).
- **Recommendations AI is off by default.** The similar-items model is not created, and the
  runtime service account has no Retail role (see `docs/handoff/recs-ai.md`). "Similar nearby"
  runs on embeddings until both are done and `RECS_ENABLED` is on.
- **#18 findings still open:** desktop header buttons fixed to the viewport edge, two primary
  actions in StampMoment, and the medium and low items in `docs/qa/agy-sweep-2.md`.
- **Not validated:** 242 backend tests skip here (Firestore emulator, live providers). Live Gemini,
  Maps grounding, Document AI, BigQuery, Retail, physical phones and hosted behaviour were not
  checked.
