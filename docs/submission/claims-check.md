# Claims check: video script and deck

Every claim in `video-script.md` (V) and `deck.md` (D, slide number) → the evidence → its status on
17 Oct. Production at the time of writing is `8073239`; main is `6ebf1a49` (release 3); release 4 and
#91 are not shipped yet (`docs/STATUS-LEDGER.md` in the main checkout, 12:50).

Status:

- ✅ backed by a file on main
- 🟡 backed, but the evidence or the feature is in an open PR. True only once that PR is merged and shipped
- 🎬 confirm on the recording or the live app before submission
- ❌ not backed. Fix or remove before export

## Product behaviour

| #   | Claim                                                                         | Where          | Evidence                                                                                                                   | Status |
| --- | ----------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Onboarding is a voice conversation, no form                                   | V3, D3, D4     | `docs/qa/manual-test-script.md` steps 1–2; `docs/stories/new-shop-2-listening-light.png`                                   | ✅     |
| 2   | The coach speaks and understands Hindi                                        | V4–V7, D4      | `docs/qa/hindi-e2e.md` (screens, coach text); voice side in #91 (`docs/qa/onboarding-live-check.md`)                       | 🟡 #91 |
| 3   | One sentence fills several fields                                             | V4, D4         | #91 PR body "Silent filling"; live transcript in `docs/qa/onboarding-live-check.md`                                        | 🟡 #91 |
| 4   | Live once name + what you sell + place are known; no menu step                | V5, D4         | #91 "Onboarding v2"; live check: 11/11 live after the three fields                                                         | 🟡 #91 |
| 5   | "बस" ends the conversation and nothing is lost                                | V7, D4         | #91 "Ending"; eval 40/40 stop words (`docs/qa/onboarding-eval.md`)                                                         | 🟡 #91 |
| 6   | "Review my shop" shows one summary card                                       | V8             | #91 "Review my shop: always available"                                                                                     | 🟡 #91 |
| 7   | The coach doesn't ask again for something already answered                    | V6, D4 notes   | #91 live check: 0 repeated questions in 11 conversations                                                                   | 🟡 #91 |
| 8   | Customer first open: no install, no sign-up, "Start with your neighbourhood"  | V9, D5         | #60 (merged via release 3): `docs/ux/front-door.md`, `docs/ux/front-door-after/`                                           | ✅ 🎬  |
| 9   | Answers come from shops' own menus, prices and hours                          | V10, D3, D5    | `backend/app/discover_ask.py`; `docs/impact/customer-latency.md` fix 3 (own shops first)                                   | ✅     |
| 10  | Customer sees ₹ and Hindi in an Indian area                                   | V10–V11, D5    | #90 region persona (release 4); Hindi customer screens in `docs/qa/hindi/20-24`                                            | 🟡 #90 |
| 11  | Shop page in the customer's language, item names kept as typed                | V11, D5 notes  | `docs/qa/manual-test-script.md` step 50; `docs/qa/hindi/22-shop-page.png`                                                  | ✅     |
| 12  | Chat answers instantly from the menu ("Instant answer")                       | V11, D5, D8    | `docs/qa/manual-test-script.md` step 39                                                                                    | ✅ 🎬  |
| 13  | QR scan → "First try! +50 points", scratch card, stamp card 3 of 10           | V12, D5        | #63 (merged via release 3), `tests/welcome-stamps.spec.ts`; manual step 46; `docs/stories/games-phone-light-3-scratch.png` | ✅ 🎬  |
| 14  | Stamp and scratch card work while the customer is signed out                  | V setup 4, V12 | #63: signed-out scan counts on the phone's card. The scratch-card prize while signed out is not documented                 | 🎬     |
| 15  | One stamp a day; scratch-card odds shown                                      | V12, D5 notes  | Manual step 47; odds visible in `docs/stories/games-phone-light-3-scratch.png`                                             | ✅     |
| 16  | Owner can add the menu by typing in the coach chat                            | V setup 5, V11 | Coach eval scenarios with `propose_products` (`docs/impact/coach-eval-gemini-3.5-flash.json`)                              | ✅ 🎬  |
| 17  | Today: sold out / back in stock in one tap; daily jobs                        | D3             | `docs/qa/manual-v2/01-today.png`; manual steps 16–17                                                                       | ✅     |
| 18  | Close the day from a till photo                                               | D3, D8         | `docs/stories/S2-close-*.png`; `backend/app/day_close.py`                                                                  | ✅     |
| 19  | Owner approves every change; the coach only proposes                          | D7             | `docs/architecture.md` ("owners review proposed changes before committing them")                                           | ✅     |
| 20  | Every AI feature has a switch and an offline fallback                         | D7             | `docs/google-ai.md` (switch column), `docs/architecture.md` "Configuration and boundaries"                                 | ✅     |
| 21  | One Cloud Run service, React + FastAPI + ADK coach agent                      | D7             | `docs/architecture.md` diagram; `Dockerfile`                                                                               | ✅     |
| 22  | Shop playbook written by Gemini per shop                                      | D8             | `docs/handoff/shop-playbook.md`; live Hindi playbook in `docs/qa/hindi-e2e.md`                                             | ✅     |
| 23  | Weekly recap in the owner's language                                          | D8             | `docs/qa/hindi-e2e.md` live pass ("Gemini, Hindi, ₹4,120")                                                                 | ✅     |
| 24  | Listing fraud checks: copied menus, odd prices, same phone                    | D8, D10        | `docs/handoff/trust-fraud.md` "Listing fraud checks"; `backend/app/fraud.py`                                               | ✅     |
| 25  | "Owners who verify" (trust layer)                                             | D10            | Face check exists but bug #74 is still failing in prod. Kept only as direction on the moat slide, never demoed             | 🎬     |
| 26  | Supplier flow uses real document formats on sample files, not a live supplier | D11 notes      | `docs/handoff/supply-chain.md`; `docs/stories/supply-*.png`                                                                | ✅     |
| 27  | Agent-to-agent shopping is designed, not shipped                              | D11            | `docs/HACKATHON-REVIEW.md` moat 2 ("planned")                                                                              | ✅     |
| 28  | Languages: Hindi, Tamil, English "and more"                                   | D3             | 15 locales (`docs/PLAN-V2.md`); Tamil coach fix #89 (release 4)                                                            | ✅     |
| 29  | Owner app and customer app URLs                                               | V14, D12       | `docs/qa/manual-test-script.md` header                                                                                     | ✅ 🎬  |

## Google services named

| #   | Claim                                                                                     | Where        | Evidence (`docs/google-ai.md`)                                                                                                                                     | Status         |
| --- | ----------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| 30  | Gemini (3.5 Flash) on Vertex AI                                                           | V10, V13, D6 | "Gemini text on Vertex AI": **live**                                                                                                                               | ✅             |
| 31  | Gemini Live on Vertex AI (3.8 live)                                                       | V3, V13, D6  | "Gemini Live on Vertex AI": **live**                                                                                                                               | ✅             |
| 32  | Cloud Text-to-Speech, Achernar voice                                                      | V13, D6      | "Cloud Text-to-Speech": **live**; voice availability depends on the language                                                                                       | ✅             |
| 33  | BigQuery AI.FORECAST / TimesFM with 90% intervals                                         | D6, D8       | "BigQuery AI.FORECAST / TimesFM": **live**; `docs/PLAN-V2.md` 16 Oct 02:25                                                                                         | ✅             |
| 34  | Firebase Authentication, Firestore, Cloud Run                                             | V13, D6, D7  | Platform table: all three **live**                                                                                                                                 | ✅             |
| 35  | Vertex AI embeddings (in the search eval)                                                 | D9           | Eval used live `gemini-embedding-2` (`docs/impact/search-eval.md`). In-product use is **pending** in `google-ai.md`, so the deck names it only as part of the test | ✅ (eval only) |
| 36  | SafeSearch, Maps Platform, Document AI, Maps grounding, Recommendations AI, Cloud Storage | D6 notes, D7 | **pending** in `google-ai.md`. Speaker notes say "built, not verified live"; never on a slide as used                                                              | ✅ as worded   |

Not named anywhere: Vertex AI Agent Engine, Vertex AI Vector Search, Looker Studio, Imagen.

## Numbers

| #   | Number                                                                 | Where            | Source                                                                                                                                       | Status           |
| --- | ---------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 37  | 0 irrelevant questions out of 215, 40 businesses                       | V8, D4, D9       | `docs/qa/onboarding-eval.md` (on #91, line 8)                                                                                                | 🟡 #91           |
| 38  | 11/11 Hindi live onboardings went live, 0 drops, 0 repeats             | D4 notes, D9     | `docs/qa/onboarding-live-check.md` (on #91)                                                                                                  | 🟡 #91           |
| 39  | Coach 25/27 live scenarios, 8 languages                                | D9               | `docs/impact/coach-eval-gemini-3.5-flash.json` (27 scenarios, 2 failed); `docs/PLAN-V2.md`                                                   | ✅               |
| 40  | First answer cards 0.13 s p50, local test; live site was 11.5 s before | D5 notes, D8, D9 | `docs/impact/customer-latency.md`. The after figure uses the offline fixture locally; before was the live audit. Worded as not like-for-like | ✅ as worded     |
| 41  | Search precision@5 0.73 → 0.90 (live embeddings), empty answers 2 → 0  | D8, D9           | `docs/impact/search-eval.md` (0.728 → 0.902; 20 fictional shops, 25 queries)                                                                 | ✅               |
| 42  | Gemini read 26/26 receipt lines and 15/15 amounts                      | D8               | `docs/impact/document-ai.md` "Gemini alone" row; 6 synthetic photos, one pass                                                                | ✅               |
| 43  | Voice first reply 1.5–2.5 s today, target 0.8 s                        | D11, V editing   | `docs/qa/onboarding-live-check.md` (p50 1.48 s typed, 2.46 s spoken); ledger "First voice audio"                                             | 🟡 #91           |
| 44  | Recommendations AI catalogue of 479 products                           | D6 notes         | `docs/impact/recommendations-ai.md`                                                                                                          | ✅               |
| 45  | "Live in N s" timer in the video                                       | V8               | Measured from the owner's own take                                                                                                           | 🎬               |
| 46  | Share of shops without an online listing                               | D2               | none                                                                                                                                         | ❌ [NEED SOURCE] |

Numbers deliberately left out: the offline photo → menu figures and the onboarding fixture times in
`docs/impact/measurements.md` (scripted automation, not owner time), and the local load test (no
production traffic).

## Open items before export

1. **#91 and #95 merged and shipped.** Claims 2–7, 37, 38 and 43 depend on them. If #91 slips,
   remove the eval lines from V8, D4 and D9 and use `docs/stories/new-shop-*` frames.
2. **#90 shipped** for ₹ and Hindi on the customer phone (claim 10).
3. **Slide 2:** find a sourced number or keep the slide qualitative (claim 46).
4. **Slide 12:** the owner writes the ask (`[OWNER: …]`).
5. **On the take:** confirm 8, 12, 13, 14, 16 and 29 and the timer (45). Check that the face check
   offer is skipped.
