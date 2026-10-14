# Chalkboard demo stories: the definition of done (Oct 15–18)

**User priority (Oct 15):** make the stories of the **existing** features very strong, complete and
connected. New features come second.

Each story must work end to end on a phone (390×844), on the live site, outside Singapore, in English
and at least one Indian language. It must have no dead ends, use clear and meaningful motion (with
reduced-motion respected), and be honest about demo data. Each story has an automated walkthrough
in `tests/stories/` that the overnight loop runs.

**Status key:** ☐ not verified · ◐ works with friction (gaps listed) · ☑ verified end to end
(date and evidence).

## S1 · Owner sets up a shop in minutes

1. Open business.chalkboard.shreyaan.work.
2. Sign in and give consent.
3. Coach: photograph the menu or board, or describe the shop by voice or text.
4. Review card: name, category, items with prices, categories and units.
5. Confirm. My shop fills in, with readiness and Next step.
6. Set location (pin, photo GPS), hours and customer facts (halal, payment such as UPI, delivery).
7. Share the customer page: link and QR.

**Connects to:** S3 (customers see it), S5 (Google flow reuses the details and photos).

Status ◐ · 2026-10-15 · Offline phone walkthrough: `tests/stories/s1.spec.ts`.
Gaps: [A2, A10](docs/stories/AUDIT.md) — international offline pins and accessible extraction
disclosure. A6, A8 and A11 are fixed locally. Sign-in, recognition,
physical camera/GPS and hosted validation remain live-only.

## S2 · Daily upkeep in seconds (text or voice)

1. "Kopi is two dollars now, kaya toast sold out" by voice or text.
2. Confirm card, one tap.
3. The customer page updates instantly.
4. The sold-out switch on My shop.
5. Daily "still the same menu?" check.
6. Tap a price to edit it inline.
7. Import a menu or sales file (Excel, photo, PDF) with review.

**Connects to:** S3 and S4.

Status ◐ · 2026-10-15 · Offline phone walkthrough: `tests/stories/s2.spec.ts`.
Gaps: [A1](docs/stories/AUDIT.md) — conversational edits lack an offline fixture.
A3, A9 and A12 are fixed locally; visible public pages poll within about five seconds.
**Known:** the live voice model must actually call the tools (it said "I can't access your menu").
Reviewed manual edits and CSV import are verified fallbacks, not live voice/photo/PDF evidence.

## S3 · A customer finds a shop nearby and talks to it

1. Open chalkboard.shreyaan.work.
2. Use my location, or type a city. Demo and Google shops appear, nearest first.
3. Filters and categories.
4. Open a shop: photos, menu by category, prices, sold-out items, hours, facts, Demo label.
5. Ask "halal?" and get an instant answer from the shop's facts.
6. Message the owner, who replies in Messages.
7. The stamp card via `?source=qr`.
8. Light and dark mode.

**Connects to:** S1/S2 (owner data), S6 (personalisation, later).

Status ◐ · 2026-10-15 · Offline phone walkthrough: `tests/stories/s3.spec.ts`.
Gaps: [A2, A5](docs/stories/AUDIT.md) — typed-city fixtures and required customer sign-in.
A3, A4, A8, A11 and A12 are fixed locally.
Messages/replies, QR stamps and both themes are exercised. Confirmed-halal discovery filtering,
unavailable-page recovery and Indian date formatting are fixed locally; real Places/GPS remain live-only.

## S4 · Forecast → Source → Sell (merchant to merchant)

1. Prep plan: "flour runs out Thursday" (from real seeded sales history).
2. "Find suppliers".
3. Animated supplier cards appear in the chat.
4. Order by voice or text.
5. Confirm with one tap.
6. The supplier thread gets a labelled demo reply.
7. Orders tile.
8. Restocked, so the customer page stays accurate.

Status ◐ · in progress: account 2, branch `feat/sourcing`

## S5 · Get on Google

Details, then photos, then profile preview, then an honest "waiting for Google API access" with the
official links.

Status ◐ · 2026-10-15 · Offline phone walkthrough: `tests/stories/s5.spec.ts`.
Details → photo upload → INR profile preview → honest Google waiting state and official links
are exercised. Copied weekly hours are fixed locally.
A8, A11 and A12 are fixed locally: coach-photo reuse, preview affordances and motion.
Hosted validation, Google API access, verification and publication remain separate, live-only.

## S6 · Business identity and privacy

1. The face check creates a private business identity (optional, never blocking).
2. Privacy: consent, delete all my data.

Status ☐ · the user tests the face scan on a phone

## S7 · Any language, any country

1. Switch to Hindi, Tamil or another of the 15 languages. The coach replies in that language and
   text-to-speech speaks it.
2. Prices show in the local currency.
3. Demo shops exist in 8 cities.

Status ◐ · 2026-10-15 · Offline phone walkthrough: `tests/stories/s7.spec.ts`.
Gaps: [A2, A7](docs/stories/AUDIT.md) — eight-city discoverability and multilingual offline
replies/15-language coverage. A11 Tamil text metrics are fixed locally. INR/UPI, Tamil UI, speech locale dispatch
and eight labelled catalogue fixture pages are exercised; audible/live speech is unvalidated.
Indian languages remain in progress with the locale worker; their files were not edited.

## Later (after S1–S7 are ☑): customer AI entry and community

User decisions (Oct 15):

- **Home:** a full-screen AI prompt, voice or text, with today's nearby updates peeking below.
  Results are curated and animated.
- **Community:** all of follow shops plus an updates feed, neighbour tips and reviews (moderated,
  demo-seeded), locally made badges, and stamps and rewards.
- **Personalisation:** a signed-in (Google) profile holds preferences said in chat, followed shops
  and searches, and uses them for ranking. Browsing needs no sign-in.
- **Chat with owners:** requires sign-in. A WhatsApp-like thread. No anonymous chat.

## Overnight loop (account 1 orchestrates)

Every cycle:

1. Check the workers (account 2 headless, Codex) and resume any that stopped on a limit.
2. Merge finished branches.
3. Run the story walkthroughs.
4. File gaps here and in `BUGS.md`.
5. Assign fixes to the workers.
6. Ship when green (`scripts/ship.ps1`). The user approved overnight releases.

## Story polish 1 · local evidence

A3 fixed locally: customer pages update within about five seconds while visible and pause polling
when hidden. Cross-context phone test passed; [proof and screenshots](docs/stories/AUDIT.md).
All story statuses retain their hosted/live validation requirements.

A4 fixed locally: owner-stated halal answers agree with public chips and disclose the lack of
certification/verification. Four phone cases and English/Tamil backend cases passed.

A6 fixed locally: GPS on an existing-shop menu photo offers a separate pin review, with stale
approval rejection and explicit renewed review. Phone and backend location cases passed.

A8 fixed locally: explicit coach-photo gallery reuse, first-photo customer/discovery rendering,
and category-art fallback passed three phone cases and the gallery backend suite.

A9 fixed locally: the daily check remains reachable in continuing conversations and can be
dismissed for this tab/day, separately per shop. Strict phone isolation/next-day case passed.

A11 fixed locally: clearly labelled Google preview text, truthful Call availability, Tamil
composer/navigation metrics and distinct customer light surfaces passed four phone cases.
