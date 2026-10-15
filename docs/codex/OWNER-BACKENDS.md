# Owner backend handoff

Branch: `wip/owner-backends`. Backend, tests and API contract only. The WIP commit contains
the initial feature implementation; the resumed changes are uncommitted. No release or live
provider validation is implied.

## Endpoints and shapes

All paths below start with `/api/v1`. Python schemas in `docs/openapi.json` and generated
TypeScript `components['schemas']` in `src/api/generated.d.ts` define the exact contract.

| Method and path                                | Request                                                                                                     | Response                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /businesses/{bid}/radar`                  | Owned business                                                                                              | `Radar`: `area_label`, `approximate`, `radius: 2000`, `days: 14`, `minimum_askers: 5`, `demo`, `opportunities`                                            |
| `GET /businesses/{bid}/rescue/suggestions`     | Owned business                                                                                              | `Suggestions`: `items`, shop-local `until` or null, `demo`, forecast `method`, assumption `note`                                                          |
| `POST /businesses/{bid}/rescue`                | `RescueInput`: `items: [{name, qty}]`, `discount_pct: 20\|30\|50`, `until: 'HH:MM'`, optional `pickup_note` | `RescueProposal`: `status: 'needs_review'`, `id`, `digest`, `expires`, `snapshot: Deal`                                                                   |
| `POST /businesses/{bid}/rescue/{rid}/approve`  | `{digest}` from the exact review                                                                            | `Deal`; retries with that approved digest are idempotent                                                                                                  |
| `GET /businesses/{bid}/rescue`                 | Owned business                                                                                              | `Deal[]`, including ended and expired deals                                                                                                               |
| `DELETE /businesses/{bid}/rescue/{rid}`        | Owned business                                                                                              | Ended `Deal`                                                                                                                                              |
| `GET /public/rescue?lat&lng&radius`            | Anonymous; radius defaults to 2000 m, accepts 200–10000 m                                                   | `PublicRescue[]`: `{shop_id, shop_name, lat, lng, distance_m, deal}`; only shared shops with live, unexpired, available rescue quantities                 |
| `POST /customer/shops/{bid}/rescue/{rid}/hold` | Signed-in customer; `{thread_id, name, qty}` using their existing chat                                      | Updated `Deal`; adds an ordinary hold message to that owned chat, with no payment                                                                         |
| `GET /businesses/{bid}/brief`                  | Owned business                                                                                              | `Brief`: `date`, `prep_plan`, `forecast_status`, `forecast_method`, `low_stock`, `weather`, `best_action`, `summary`, `mode`, `demo`, `unavailable_rules` |

An opportunity has `{key, label, band, unmet_share, google_count, fit, demo}`. Bands are
`5–9`, `10–19`, `20+`. Scores rank opportunities internally; exact asker counts and actor
hashes are not returned. `google_count: null` means no live Google count was established.
Real and demo populations independently pass k=5, and every opportunity carries its own
demo label. Do not render a demo opportunity as real activity when both populations appear.

Each suggestion reports `{name, quantity, forecast, prepared, sold, expected_rest, buffer,
discount_pct, estimate: true}`. The note discloses that saved stock is assumed to be opening
prepared quantity. The forecast trains only through yesterday; today's partial sales are
subtracted afterwards. Missing sales or usable daytime closing hours prevents suggestions.

A deal contains `{id, shop_id, items, currency, starts, ends, pickup_note, status, demo,
countdown_seconds}`. Each item is `{name, qty, qty_left, price, was, unit}`. Prices are integer
minor currency units; timestamps are Unix seconds. `status` is `live`, `ended`, or `expired`.
Holds and chat identifiers stay private. Countdowns are computed at response time; expiry is
also enforced when holding, listing publicly and reading the updates feed.

A brief prep row is `{name, quantity, demand, lower, upper, unit}`; at most three are returned.
Low-stock rows contain `{name, stock, runs_out}` (date or null). `best_action` contains
`{kind, title, item, demo}` and is selected deterministically: unanswered chats, urgent stock
without an open order, radar, yesterday's waste, stale menu, then first-history guidance.
`unavailable_rules` explicitly lists group buying and price check, which belong to other work.
Gemini may phrase `summary`; it cannot select or replace the structured action or quantities.

Weather is null when disabled/unavailable, otherwise `{temperature_c, rain_probability,
source, attribution, url, demo, sales_effect}`. `source` is `Open-Meteo` or `offline_fixture`.
The offline fixture is explicitly demo; show its attribution. No weather-to-sales inference
is currently emitted (`sales_effect: null`). Brief wording is claimed at most once per shop
per day; deterministic facts invalidate the cached response as stock/messages/signals change.

## Interaction and error semantics

- Owner reads require identity and repository ownership. Owner writes additionally require
  current consent. Expect 401 for missing identity, 404 for another owner's business or chat,
  428 for missing consent, 422 for invalid inputs, 409 for stale review/deadline/stock/hold
  conflicts, and 429 with `Retry-After` when a rate bucket is exhausted.
- A proposal is private until approved. Its review expires after at most ten minutes and
  becomes stale when its shop/inventory snapshot changes. Only one rescue per item per
  shop-local day can be approved, including after ending early. Deadlines cannot cross midnight
  or exceed saved closing time. Overnight hours are not supported.
- Reservations atomically cap available quantities on SQLite and Firestore, use an owned,
  usable chat, and are idempotent for the same thread/item/quantity. Different item casing
  uses the saved item spelling in the chat marker. Failed chat delivery compensates the hold;
  request cancellation is shielded through this operation. This is not a payment or pickup receipt.
- A new `rescue_deal` community update carries `rescue_id` and `ends`. Existing follower feed
  mechanics include it; ended/expired deals are suppressed by the server.
- Text and live-agent tool registries include `propose_rescue_deal`; the offline fixture parses
  “send a rescue deal for 6 croissants at 30% off until 8”. The resulting SSE event kind is
  `rescue_proposal`. It still requires the explicit HTTP review/approval flow.

## Privacy, storage and demo behavior

Discovery capture stores only a coarse geohash cell, day, canonical product terms/category,
constraints, price band, nearby-match counts and daily HMAC actor. It stores neither the query
nor exact coordinates or a customer account link. Unknown vocabulary is discarded rather than
persisted as a possibly identifying cluster. Owner searches are excluded. The signal day and
salt rotation both use UTC so a caller-supplied timezone cannot multiply actor-days.

Nearby supply checks use the entire available menu within the radar's fixed 2 km, even when
discovery requests a smaller radius or displays only three matched products. Signals have a
30-day retention window, aggregation uses 14 days with a seven-day half-life, and salts older
than the current rotation are removed on capture. This cleanup is request-driven.

Feature records use the existing document adapters, beside merchant records: the SQLite
`*-community.sqlite3` file locally and the app's Firestore community namespace when hosted.
Real signals (`demand_real`) and synthetic signals (`demand_demo`) are stored separately.
Merchant erasure removes rescue and brief records. A real and demo signal never share counts.

`demo_world.ensure_world` seeds three deterministic demand clusters and attempts up to two
labelled live rescue deals in eligible demo shops. Reloads preserve existing live deal IDs.
The real deadline and one-rescue-per-item/day rules still apply: outside usable closing hours,
or after exhausting that day's eligible items, the generator can return fewer live deals.

## Verification evidence

- Ruff lint and formatting: passed across application, tests, scripts and entry points.
- mypy: passed, 60 application source files.
- Full pytest suite with Firestore emulator on private loopback port 8587: **709 passed,
  2 skipped**, one existing ADK experimental-schema warning. The skips are checks specific
  to the other storage adapter. Three older emulator guards now accept explicit loopback
  ports rather than silently skipping memory, recall and rate-limit tests away from 8085.
  Owner feature subset:
  **50 passed** on SQLite and Firestore. Six new regression cases were observed failing
  before their fixes and passing afterwards on both repositories.
- OpenAPI exported offline and TypeScript regenerated using the installed tools. This also
  repaired a stale weather-source enum in the WIP contract.
- `npm run check`: passed (lint, TypeScript/Vite build, hook enforcement, browser suite).
  Browser results: **328 passed, 80 declared skips** on ports 3437/3537 with external requests
  blocked. An initial attempt was interrupted after page-load timeouts; an isolated check
  and the full rerun passed. Screenshot artifacts were restored to their pre-run bytes.
- Contract regeneration repeated without changing either generated file. Changed contract
  and handoff files pass Prettier; `git diff --check` passes. Repository-wide Prettier still
  flags five unchanged planning documents: `INFRA-1-firestore-replay.md` and the four
  `UI-1` through `UI-4` briefs under `docs/briefs/`. They were left outside this task.
- `graphify update .` ran AST-only. No cloud, billing, deployment or paid-model action was taken.

## Open limits

Live Gemini phrasing, voice recognition and Open-Meteo connectivity have not been exercised;
provider tests use mocks and explicit fixtures. Browser emulation is not a physical-phone test.
The browser dev-server log emitted MUI `SwipeableDrawer` touch-event `pageX` errors while
the suite passed; no UI code was changed to address that finding. Vite also reports existing
chunks exceeding its 500 kB warning threshold. Reservations and chat delivery are separate
document writes, so a process loss between them relies on retry rather than a cross-document
transaction.
Rescue uses category default demand curves and fixed/forecast-interval buffers; learned hourly
curves/buffers, pickup confirmation, release/change-hold UI and impact accounting are outside
this implementation. Inventory has no cost field for enforcing a below-cost discount floor.
Demand capture intentionally favors privacy over recall for unknown product names. Radius
reads are bounded to 500 recent records per storage scope, and missing Firestore composite
indexes use the existing bounded local-sort fallback. No indexes or cloud resources were changed.
