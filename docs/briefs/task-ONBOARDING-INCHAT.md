# Track A (rest): camera, map, Maps hand-off and a phone-friendly form inside the onboarding chat

Same worktree, branch `feat/new-shop-flow` (PR #3). `git pull` first (Claude merged main into it).
Read docs/OWNER-NOTES.md, docs/PLAN-V2.md, docs/OWNER-NEW-SHOP.md. Ports 3449/3549 (3547 may hold a
live server). Do not touch: customer UI, supply chain (feat/supply-chain), trust/face
(feat/trust-fraud), backend business profiles (Codex will rebase on your branch).

## Owner's words
"Send a photo of your board: open the camera INSIDE the chat, not full screen. Ask the user to do
things (take a photo of this), open the camera, ask permission; make it unique, personalised."
"A map inside the chat window to pinpoint: a small view and a big view." "Google Maps: since we
have no Business Profile API, take the pinpoint and the shop details and hand them to Google
Maps (prefilled 'Add a missing place'; the owner submits)." "Manual entry on the phone is
terrible: if a manual flow is needed, make it much better (phone first)."

## Build (inside the voice-mode conversation; mic keeps working throughout)
1. **Inline camera card**: when the coach asks for a menu/board/shopfront photo, a camera
   viewfinder opens as a card in the conversation (not full screen), with a guide frame and the
   coach's instruction ("Fit the whole price board in the frame"), shutter, retake, use photo,
   upload fallback. Permission asked in context with a friendly explanation; denial handled with
   the same alert pattern (Try again / Upload instead / close). Guided multi-shot when useful
   (board, then shopfront).
2. **Inline map card**: small map in the conversation with a draggable pin and "Use my location";
   tap to expand to a big full-screen map, confirm the pin, accuracy shown, readable address.
   Uses existing Maps keys/reverse geocoding when available; honest fallback otherwise.
3. **Google Maps hand-off** (on the ready moment and in My shop): opens Google Maps' official
   "Add a missing place" (or the closest official URL) at the pinned location with the shop
   name/category prefilled where Google supports it; copy-to-clipboard for the rest; clearly
   says the owner submits it on Google. Never claims we published.
4. **Phone-friendly manual path**: replace any long form with a guided step-by-step journey
   (one field per screen, big targets, smart defaults, back/next, progress), reachable as
   "Type it in instead" from the conversation, and as "Edit details" in My shop.
## Done
Phone 390x844 + desktop, light + dark, 15 locales, axe clean, calm owner motion. Story test
updated (tests/stories/s10-new-shop.spec.ts) with fake camera and geolocation; screenshots
docs/stories/new-shop-camera-*.png, -map-*.png, -manual-*.png. Backend + `npm run check` + QA.
Commit small (no AI trailers), push, update docs/handoff/account2-status.md. Summarise.
