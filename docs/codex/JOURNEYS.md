# Chalkboard journeys

Design intent, written before implementation. This is a specification, not test evidence.
`../PLAN.md` was unavailable in this worktree; the task prompt supplies the two front doors
and customer direction. All checks and limitations belong in `FRONT-DOORS-EVIDENCE.md`.

## A — Two front doors

- A1: The public root is marketing with customer and business links, without a splash.
  `/explore/` is Chalkboard; business hostname and legacy Cloud Run hostname are
  Chalkboard Business. Localhost defaults to business. Explicit `app` overrides support tests.
- A2: Each app has its own standalone manifest, identity, icons and launch background.
  Customer scope is `/explore/`. Splash shows only during real shell/data loading;
  the mark animates once, within 1.2 seconds. Reduced motion removes the animation.
- A3: Old `/discover` and `/s/<id>` URLs replace themselves with customer URLs,
  preserving queries. Owner sharing uses the public bootstrap's customer origin.

## A4 — First customer visit

1. **Location (1 of 2):** Explain the benefit. Primary action uses location only after a
   tap. A neighbourhood selector and continue action work without permission. Denial
   teaches the neighbourhood alternative. Precise coordinates stay in memory.
2. **Interests (2 of 2):** Multi-select category filter chips. Primary action opens the
   feed; no selection means all categories. Back revisits location.
3. **Feed:** One dismissible coach mark explains category filters, shop cards and map.
   Completion/dismissal flags are optional local UI preferences; never persist personal
   data, merchant records, coordinates or credentials. Direct shop QR links skip setup.

## A5 — First owner visit

1. **Welcome (1 of 5):** Existing sign-in/local preview is the primary action.
2. **Consent (2 of 5):** Existing legal checkboxes and consent endpoint. Decline returns
   to welcome; failed consent retains choices and offers retry.
3. **Introduce the shop (3 of 5):** Coach empty state teaches “send a photo or tell me
   your shop name”. Existing composer is primary; photo remains an alternative.
4. **Confirm (4 of 5):** Existing exact sealed proposal review is the only save path.
   A saved shop teaches the next action: share the page. Never infer Google rights.
5. **Share (5 of 5):** Existing explicit share switch; only confirmed public state
   triggers celebration. Next action opens the actual customer page/QR controls.

Returning owners retain every existing feature. Guidance is additive, does not block
navigation, and derives from real consent/proposal/shared state rather than timers.

## B — Customer experience

Phone first, 412 CSS px, semantic Material roles in both themes. Editorial heading,
square bento filters, sticky category chips, substantial image cards, a swipeable
featured row with keyboard/tap alternatives, and a modal map sheet. Ranking labels
must explain when traffic/sales signals are unavailable; never invent popularity or
stock scarcity. Shop detail keeps existing question and conversation forms, adds
hero art/photo, confirmed facts, compact menu cards, and visible sold-out labels.
Unknown facts stay unknown. Placeholder category art is visibly labelled.

Navigation uses real links, progressive View Transitions, back/forward continuity,
48px targets, skip links and modal focus return. Motion uses transform/opacity and
shared theme easing; reduced motion is immediate. Heavy map/detail/hero code is lazy.

## C — Landing

Bold type, generous space, semantic colour blocks and original chalkboard artwork.
Sections: two-path hero, photo → coach → confirmed page, nearby freshness, APAC
languages, truthful owner control/privacy, clearly marked future social proof, footer.
Static hero renders first; interactive scene loads after paint only on eligible devices.
Scroll reveals progressively enhance visible content with CSS timelines and a JS
fallback. All copy follows English plus nine locale registries with English fallback.

## Acceptance and evidence

Playwright: local business default, overrides, redirects, manifests, no marketing
splash, first-run progress/denied location/re-entry, owner confirmation/share path,
customer search/filter/detail/map, reduced motion, keyboard/modal focus, light/dark,
translations and offline error recovery. Local-only network guard in every new spec.
Production asset graph gzip budget <150KB for initial customer feed (map/detail
excluded); Pixel 7 PerformanceObserver lab LCP <2.5s. Save 412px home/shop/map light
and dark screenshots in `customer-shots/`. These do not establish physical installation,
field LCP, live Google photo accuracy or provider-policy compliance.
