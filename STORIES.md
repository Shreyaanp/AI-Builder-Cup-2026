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
A10 fixed: the review sheet itself shows what the photo reader was unsure of (or that it was an offline fixture). A2 fixed: offline pins and
typed places work in all eight demo cities; exact photo GPS replaces an approximate demo pin. A6, A8 and A11 are fixed and live (99bed19). Sign-in, recognition,
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
A1 fixed: "Kopi is 20 rupees now, kaya toast sold out" opens one review card offline (menu items
only; a price in another currency is never guessed). Live voice verified against Vertex on
2026-10-15: gemini-3.8-live calls get_business_context then propose_products with both changes.
A3, A9 and A12 are fixed and live (99bed19); visible public pages poll within about five seconds.
Photo/PDF import and on-device speech recognition remain live-only evidence.

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
Gaps: [A5](docs/stories/AUDIT.md) — required customer sign-in (account 2). A2 typed places fixed.
A3, A4, A8, A11 and A12 are fixed and live (99bed19).
Messages/replies, QR stamps and both themes are exercised. Confirmed-halal discovery filtering,
unavailable-page recovery and Indian date formatting are fixed and live (99bed19); real Places/GPS remain live-only.

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
are exercised. Copied weekly hours are fixed and live (99bed19).
A8, A11 and A12 are fixed and live (99bed19): coach-photo reuse, preview affordances and motion.
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
Gaps: [A7](docs/stories/AUDIT.md) — (A2 eight-city places fixed) multilingual offline
replies/15-language coverage. A11 Tamil text metrics are fixed and live (99bed19). INR/UPI, Tamil UI, speech locale dispatch
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

A3 fixed and live (99bed19): customer pages update within about five seconds while visible and pause polling
when hidden. Cross-context phone test passed; [proof and screenshots](docs/stories/AUDIT.md).
All story statuses retain their hosted/live validation requirements.

A4 fixed and live (99bed19): owner-stated halal answers agree with public chips and disclose the lack of
certification/verification. Four phone cases and English/Tamil backend cases passed.

A6 fixed and live (99bed19): GPS on an existing-shop menu photo offers a separate pin review, with stale
approval rejection and explicit renewed review. Phone and backend location cases passed.

A8 fixed and live (99bed19): explicit coach-photo gallery reuse, first-photo customer/discovery rendering,
and category-art fallback passed three phone cases and the gallery backend suite.

A9 fixed and live (99bed19): the daily check remains reachable in continuing conversations and can be
dismissed for this tab/day, separately per shop. Strict phone isolation/next-day case passed.

A11 fixed and live (99bed19): clearly labelled Google preview text, truthful Call availability, Tamil
composer/navigation metrics and distinct customer light surfaces passed four phone cases.

## QA machine · 15 October 2026

`npm run test:qa` runs 118 end-to-end cases across every feature (phone and desktop). Findings live
in [docs/qa/QA-REPORT.md](docs/qa/QA-REPORT.md); open bugs stay as expected failures until fixed.

- Q8 (blocker, anonymous chat) fixed: new owner conversations need a signed-in customer.
- Q1 won't fix (owner decision): no multilingual offline coach replies; the live AI handles languages.
- In progress: owner side Q6, Q7, Q12–Q14 (Codex); customer side Q2–Q5, Q9–Q11 (account 2).

## Questions for the user

- (15 Oct 22:00) PR #3 (new-shop flow) and PR #6 (voice continuity) are green (all CI + impact); merge + release and launching account 2 headless are blocked by auto mode: need owner approval or a permission rule. PR #6 and #3 both touch backend/app/streaming.py (small conflict to resolve on the second merge).

- Next features: build (1) unmet-demand radar, (2) closing-time rescue deals and (3)
  neighbourhood passport badges, or swap in the morning brief, group buying or price check?

<!-- TRACK-R-CONTRACTS -->

## Track R · owner and customer story contracts (16 October 2026)

This section is the current acceptance contract. Earlier dated status entries above remain historical evidence. It does not mark a story complete. The walker reports partial paths and blocked entries honestly; [scorecard](docs/qa/story-scorecard.md) records what actually ran. S1–S7 retain their IDs; S8–S21 make the newer owner/customer/supplier journeys explicit. Weekly recap, menu import, shop switching and guided tour are subjourneys of S10/S15, S2/S18 and S1; owner messages are the other side of S3. Install is optional in S7.

### Shared acceptance for every screen

- Phone 390×844 and desktop 1440×1000; both appearances. Each matrix cell below is a required state, not a claim that fault injection tested it.
- Keyboard, meaningful labels/headings, focus return, ≥48px product touch targets, safe areas, 200% text, 320px reflow and locale-appropriate typography.
- One primary action and at most one meaningful motion moment; reduced motion preserves the same information and controls.
- Loading preserves context; empty names the next action; error/offline preserve drafts and give recovery; success requires acknowledgement. No silent edits, publication, order transmission or payment.
- Demo/model/identity/authority/liveness/publishing statuses stay distinct. No synthetic fixture proves live ASR, Gemini accuracy or biometric matching.
- No end-to-end completion until the next story receives the correct saved context and all required state/device checks are recorded.

### S1 · Owner opens and shares a shop

**Persona:** First-time independent shop owner, one hand free. **Trigger:** Header +, end of tour, or empty My shop. **Fix area:** owner onboarding.

1. Choose local preview; consent explicitly.
2. Start full-screen guided chat; give name before business kind.
3. Use text, voice or inline camera; inspect evolving shop card.
4. Review and confirm; set pin, hours and relevant facts.
5. Open My shop and share public link/QR.

| Screen              | Loading                                                                                        | Empty                                                  | Error                                                                                          | Offline                                                          | Success                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Welcome and consent | Keep welcome and consent heading and Back visible; reserve final geometry; announce busy once. | Explain what the assistant does before asking for data | Terms failure leaves consent unchecked; retry                                                  | Readable local introduction; hosted sign-in needs connection     | Continue only after both consents                                          |
| Guided shop chat    | Keep guided shop chat heading and Back visible; reserve final geometry; announce busy once.    | Ask for the name; never invent it                      | Mic denied / lost connection / rate limit: Try again, Type instead, Close; preserve transcript | Draft remains visible; no invented reply or implicit save        | Name first; one relevant question at a time; text always available         |
| Review and My shop  | Keep review and my shop heading and Back visible; reserve final geometry; announce busy once.  | No menu: add an item or return to chat                 | Inline field recovery and stale revision re-review                                             | Keep draft; block remote approval with explanation               | Show source uncertainty, exact changes and next action; only confirm saves |
| Share page          | Keep share page heading and Back visible; reserve final geometry; announce busy once.          | Sharing off: explicit switch and explanation           | Retry generating share link; retain visibility choice                                          | Do not claim public propagation; show copied cached link as such | Public page agrees with saved menu; QR and link are labelled               |

**One motion moment:** Shop-card field settles once after an owner answer; static changed-field cue under reduced motion.

**Emotional beat:** I can open my shop without learning software.

**Hand-off:** S2 keeps the menu fresh; S3 sees it; S5 reuses it.

**Acceptance checks:**

- [ ] All three entry points reach the same journey.
- [ ] Never infer owner authority from Google sign-in.
- [ ] No edit is saved before review approval.
- [ ] Vegetarian shops never receive an irrelevant halal question.
- [ ] Back and IME do not lose the draft.

**Evidence:** [phone/light](docs/stories/director/s1/phone-light/run.json), [phone/dark](docs/stories/director/s1/phone-dark/run.json), [desktop/light](docs/stories/director/s1/desktop-light/run.json), [desktop/dark](docs/stories/director/s1/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S2 · Daily upkeep by text or voice

**Persona:** Busy café owner between customers. **Trigger:** A price changes or an item runs out. **Fix area:** coach.

1. Say Kopi is 20 rupees now, kaya toast sold out.
2. Review both changes together.
3. Confirm once.
4. Open customer page and verify fresh stock.
5. Dismiss daily check for this shop/day; edit price inline.

| Screen              | Loading                                                                                        | Empty                                  | Error                                            | Offline                                                    | Success                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Coach update        | Keep coach update heading and Back visible; reserve final geometry; announce busy once.        | No active shop: offer S1               | Failed send retains exact draft; retry or cancel | Offline warning preserves draft; fixture label is explicit | Two changes in one review; stop remains reachable               |
| Update review       | Keep update review heading and Back visible; reserve final geometry; announce busy once.       | No recognised edits: clarify one thing | Stale inventory forces renewed review            | No optimistic claim of remote save                         | Before/after values, currency and sold-out status match request |
| Public menu refresh | Keep public menu refresh heading and Back visible; reserve final geometry; announce busy once. | Unshared shop links to share setup     | Retry refresh with last-updated indicator        | Cached menu has age; no fresh-stock claim                  | Price and availability match saved values within polling window |

**One motion moment:** One value fade on confirmed change; reduced motion uses Updated text.

**Emotional beat:** Two small edits, and I am done.

**Hand-off:** S3 trusts today’s menu; S15 records the day.

**Acceptance checks:**

- [ ] Inventory unchanged before approval.
- [ ] Cancel saves nothing.
- [ ] Stop and retry preserve text.
- [ ] Cross-context public refresh tested separately from local rendering.

**Evidence:** [phone/light](docs/stories/director/s2/phone-light/run.json), [phone/dark](docs/stories/director/s2/phone-dark/run.json), [desktop/light](docs/stories/director/s2/desktop-light/run.json), [desktop/dark](docs/stories/director/s2/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S3 · Customer discovers and talks to a shop

**Persona:** Neighbour looking for something useful nearby. **Trigger:** Customer landing or shared shop link. **Fix area:** customer.

1. Use location or type a city.
2. Ask for an item; refine category, budget and facts.
3. Open shop and inspect prices, availability and hours.
4. Ask instant fact question.
5. Sign in only to message owner; owner replies.
6. Return to results with filters and scroll preserved.

| Screen                          | Loading                                                                                                    | Empty                                      | Error                                          | Offline                                                        | Success                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Location and Ask                | Keep location and ask heading and Back visible; reserve final geometry; announce busy once.                | No location: type a city without sign-in   | GPS denied: typed fallback, no repeated prompt | Cached area identified; changing area explains connection need | Location choice leads to an AI prompt and useful example                 |
| Results and shop                | Keep results and shop heading and Back visible; reserve final geometry; announce busy once.                | No match: relax one filter or change area  | Unavailable shop offers Back to results        | Cached shop age visible; holds and messages not falsely sent   | Curated relevant cards with distance, source, price and one next action  |
| Instant answer and owner thread | Keep instant answer and owner thread heading and Back visible; reserve final geometry; announce busy once. | No fact: say unknown; offer owner question | Send error keeps text and Retry                | Draft remains; sent status waits for acknowledgement           | Answer cites owner facts; owner message requires identity; reply arrives |

**One motion moment:** One curated card reveal after the query; immediate cards under reduced motion.

**Emotional beat:** That is nearby, relevant, and easy to ask about.

**Hand-off:** S8 stamp; S16 follow; S9 rescue; S17 concierge.

**Acceptance checks:**

- [ ] Browsing and instant facts need no sign-in.
- [ ] Owner chat always needs sign-in.
- [ ] Owner-stated halal is never certified by the app.
- [ ] Back restores state.
- [ ] Light/dark keep photos in colour.

**Evidence:** [phone/light](docs/stories/director/s3/phone-light/run.json), [phone/dark](docs/stories/director/s3/phone-dark/run.json), [desktop/light](docs/stories/director/s3/desktop-light/run.json), [desktop/dark](docs/stories/director/s3/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S4 · Forecast → source → sell

**Persona:** Owner who will run out of flour. **Trigger:** Prep plan identifies a shortfall. **Fix area:** coach.

1. Inspect forecast range and provenance.
2. Find nearby suppliers in coach.
3. Compare quantity, unit, price and demo status.
4. Request 20 kg flour and 5 kg sugar.
5. Review then Send; inspect supplier reply and Orders.
6. Approve receipt before any stock change.

| Screen                  | Loading                                                                                            | Empty                                           | Error                                                   | Offline                                         | Success                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Prep and supplier cards | Keep prep and supplier cards heading and Back visible; reserve final geometry; announce busy once. | No history: explain import requirement          | Forecast unavailable: retry without losing stock counts | Read last plan with age; no live supplier claim | A shortfall has a supplier action; list fits beside reachable composer |
| Order proposal          | Keep order proposal heading and Back visible; reserve final geometry; announce busy once.          | No supplier: broaden radius or contact manually | Version conflict requires review again                  | Keep draft; no sent receipt                     | Exact items, units, supplier and no-payment note before Send           |
| Orders and receipt      | Keep orders and receipt heading and Back visible; reserve final geometry; announce busy once.      | No orders: Find suppliers                       | Retry thread refresh; retain draft reply                | Read history as cached; never infer delivery    | Acknowledged thread links back to order; receipt separately reviewed   |

**One motion moment:** Selected supplier moves into one review card; static selection under reduced motion.

**Emotional beat:** I can keep selling without losing control.

**Hand-off:** S19 handles documents; S2 updates stock.

**Acceptance checks:**

- [ ] Send is physically reachable after supplier results.
- [ ] No supplier contact before approval.
- [ ] Demo replies clearly labelled.
- [ ] Order confirmation never means goods received.

**Evidence:** [phone/light](docs/stories/director/s4/phone-light/run.json), [phone/dark](docs/stories/director/s4/phone-dark/run.json), [desktop/light](docs/stories/director/s4/desktop-light/run.json), [desktop/dark](docs/stories/director/s4/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S5 · Assisted Get on Google

**Persona:** Owner without Business Profile API access. **Trigger:** Google/Features destination. **Fix area:** my shop.

1. Review reusable details.
2. Add or reuse photos.
3. Inspect profile preview.
4. Copy checklist/details.
5. Inspect official Google hand-off without navigating externally.

| Screen               | Loading                                                                                         | Empty                                                     | Error                                         | Offline                                                  | Success                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Details and photos   | Keep details and photos heading and Back visible; reserve final geometry; announce busy once.   | No shop: S1; no photo: add or skip with truthful guidance | Photo rejected: reason and replace action     | Keep local selections; do not claim upload               | Checklist names gaps; gallery reuse is explicit                          |
| Preview and hand-off | Keep preview and hand-off heading and Back visible; reserve final geometry; announce busy once. | Incomplete profile: return to specific missing field      | Unavailable hand-off keeps copyable checklist | Official links remain inspectable but require online use | Preview says preview; Google access and owner submission remain separate |

**One motion moment:** One directional transition between checklist and preview; headings receive focus.

**Emotional beat:** I know what to do next and who actually submits it.

**Hand-off:** S1 details repair; S20 broader Features.

**Acceptance checks:**

- [ ] No claim of Google affiliation or automatic publication.
- [ ] Hours/currency/photos match saved shop.
- [ ] External links inspected, never opened in this run.
- [ ] Back returns to prior step.

**Evidence:** [phone/light](docs/stories/director/s5/phone-light/run.json), [phone/dark](docs/stories/director/s5/phone-dark/run.json), [desktop/light](docs/stories/director/s5/desktop-light/run.json), [desktop/dark](docs/stories/director/s5/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S6 · Optional identity and privacy

**Persona:** Privacy-conscious owner deciding whether to enrol. **Trigger:** Privacy or optional trust step. **Fix area:** trust.

1. Read face-check purpose and limitations.
2. Skip or inspect explicit consent without capture.
3. Open delete-all confirmation; cancel.
4. Test failed and partial deletion recovery.
5. Delete only this synthetic workspace; verify public removal.

| Screen                            | Loading                                                                                                      | Empty                           | Error                                                        | Offline                                                        | Success                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Privacy and optional face         | Keep privacy and optional face heading and Back visible; reserve final geometry; announce busy once.         | No template: say none stored    | Worker unavailable: Type/skip and retry; never mark verified | Explain worker needs connection; ordinary editing continues    | Skip always works; account, authority, face and liveness are distinct |
| Deletion confirmation and receipt | Keep deletion confirmation and receipt heading and Back visible; reserve final geometry; announce busy once. | No records: still explain scope | Failed/partial deletion lists pending work and Retry         | Never claim erased on request failure; keep recovery reachable | Confirm, show progress, then erased or named pending stores           |

**One motion moment:** One completion state fade after deletion receipt; no face success theatre.

**Emotional beat:** My choices and data remain mine.

**Hand-off:** S1 can restart; S5 never inherits face-based publishing rights.

**Acceptance checks:**

- [ ] Cancel keeps records.
- [ ] Delete removes public synthetic shop.
- [ ] Partial status never says complete.
- [ ] No biometric capture or accuracy claim in director run.

**Evidence:** [phone/light](docs/stories/director/s6/phone-light/run.json), [phone/dark](docs/stories/director/s6/phone-dark/run.json), [desktop/light](docs/stories/director/s6/desktop-light/run.json), [desktop/dark](docs/stories/director/s6/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S7 · Language, country, appearance and optional install

**Persona:** Tamil-speaking owner/customer outside Singapore. **Trigger:** Language or appearance preference. **Fix area:** my shop.

1. Choose Tamil; inspect composer/nav.
2. Choose Hindi and Japanese; inspect script fallback.
3. Open INR shop and weekly hours.
4. Toggle light/dark and reload.
5. Inspect optional installation; close and continue web use.

| Screen                       | Loading                                                                                                 | Empty                                                   | Error                                                          | Offline                                                              | Success                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Settings and script surfaces | Keep settings and script surfaces heading and Back visible; reserve final geometry; announce busy once. | No translation: truthful fallback, never blank controls | Font unavailable: system script fallback; keep controls usable | Already loaded copy works; unavailable font chunk does not hide text | Correct html language, uncut labels, local prices and dates |
| Install guidance             | Keep install guidance heading and Back visible; reserve final geometry; announce busy once.             | Not installable: plain guidance and continue web        | Installation failure leaves web app usable                     | Do not infer offline readiness from manifest                         | Explain availability; close returns to app                  |

**One motion moment:** Only the shared appearance transition, disabled under reduced motion.

**Emotional beat:** This app understands my language and surroundings.

**Hand-off:** Every other story retains language and appearance.

**Acceptance checks:**

- [ ] 200% text and 320px reflow remain manual release checks.
- [ ] Indic marks not clipped; no grapheme-by-grapheme animation.
- [ ] No multilingual offline model quality claim.
- [ ] Install never blocks use.

**Evidence:** [phone/light](docs/stories/director/s7/phone-light/run.json), [phone/dark](docs/stories/director/s7/phone-dark/run.json), [desktop/light](docs/stories/director/s7/desktop-light/run.json), [desktop/dark](docs/stories/director/s7/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S8 · Passport, stamps, quests and scratch rewards

**Persona:** Neighbour returning to local shops. **Trigger:** Shop visit QR or Passport destination. **Fix area:** passport/games.

1. Read how stamps work and the reward threshold.
2. Visit a labelled demo shop or inspect unsigned phone-only stamp.
3. Open Passport, area and quest.
4. Inspect reward conditions; duplicate visit must not earn twice.
5. Inspect collection sets, kind streak/freeze and an opt-in street goal without inventing earned progress.
6. Return to a next nearby stop.

| Screen                   | Loading                                                                                             | Empty                                                          | Error                                                   | Offline                                                           | Success                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stamp card and moment    | Keep stamp card and moment heading and Back visible; reserve final geometry; announce busy once.    | First visit: concrete how-to and shop action                   | Invalid/duplicate QR: reason; no unearned celebration   | No verified points offline; phone-only status explicit            | Explain scan location, points/storage scope and next threshold                                 |
| Passport and quests      | Keep passport and quests heading and Back visible; reserve final geometry; announce busy once.      | No stamps: first-stamp journey, no guilt                       | Retry account progress; preserve on-phone card          | Cached progress labelled; no double awarding                      | Progress, next stop and reward conditions stay visible                                         |
| Scratch reward           | Keep scratch reward heading and Back visible; reserve final geometry; announce busy once.           | Not eligible: show exact remaining requirement                 | Reward unavailable: retry without consuming entitlement | Do not consume a reward without acknowledgement                   | Visible eligibility and tap/reveal keyboard alternative                                        |
| Weekly streak and freeze | Keep weekly streak and freeze heading and Back visible; reserve final geometry; announce busy once. | No visits yet: one first-stop suggestion                       | Failed freeze keeps entitlement; retry safely           | Read cached streak; do not spend a freeze without acknowledgement | Current week and freeze entitlement explicit; missed weeks never shame the person              |
| Collection set           | Keep collection set heading and Back visible; reserve final geometry; announce busy once.           | No collected items: next eligible stop                         | Expired/ineligible item explains remaining requirement  | Cached collection labelled; no new verified award                 | Visible set requirements and owner-funded benefit; gifted starting progress labelled as a gift |
| Co-op street goal        | Keep co-op street goal heading and Back visible; reserve final geometry; announce busy once.        | No neighbours joined: browsing and personal rewards still work | Failed join/contribution rolls back; show retry         | Read last aggregate with age; no invented contributions           | Explain aggregate goal and opt-in sharing; one eligible contribution counts once               |

**One motion moment:** One stamp thud OR reward reveal, never both queued; static earned state under reduced motion.

**Emotional beat:** I am becoming a regular, without pressure.

**Hand-off:** S3 next stop; S9 rescue stamp; S16 follow.

**Acceptance checks:**

- [ ] Instructions prominent before first stamp.
- [ ] Unsigned device stamp does not imply verified visit.
- [ ] Scratch has non-drag alternative.
- [ ] Demo perks are not real entitlements.
- [ ] Social participation is opt-in and resettable; no identity/location leakage.
- [ ] Gifted progress is not a verified visit; freezes and contributions are idempotent.

**Evidence:** [phone/light](docs/stories/director/s8/phone-light/run.json), [phone/dark](docs/stories/director/s8/phone-dark/run.json), [desktop/light](docs/stories/director/s8/desktop-light/run.json), [desktop/dark](docs/stories/director/s8/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S9 · Closing-time rescue and collection

**Persona:** Owner with leftovers and neighbour seeking pickup. **Trigger:** Real closing window and owner-confirmed leftovers. **Fix area:** customer.

1. Owner inspects estimate and confirms portions, price and pickup window.
2. Preview then publish offer.
3. Customer finds labelled rescue and asks for a hold.
4. Owner explicitly confirms; customer collects.
5. Owner marks collected; passport receives one rescue stamp.

| Screen                    | Loading                                                                                              | Empty                                       | Error                                                 | Offline                                       | Success                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Owner rescue review       | Keep owner rescue review heading and Back visible; reserve final geometry; announce busy once.       | No estimate: ask actual leftover count      | Invalid time/stock: inline repair                     | Preserve draft; no offer published            | Owner confirms portions and closing-bound time before send   |
| Rescue discovery and hold | Keep rescue discovery and hold heading and Back visible; reserve final geometry; announce busy once. | No rescues: follow shops or browse normally | Sold out race: explain and offer another shop         | Read cached offers; no successful hold        | Real expiry, source and remaining portions; sign-in for hold |
| Collection receipt        | Keep collection receipt heading and Back visible; reserve final geometry; announce busy once.        | No hold: explain how pickup is agreed       | Duplicate pickup idempotent; recovery explains status | No collection/impact claim until acknowledged | Confirmed pickup alone changes impact and stamp              |

**One motion moment:** One collection stamp; countdown stays calm and does not flash.

**Emotional beat:** A worthwhile find and less waste, with no rush trick.

**Hand-off:** S8 passport; S15 actual leftover record.

**Acceptance checks:**

- [ ] Forecast is estimate.
- [ ] Hold is not payment or guaranteed fulfilment.
- [ ] Expired/sold-out races tested.
- [ ] No invented environmental savings.

**Evidence:** [phone/light](docs/stories/director/s9/phone-light/run.json), [phone/dark](docs/stories/director/s9/phone-dark/run.json), [desktop/light](docs/stories/director/s9/desktop-light/run.json), [desktop/dark](docs/stories/director/s9/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S10 · Morning brief and rich coaching

**Persona:** Owner opening up with little time. **Trigger:** First open of business day or ask for forecast. **Fix area:** coach.

1. Read prep, stock and one best action.
2. Ask Analyse my forecast.
3. Inspect chart range, units and history.
4. Open supporting data or next action.

| Screen             | Loading                                                                                       | Empty                                  | Error                                               | Offline                                      | Success                                                              |
| ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Brief and analysis | Keep brief and analysis heading and Back visible; reserve final geometry; announce busy once. | New shop: close one day/import history | Forecast unavailable: retain stock inputs and retry | Last plan age visible; no live weather claim | One decision headline; chart plus text summary, units and provenance |
| Next action        | Keep next action heading and Back visible; reserve final geometry; announce busy once.        | Nothing urgent: calmly say ready       | Failed navigation has return to brief               | Read only; do not auto-order                 | Action lands at supplier/menu/message context                        |

**One motion moment:** Chart reveals once on answer arrival; static labelled chart under reduced motion.

**Emotional beat:** I know the one thing to do today.

**Hand-off:** S4 source; S11 demand; S15 close.

**Acceptance checks:**

- [ ] Chart never relies only on colour.
- [ ] Offline method not called TimesFM.
- [ ] Summary usable without chart.
- [ ] One best action outranks decorative metrics.

**Evidence:** [phone/light](docs/stories/director/s10/phone-light/run.json), [phone/dark](docs/stories/director/s10/phone-dark/run.json), [desktop/light](docs/stories/director/s10/desktop-light/run.json), [desktop/dark](docs/stories/director/s10/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S11 · Unmet-demand radar to menu

**Persona:** Owner considering a useful new item. **Trigger:** Asked nearby suggestion. **Fix area:** my shop.

1. Open aggregated opportunities.
2. Inspect range, period and fit.
3. Choose Add to menu or Find supplier.
4. Review any proposed menu change.
5. Confirm and verify customer-visible item.

| Screen             | Loading                                                                                       | Empty                                         | Error                                 | Offline                         | Success                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------- | ------------------------------- | ------------------------------------------------------------ |
| Demand opportunity | Keep demand opportunity heading and Back visible; reserve final geometry; announce busy once. | Below threshold: explain minimum; no raw asks | Retry aggregate load                  | Cached aggregate age visible    | Counts are bands with area/time and demo/source label        |
| Opportunity action | Keep opportunity action heading and Back visible; reserve final geometry; announce busy once. | Already sold: explain and choose another idea | No comparison data: no invented price | Keep idea, do not silently save | Relevant business-type suggestion leads to reviewed proposal |

**One motion moment:** One opportunity selection emphasis; no looping radar while reading.

**Emotional beat:** I can respond to what neighbours actually need.

**Hand-off:** S4 sourcing; S2 menu; S3 discovery.

**Acceptance checks:**

- [ ] No identities/raw customer queries exposed.
- [ ] No claim nobody sells it without complete coverage.
- [ ] Privacy thresholds stay explicit.
- [ ] No dietary mismatch.

**Evidence:** [phone/light](docs/stories/director/s11/phone-light/run.json), [phone/dark](docs/stories/director/s11/phone-dark/run.json), [desktop/light](docs/stories/director/s11/desktop-light/run.json), [desktop/dark](docs/stories/director/s11/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S12 · Owner price check

**Persona:** Owner checking a price without racing to the bottom. **Trigger:** Price comparison next to menu price. **Fix area:** my shop.

1. Inspect comparable item/unit/currency.
2. Read median, range, sample and demo count.
3. Keep own price or review an edit.
4. Confirm only if chosen.

| Screen           | Loading                                                                                     | Empty                            | Error                                       | Offline                         | Success                                            |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| Price comparison | Keep price comparison heading and Back visible; reserve final geometry; announce busy once. | Too few shops: insufficient data | Mixed units/currencies excluded with reason | Cached comparison age visible   | Comparable range, unit and sample; neutral wording |
| Price edit       | Keep price edit heading and Back visible; reserve final geometry; announce busy once.       | Keep price closes without write  | Invalid price inline repair                 | Draft preserved; no saved claim | Before/after price reviewed independently          |

**One motion moment:** One selected value fade, no animated judgement gauge.

**Emotional beat:** I can decide confidently; the app does not dictate my price.

**Hand-off:** S2 approved upkeep.

**Acceptance checks:**

- [ ] No cheapest ranking for customers.
- [ ] No misleading shop-level Places price as item median.
- [ ] No auto-price changes.

**Evidence:** [phone/light](docs/stories/director/s12/phone-light/run.json), [phone/dark](docs/stories/director/s12/phone-dark/run.json), [desktop/light](docs/stories/director/s12/desktop-light/run.json), [desktop/dark](docs/stories/director/s12/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S13 · Group buy to individual order

**Persona:** Small owner pooling a supplier minimum. **Trigger:** Supplier tier or brief suggestion. **Fix area:** supply chain.

1. Inspect tier, deadline and delivery terms.
2. Join with own quantity.
3. Review aggregate progress.
4. At close approve own order or cancel fallback.

| Screen              | Loading                                                                                        | Empty                                        | Error                                                    | Offline                                        | Success                                              |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Group invitation    | Keep group invitation heading and Back visible; reserve final geometry; announce busy once.    | No groups: source normally                   | Join conflict retains quantity and explains latest total | No joined claim without server acknowledgement | My quantity, target tier, deadline and terms         |
| Close and own order | Keep close and own order heading and Back visible; reserve final geometry; announce busy once. | Tier missed: explicit fallback/cancel choice | Changed tier requires renewed approval                   | Draft retained; no money collected             | Own liability and current price reviewed before Send |

**One motion moment:** One progress fill after acknowledged join; static total under reduced motion.

**Emotional beat:** Together we can meet the minimum, with clear commitments.

**Hand-off:** S4 order; S14 supplier response; S19 documents.

**Acceptance checks:**

- [ ] Never auto-order at deadline.
- [ ] No private member forecasts shown.
- [ ] No platform payment guarantee.

**Evidence:** [phone/light](docs/stories/director/s13/phone-light/run.json), [phone/dark](docs/stories/director/s13/phone-dark/run.json), [desktop/light](docs/stories/director/s13/desktop-light/run.json), [desktop/dark](docs/stories/director/s13/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S14 · Supplier radar and offer

**Persona:** Wholesale supplier serving nearby shops. **Trigger:** Supplier mode and demand signal. **Fix area:** supply chain.

1. Switch Shop/Supplier context.
2. Inspect aggregate need and open groups.
3. Draft price, MOQ and delivery offer.
4. Review and send; inspect incoming order.

| Screen           | Loading                                                                                     | Empty                             | Error                                     | Offline                      | Success                                                           |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| Supplier demand  | Keep supplier demand heading and Back visible; reserve final geometry; announce busy once.  | Below threshold: no private hints | Retry load without losing mode            | Cached aggregate age visible | Aggregate item/area/time with source; no shop forecast disclosure |
| Offer and orders | Keep offer and orders heading and Back visible; reserve final geometry; announce busy once. | No orders: visible source action  | Offer validation inline; no silent resend | Pending offer stays draft    | Exact terms reviewed; order reply labelled demo when simulated    |

**One motion moment:** One offer acknowledgement; no perpetual demand pulse.

**Emotional beat:** I can help nearby businesses at the right time.

**Hand-off:** S13 group; S19 documents.

**Acceptance checks:**

- [ ] Real shops opt in to aggregate needs.
- [ ] Supplier flag is not verified authority.
- [ ] Sending offer needs explicit approval.

**Evidence:** [phone/light](docs/stories/director/s14/phone-light/run.json), [phone/dark](docs/stories/director/s14/phone-dark/run.json), [desktop/light](docs/stories/director/s14/desktop-light/run.json), [desktop/dark](docs/stories/director/s14/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S15 · Close the day and plan tomorrow

**Persona:** Tired owner at closing. **Trigger:** Close the day tile or spoken sales note. **Fix area:** my shop.

1. Enter sold/waste/stock by text or photo.
2. Inspect parsed counts and uncertainty.
3. Review and save exact day once.
4. Read tomorrow’s plan and low-stock action.

| Screen              | Loading                                                                                        | Empty                                           | Error                                          | Offline                                 | Success                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Daily counts        | Keep daily counts heading and Back visible; reserve final geometry; announce busy once.        | No sales: allow true zero; explain missing data | Unreadable photo: type instead and retain file | Keep typed counts; no saved claim       | Small guided count task; day and units explicit |
| Review and tomorrow | Keep review and tomorrow heading and Back visible; reserve final geometry; announce busy once. | Insufficient history: explain how to start      | Stale day/revision requires re-review          | Last plan dated; no fabricated forecast | Actual counts separated from forecast estimates |

**One motion moment:** One quiet saved-day check, then a static tomorrow summary.

**Emotional beat:** The day is finished and tomorrow feels manageable.

**Hand-off:** S10 brief; S4 restock; S9 rescue.

**Acceptance checks:**

- [ ] Cancel writes nothing.
- [ ] Zero distinct from unknown.
- [ ] Duplicate confirmation cannot double-count.

**Evidence:** [phone/light](docs/stories/director/s15/phone-light/run.json), [phone/dark](docs/stories/director/s15/phone-dark/run.json), [desktop/light](docs/stories/director/s15/desktop-light/run.json), [desktop/dark](docs/stories/director/s15/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S16 · Follow, community, tips and personal preferences

**Persona:** Neighbour wanting useful updates. **Trigger:** A shop worth returning to. **Fix area:** customer.

1. Follow a shop.
2. Open Saved/updates; inspect source labels.
3. Set chat preferences explicitly.
4. Submit a tip; see moderation status.
5. Unfollow or delete own contribution.

| Screen               | Loading                                                                                         | Empty                                 | Error                                           | Offline                               | Success                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| Saved and updates    | Keep saved and updates heading and Back visible; reserve final geometry; announce busy once.    | No follows: browse local shops        | Follow failure rolls back with retry            | Cached follows explained; writes wait | Followed shops, labelled updates and next discovery action      |
| Tips and preferences | Keep tips and preferences heading and Back visible; reserve final geometry; announce busy once. | No tips: helpful example; no pressure | Rejected tip explains repair without publishing | Keep draft; no submitted claim        | Consentful profile, pending moderation and edit/delete controls |

**One motion moment:** One follow acknowledgement; reduced motion uses selected text.

**Emotional beat:** These are my places, without an endless feed.

**Hand-off:** S3 rediscovery; S8 visits; S9 useful rescue.

**Acceptance checks:**

- [ ] No exact customer location on social screens.
- [ ] Demo tips clearly labelled.
- [ ] Personalisation scope stated.
- [ ] Unfollow restores previous state on failure.

**Evidence:** [phone/light](docs/stories/director/s16/phone-light/run.json), [phone/dark](docs/stories/director/s16/phone-dark/run.json), [desktop/light](docs/stories/director/s16/desktop-light/run.json), [desktop/dark](docs/stories/director/s16/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S17 · AI concierge asks shop agents

**Persona:** Neighbour with a concrete availability request. **Trigger:** Find 2 kg paneer by 6 pm. **Fix area:** customer.

1. Ask item, quantity, area and deadline.
2. Inspect sourced availability with freshness.
3. Approve hold request to chosen shop.
4. Owner accepts/rejects; show exact response.
5. Return to thread for pickup.

| Screen                         | Loading                                                                                                   | Empty                              | Error                                              | Offline                                 | Success                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| Concierge availability         | Keep concierge availability heading and Back visible; reserve final geometry; announce busy once.         | No matches: clarify one constraint | One agent unavailable: partial results with source | No live availability claim              | Separate inferred match from shop-confirmed availability |
| Hold and owner acknowledgement | Keep hold and owner acknowledgement heading and Back visible; reserve final geometry; announce busy once. | No active hold: offer request      | Rejected/expired hold offers another shop          | Pending request never labelled accepted | Owner approval and expiry explicit; no payment           |

**One motion moment:** One accepted-hold acknowledgement after shop response.

**Emotional beat:** Someone did the asking, and I can see what is confirmed.

**Hand-off:** S3 owner thread; S9 collection.

**Acceptance checks:**

- [ ] No agent-to-agent completion claim from canned cards.
- [ ] No hold without exact user approval.
- [ ] Owner controls acceptance.

**Evidence:** [phone/light](docs/stories/director/s17/phone-light/run.json), [phone/dark](docs/stories/director/s17/phone-dark/run.json), [desktop/light](docs/stories/director/s17/desktop-light/run.json), [desktop/dark](docs/stories/director/s17/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S18 · Connect an existing POS or ERP export

**Persona:** Owner already keeping records elsewhere. **Trigger:** Connect your system. **Fix area:** supply chain.

1. Upload synthetic CSV/XML export.
2. Review suggested mapping and uncertain columns.
3. Confirm units/currency once.
4. Preview diff then import.
5. Inspect receipt; repeat import deduplicates.

| Screen                  | Loading                                                                                            | Empty                                      | Error                                                   | Offline                                     | Success                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| File and mapping        | Keep file and mapping heading and Back visible; reserve final geometry; announce busy once.        | No file: sample download and allowed types | Malformed/uncertain field: fix or skip; no silent guess | Keep file selection safely; no synced claim | Source file type and every required target field visible  |
| Diff and import receipt | Keep diff and import receipt heading and Back visible; reserve final geometry; announce busy once. | No changes: truthful no-op                 | Partial failure lists rejected rows; retry idempotent   | No import receipt until acknowledged        | Created/changed/skipped totals and mapping scope explicit |

**One motion moment:** One mapping-to-preview transition; uncertain fields remain readable.

**Emotional beat:** I can reuse my existing work and check the translation.

**Hand-off:** S10 real history; S19 supplier documents.

**Acceptance checks:**

- [ ] No synthetic mapping called AI-verified.
- [ ] No credentials or merchant data in preference storage.
- [ ] No live system contact in recording.

**Evidence:** [phone/light](docs/stories/director/s18/phone-light/run.json), [phone/dark](docs/stories/director/s18/phone-dark/run.json), [desktop/light](docs/stories/director/s18/desktop-light/run.json), [desktop/dark](docs/stories/director/s18/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S19 · PO → confirmation → dispatch → invoice

**Persona:** Buyer and supplier on different systems. **Trigger:** Forecast drafts a purchase order. **Fix area:** supply chain.

1. Inspect MOQ, lead time, tiers, credit/approval limits and substitution rules.
2. Review proposed PO and approve exact terms.
3. Translate labelled SAP IDoc XML to counterpart JSON/CSV.
4. Review uncertain fields and order response.
5. Inspect ASN, shortages/partials/back-order and invoice match.
6. Approve receipt separately from financial settlement.

| Screen                             | Loading                                                                                                       | Empty                                                | Error                                                     | Offline                                           | Success                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| Rules and PO approval              | Keep rules and po approval heading and Back visible; reserve final geometry; announce busy once.              | No rule configured: ask owner; no fabricated default | Approval limit/new supplier escalates without send        | Draft preserved; no transmitted claim             | Every violated rule visible beside proposed order                 |
| Translated documents               | Keep translated documents heading and Back visible; reserve final geometry; announce busy once.               | Awaiting response: show waiting, not confirmation    | Unit/quantity mismatch blocks approval with repair        | Cached chain readable; no new dispatch claim      | Document lineage, format, uncertainty and simulation label        |
| Receipt and invoice reconciliation | Keep receipt and invoice reconciliation heading and Back visible; reserve final geometry; announce busy once. | No invoice: pending, no paid status                  | Shortage/substitute/duplicate invoice explicit resolution | No received or paid claim without acknowledgement | Ordered/accepted/dispatched/received/invoiced quantities distinct |

**One motion moment:** One acknowledged document moves to its next stage; no auto-complete timeline.

**Emotional beat:** Different systems still tell one understandable story.

**Hand-off:** S2 stock only after receipt; S15 daily record.

**Acceptance checks:**

- [ ] No live SAP or supplier contact.
- [ ] No money processed.
- [ ] Idempotent document replay.
- [ ] MOQ/credit/partial/substitution checks visible.

**Evidence:** [phone/light](docs/stories/director/s19/phone-light/run.json), [phone/dark](docs/stories/director/s19/phone-dark/run.json), [desktop/light](docs/stories/director/s19/desktop-light/run.json), [desktop/dark](docs/stories/director/s19/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S20 · Features, AI guide, payment and rider hand-offs

**Persona:** Owner discovering what the assistant can do. **Trigger:** Features destination or landing example. **Fix area:** my shop.

1. See separate merchant/customer entry points.
2. Open Features and a concrete AI example.
3. Example starts the correct coach context.
4. Inspect Google, UPI and rider hand-offs.
5. Return to app without losing context.

| Screen                   | Loading                                                                                             | Empty                                        | Error                                         | Offline                                                         | Success                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Features and AI examples | Keep features and ai examples heading and Back visible; reserve final geometry; announce busy once. | No shop: onboarding next action              | Unavailable capability labelled with recovery | Read guide offline; execution needs connection                  | Useful examples explain forecast, demand, sourcing and rescue                 |
| External hand-off review | Keep external hand-off review heading and Back visible; reserve final geometry; announce busy once. | Missing recipient/amount: no fabricated link | Invalid deep link offers copy/manual fallback | External provider needs connection; ordinary app remains usable | Recipient, amount and provider shown before leaving; external action explicit |

**One motion moment:** One example becomes a coach prompt; reduced motion immediate.

**Emotional beat:** I see what I can ask, without hunting through menus.

**Hand-off:** S4/S5/S9/S10; external provider owns payment/ride.

**Acceptance checks:**

- [ ] Director never follows external links.
- [ ] No money handling or claimed booking.
- [ ] Examples do not execute on mere preview.

**Evidence:** [phone/light](docs/stories/director/s20/phone-light/run.json), [phone/dark](docs/stories/director/s20/phone-dark/run.json), [desktop/light](docs/stories/director/s20/desktop-light/run.json), [desktop/dark](docs/stories/director/s20/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.

### S21 · Impact and evaluation evidence

**Persona:** Owner or judge assessing product claims. **Trigger:** Impact destination or demo claim. **Fix area:** trust.

1. Open measured results.
2. Inspect fixture/live distinction, sample and date.
3. Read method and limitations.
4. Follow local evidence link and return.

| Screen                    | Loading                                                                                              | Empty                           | Error                                                | Offline                                        | Success                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Impact results and method | Keep impact results and method heading and Back visible; reserve final geometry; announce busy once. | No evaluation: say not measured | Missing artifact: mark unavailable and link recovery | Cached report dated; no live performance claim | Numerator, denominator, date, dataset and method next to each score |

**One motion moment:** One results reveal; no count-up suggesting live traction.

**Emotional beat:** I can trust the claim because I can inspect the evidence.

**Hand-off:** S1/S15 measured journeys; review evidence.

**Acceptance checks:**

- [ ] No fixture result passed off as live accuracy.
- [ ] No projected savings shown as measured impact.
- [ ] Evidence links resolve locally.

**Evidence:** [phone/light](docs/stories/director/s21/phone-light/run.json), [phone/dark](docs/stories/director/s21/phone-dark/run.json), [desktop/light](docs/stories/director/s21/desktop-light/run.json), [desktop/dark](docs/stories/director/s21/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.
