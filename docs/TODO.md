# Chalkboard: master to-do (until submission)

**Deadline:** submission module closes **Mon 19 Oct ~00:45 IST** (countdown seen Fri 16 Oct 06:10:
2d 18h 38m). Treat **Sun 18 Oct 20:00 IST** as our own hard stop for submitting (buffer).
**Feature cutoff: Fri 16 Oct midnight IST.** After that only fixes, polish, evidence, video, deck.
Rule: if it does not work, it does not ship (hide it behind its switch). Never claim a service we do
not use. No AI co-author lines anywhere. Owner intent: docs/OWNER-NOTES.md · plan: docs/PLAN-V2.md.

Legend: ☐ to do · ◐ in progress · ☑ done · 👤 owner action

## A. Merge and release (Claude orchestrates)

- ☑ #6 voice continuity, #7 customer polish, #8 CI flakes, #9 chart cards + TimesFM, #3 voice-mode onboarding
- ◐ Codex integration: #13 business profiles → #12 unit fix → #4 rescue deals → #11 customer AI-first (CI fixes)
- ☐ Review/merge: #14 story director docs, #15 connect your system, #16/#18 QA findings, #17 manual test script
- ☐ Fix regression items: Tamil keyboard focus (onboarding), "Share customer page" switch
- ☐ Green regression → release; verify runtime settings after each release (ship script gap)

## B. Features (cutoff Fri midnight; each behind a switch)

Owner app

- ◐ Today page: greeting + daily personal line, "Needs you now" (max 3, done items vanish), pulse
  (yesterday sales, page views/questions, stamps, forecast), progress bar only while unfinished, day-one
  welcome, collapses to a pill while chatting (acct 3)
- ◐ Tabs: Shop (refined), Grow (replaces Google), You (replaces Privacy); theme unchanged (acct 3)
- ◐ In-chat camera, in-chat map + pin, Google Maps hand-off, phone-friendly manual form (acct 2, last task)
- ◐ Supply chain: business rules (MOQ, lead time, price tiers, credit terms, approval limits, substitutions),
  forecast → PO → ORDRSP → ASN → invoice, AI document translation (SAP IDoc ↔ JSON/chat) (acct 2, last task)
- ◐ Connect your system (POS/Tally/Excel mapping) — PR #15 to review
- ☐ Payments & rides deep links (UPI QR, Rapido/Uber/Porter), "talk to your coach" guide, new landing page (Codex)
- ☐ Shop playbook + 2-3 onboarding questions + food sub-segments (tea stall: never veg/halal) (Codex)
- ☐ Voice-everything: tool coverage audit + missing tools, app-guide tool, instant path (<100 ms),
  starter templates per type, Vertex context caching, latency report (Codex)
- ◐ Trust: duplicate-owner face check that works + liveness + verified badge + Gemini fraud checks (acct 3)
  Customer app
- ◐ AI-first front door (PR #11) · ◐ search engine on Vertex embeddings + personalised picks (acct 3)
- ☐ Gemini grounding with Google Maps (area questions) + interactive results map (pins ↔ cards) (acct 3)
- ☐ Recommendations AI: catalog + "Similar items" model training + real events, fallback to embeddings (acct 3)
- ◐ Gamification: scratch cards, endowed stamps, streak freeze, sets, co-op street goal, perks (acct 3)
  Google services
- ☐ Document AI for receipts/invoices (Gemini vision stays for menus/photos) (Codex)
- ◐ BigQuery analytics tables → in-app owner analytics; Looker Studio impact dashboard (feat/google-services; 👤 resume scheduler + Looker setup, docs/handoff/google-services.md)
- ✗ Dropped: Routes API, Vertex Agent Engine, Imagen

## C. Quality (Fri night → Sat)

- ☐ 👤 Manual test on a real phone with docs/qa/manual-test-script.md (PR #17): voice mode, voice back,
  photos, imports, customer chat (after the next release)
- ☐ Fix verified QA findings: Close-the-day "$" for INR shops, "INR 18.00" vs "₹18.00", Close-the-day dead
  end, onboarding chip cut-off + action row overlap, browse filter chips cut off (+ story-director fix briefs)
- ☐ Regression every 3 h green; live voice + voice back checks green
- ☐ Latency targets: text first words < 700 ms, voice < 800 ms, taps instant

## D. DevOps / scale (Codex, small fixes only)

- ☐ One release path (ship script applies runtime config), feature switches, faster CI
- ☐ CDN for static assets (Firebase Hosting or Cloud CDN), cache headers
- ☐ Capacity: max-instances/concurrency/timeouts for 30k users, Gemini quota degradation
- ☐ Architecture diagram + local load test numbers
- ☐ Sat: Cloud Run min-instances=1 until judging ends (approved); turn off after

## E. Problem alignment & impact evidence (target 8.5–9)

- ☐ 👤 2–3 real shops try it Saturday morning: photo + one-line quote + real numbers each
- ☐ 👤 Supply-chain facts from the owner's industry (stock loss, waste, supplier delays) with sources
- ☐ Measurements: voice onboarding time vs form, photo-to-menu accuracy, close-the-day time, coach eval
  (25/27 ☑), forecast method (TimesFM ☑), latency, load test
- ☐ Problem slide: who, how many, what share lack fresh listings, hours lost (sourced)
- ☐ Track mapping slide: discovery, personalization, conversational shopping, demand planning,
  inventory, customer insights, fraud → feature + number each
- ☐ Social impact: voice-first in 15 languages (inclusion), rescue deals (kg/portions saved), local economy

## F. Submission (Sun 18 Oct, done by 20:00 IST)

- ☐ Demo video < 3 min: script, real screen recordings (story-director walks), HyperFrames assembly,
  voice-over in our Achernar voice; one owner + one customer story, every feature shown in use
- ☐ Deck (PDF, English) mapped to the rubric (40/25/25/10): problem, solution, Google AI used (only real
  ones), architecture, impact numbers, moat (data flywheel + agent network), roadmap (Recommendations AI live)
- ☐ Rule-book compliance: live Cloud Run URL, public GitHub, video, deck PDF, Google AI, fresh code, English
- ☐ Tag the submitted commit (`submission-2026-10-18`); after that only fixes on a branch
- ☐ Rewrite main history to remove the 14 old Claude co-author lines; verify GitHub shows only the owner
- ☐ 👤 Submit on the dashboard; after submission keep the warm instance until judging ends
