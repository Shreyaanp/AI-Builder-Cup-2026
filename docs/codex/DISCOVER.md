# Public discovery

`/discover` is the customer discovery page. It uses the existing React application,
Python service, shared-shop projections and `/api/v1/bootstrap` public configuration.
No customer account or server profile is required.

## Configuration for the lead

Mount the already provisioned secrets as environment variables:

- `MAPS_SERVER_KEY`: server-only key for Places API (New) and Geocoding.
- `MAPS_BROWSER_KEY`: referrer-restricted Maps JavaScript API key. The server exposes
  only this key through `/api/v1/bootstrap` as `maps_browser_key`.

Both are optional `SecretStr` settings. Either missing/empty key selects **Demo data**
mode. The local review runner explicitly empties both variables. Google requests are
replaced with HTTP fixtures in tests; Firestore tests use the local emulator and an
anonymous demo-project client. No cloud resources, billing or IAM were changed.

The existing `V1_ENABLED=true` and configured merchant adapter are needed to include
shared owner shops. Discovery still returns fixture/provider places without V1 records.

## Acceptance mapping

1. Optional coordinates, place ID and timezone are sealed with the proposal. An owner
   chooses **Find pin** to authorize the lookup, reviews **Pin: …**, then confirms the
   exact digest to save. A location change clears obsolete coordinates. An unrelated
   edit retains the saved pin. Fixture pins carry a demo label and can be looked up
   again after live configuration is mounted. No proposal preparation saves shop facts.
2. `GET /api/v1/discover` combines explicitly shared shops with Google/fixture places,
   checks haversine distance, ranks relevant Chalkboard shops first, projects up to
   three menu items and all sold-out names, and applies the existing limiter at 30/IP/min.
   Places and geocoding responses are held only in a bounded, single-flight, 10-minute
   memory cache. Places keys include rounded coordinates, radius, query and category.
   Provider failure leaves shared shops visible with an unavailable notice.
3. Phone-first Material 3 feed, search/category/open-now/known-halal/budget controls,
   contextual GPS permission and six manual Singapore areas. Filters are remembered
   on-device and reflected in the URL. The shared Sheet shows Google place details
   and a validated HTTPS Google Maps link. The Maps SDK loads only upon opening a live
   map; demo maps make no Google requests. English plus all nine translated locales
   follow the customer's phone language.
4. Your usuals stores six minimal opened-place references on this device, independently
   of owner preferences. It creates no customer server profile; demo references retain
   their disclosure when reopened.
5. `backend/tests/test_discover.py` covers both stores, fixture geocoding consent,
   sealed review, owner isolation, stale revisions, timezone hours, response caching,
   strict field masks, provider failure, public config and rate limits.
   `tests/discover.spec.ts` covers phone/desktop search, category/open-now/budget/halal,
   customer navigation, usuals, manual area persistence, GPS denial, recovery, localization,
   and light/dark axe checks including 412px and enlarged text.

## Evidence and limits

Verified October 14, 2026 with offline fixtures:

- **106 backend cases passed**, including SQLite and the local Firestore emulator:
  `test_discover.py`, `test_merchant_store.py`, `test_coach_tools.py`,
  `test_merchant_routes.py`, `test_sharing_routes.py`. One existing ADK experimental-schema
  warning remains. Used the existing Python 3.13 virtual environment, disabled bytecode
  writes, and placed pytest temporary files within this workspace.
- **12 Playwright cases passed**, with `CI=1`, two workers and no retries:
  `tests/discover.spec.ts`, phone and desktop. Final run used an ignored local configuration
  for isolated ports 3227/3337 because the default ports were occupied by another process.
- `npx --no-install tsc -b`, scoped ESLint with zero warnings, scoped Prettier check,
  Ruff check/format check and `mypy app` passed. OpenAPI and TypeScript contracts were
  regenerated offline. `git diff --check` and AST-only `graphify update .` passed.
- Screenshot review found and corrected MUI multiplying numeric corner-radius tokens;
  discovery cards and the shared sheet now use the intended pixel radii. Reviewed the
  resulting phone feed and sheet. Light/dark axe checks found no violations for the
  tested WCAG tags, including enlarged text and a 412px viewport.

Only the new browser spec and backend tests affected by changed models/routes/tools were
run. The full repository suite was not run, following the requested scope.

Live Places, Geocoding, Maps SDK rendering and key restrictions require lead validation;
no external service was contacted during this task. Emulator/phone emulation is not a
physical-phone test. Complex/day-specific hours stay unknown. Singapore uses its fixed
UTC+08:00 offset, including Windows without tzdata; other IANA zones require the runtime
timezone database. Halal stays unknown unless an explicit value is supplied: the current
shop schema and strict Google field mask supply no halal certification. Budget means a
known inexpensive Google price level or an available displayed SGD item at most SGD 10;
no cross-currency conversion is guessed. Shared-shop enumeration uses a simple scan;
larger catalogs will need spatial indexing. Google results are capped at 20 per search.

## Files changed

- Backend application: `backend/app/discover.py`, `shop_time.py`, `settings.py`,
  `main.py`, `limits.py`, `merchant.py`, `merchant_firestore.py`, `merchant_routes.py`,
  `coordinator.py`.
- Backend tests: `backend/tests/test_discover.py`, `conftest.py`, `test_coach_tools.py`,
  `test_merchant_store.py`, `test_sharing_routes.py`.
- Frontend feature: `src/features/discover/Discover.tsx`, `DiscoverMap.tsx`, `strings.ts`,
  `types.ts`.
- Frontend integration: `src/app/Root.tsx`, `src/features/v1/api.ts`, `ReviewDialog.tsx`,
  `Sheet.tsx`.
- Contract and review artifacts: `docs/openapi.json`, `src/api/generated.d.ts`,
  `scripts/backend-dev.mjs`, `tests/discover.spec.ts`, `docs/codex/DISCOVER.md`.

No commits, pushes, deployments, real Google API calls, cloud changes or secret-file reads
were performed.
