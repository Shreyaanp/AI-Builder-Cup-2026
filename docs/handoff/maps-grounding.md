# Maps grounding + interactive results map (handoff)

Branch `feat/maps-grounding`, built on `feat/customer-ai-first` (PR #11). Brief:
`docs/briefs/task-MAPS-GROUNDING.md`.

## What the customer gets

1. **Area questions answered with Google's live local knowledge.** "Is there parking near the
   market?", "what's open near the metro?", "best filter coffee near me" go to Gemini with the
   **Google Maps grounding tool** (Vertex), centred on the customer (`retrieval_config.lat_lng`)
   and in their language. The answer card shows the text, the **Google Maps places it used as
   source links**, and the words **"Google Maps"** (untranslated, Google's attribution rule).
2. **Our shops stay first.** Product matching is unchanged; our cards render above Google's
   answer whenever we sell the thing.
3. **One interactive results map.** Every place in the answer is pinned: our shops numbered like
   their cards (green), Google places (Places search + grounded places) in lilac, the customer as
   a blue dot, a green/grey ring for open/closed. Tap one of our pins → its card lights up and
   scrolls into view; hover/focus a card → the map glides to its pin. **Open map** (or a Google
   pin) opens the full-screen map: phone = map on top, results in a draggable bottom sheet (peek,
   half, full; the handle is also a button), desktop = list left, map right; rows and pins are
   linked both ways, and the selected row offers **Open shop** or **Open in Google Maps**.
4. **Browse "Map view" is never a blank grid** (QA sweep 1, finding 15): it uses the same map,
   with pins, legend, and the tapped place + Open button under it.
5. **Honest fallback.** No Google map (demo mode, no key, offline, blocked): the same pins on a
   local chalk street sketch, labelled "Map unavailable · straight-line distances". Grounding
   off or failing: one line ("Live Google Maps answers are off…" / "Google Maps couldn't answer
   just now…") and the normal list with straight-line distances. No Routes API anywhere.

## Switch, cost and cache

| Setting                        | Values                                                                            | Default                                                          |
| ------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `MAPS_GROUNDING`               | `off` (fallback line), `demo` (labelled sample answers, offline), `live` (Gemini) | `off` (`scripts/backend-dev.mjs` uses `demo` for previews/tests) |
| `MAPS_GROUNDING_MODEL`         | model id with Maps grounding                                                      | falls back to `GOOGLE_TEXT_MODEL`                                |
| `MAPS_GROUNDING_CACHE_SECONDS` | 60–86400                                                                          | 3600                                                             |

- `live` needs `GOOGLE_CLOUD_PROJECT` (Vertex) or `GOOGLE_API_KEY`; settings refuse to start
  otherwise. Location: `GOOGLE_CLOUD_LOCATION`.
- Grounding runs **only for area questions** (model flag `intent.area` or the multilingual
  `AREA` pattern), never for refinement chips or follow-ups that keep the same subject.
- **Cache:** per normalised question + ~1 km cell (lat/lng rounded to 2 dp) + language, single
  flight per key, 256 entries, failures never cached.
- Grounded places get coordinates from one cached Places details call each (max 5 per answer,
  only when the server Maps key is set).

## Code

- `backend/app/maps_grounding.py`: `grounding_request` (call shaping), `parse_grounded`
  (text + Maps sources + widget token), `AreaGrounding` (switch, cache, single flight, pinning),
  demo answers.
- `backend/app/discover_ask.py`: `Intent.area`, `AskResponse.area`, when to ground.
- `backend/app/discover.py`: `MapsService.place()` (Places details, cached).
- `src/features/discover/ResultsMap.tsx` (Google layer + sketch fallback), `MapExplorer.tsx`
  (full-screen map + sheet), `AnswerMap.tsx` (in the conversation), `AnswerCards.tsx`
  (`AreaAnswerCard`), `DiscoverMap.tsx` (Browse), `mapsSdk.ts` (loader), `mapCopy.ts` (15 locales).

## Evidence

- Backend: `backend/tests/test_maps_grounding.py` (call shaping, parse/attribution, cache per
  question+area+language, failures not cached, switch off never calls Gemini, live ask keeps our
  shop first, refinement makes no second call, demo pins, settings guard). Ruff, mypy clean.
- Story: `tests/stories/maps.spec.ts`, phone + desktop, light + dark, axe clean (12 tests).
- Screenshots: `docs/stories/maps-1-answer-*`, `maps-2-explorer-*`, `maps-3-parking-phone`,
  `maps-4-fallback`, `maps-5-browse-*`.

## Not verified here (honest)

- **Live Gemini Maps grounding and the live Google map were not exercised**: this machine has no
  Maps/Vertex keys and the browser tests block external hosts. The Google layer
  (`AdvancedMarkerElement`, `colorScheme`, `fitBounds`, `panTo`) is written against the Maps JS
  API but every screenshot shows the local fallback. First live check: set `MAPS_GROUNDING=live`,
  ask "is there parking near Tiong Bahru Market?", confirm sources + attribution render, and that
  `gemini-3.5-flash` (or `MAPS_GROUNDING_MODEL`) supports the Maps tool in the chosen location.
- Google's optional contextual Maps widget (`widget_token`) is returned by the API but not rendered.
- Sheet drag tested by tap/keyboard in Playwright; not on a physical phone.

## Final gates (16 Oct)

- `npm run lint`, `npm run build`, `npm run test:hooks`, Prettier: pass.
- Backend: Ruff, `ruff format --check`, mypy clean; pytest 639 passed, 171 skipped.
- Playwright: every spec file run with `--workers=1` in chunks (the machine is shared, so not
  one `npm run check`). All pass; first-test cold-start timeouts (`customer.spec.ts:62`,
  `budget`, `bugs-b30-b31`, `forecast`, `story-google-hours`) passed on rerun/retry.
- `tests/customer-ask.spec.ts` now finds the answer map as a `group` (it was an `img` before
  it had tappable pins). The maps story seeds its shops in Koramangala so it never pushes other
  stories' Indiranagar shops out of the top eight results.
