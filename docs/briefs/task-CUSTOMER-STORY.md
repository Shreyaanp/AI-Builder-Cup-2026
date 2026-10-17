# Customer side: complete the story (interactive session with the owner, account 3)

You are talking DIRECTLY with the project owner (they type here). Discuss briefly, then build. Ask before
anything outward-facing (deploys, cloud changes, paid API keys). You may implement in THIS worktree
(~/work/chalkboard-custstory, branch feat/customer-story, built on PR #60 "customer front door" which is on
release 2). Ports WEB_PORT=3875 API_PORT=3975, RECALL_PATH=data/test-vectors. Run tests in the foreground
only (`--workers=1`); plain commit messages, no AI trailers; push your branch and open a PR (base main) when a
coherent piece is done. Read docs/OWNER-NOTES.md (top = newest) and docs/ORCHESTRATOR.md first.
Other workers own: onboarding/voice files (voice.py, NewShopFlow.tsx, NewShopStage.tsx, VoiceStage.tsx,
agent.py onboarding: onboarding v2), region profile (fix/sg-languages-e2e: currency/language/payments by
location, language step after sign-in), tour demo data (Codex feat/tour-story), uploads + shop icon. Reuse
their work when it lands; don't duplicate it.

Owner feedback (17 Oct 05:30), all on the customer side:

- CSS is broken in many places. The shop card is too big for the screen; information is cramped; the shop
  name + image on the shop page look bad. "Did you not run the heatmap for UI/UX?" → run the repo's UX
  tooling: docs/qa/customer-heatmap.md + docs/qa/heatmap (previous method), .agents/skills
  (ux-review-checklist, web-interface-guidelines, material-design-3-ui, progressive-disclosure,
  web-quality-audit, core-web-vitals). Screenshot every customer screen at 360/390/412 px, light + dark,
  and fix every layout defect with a test (no horizontal scroll, no clipping, targets >= 48px, card fits).
- Location: use the CURRENT location (ask permission with a clear reason); if location is available, the
  free-text location input should not be there (only a small "change area" affordance).
- Real data: get actual shops for the customer from the Google Maps (Places) API, with photos and details,
  shown alongside our shops, honestly labelled, with Google attribution, storing only place IDs (Maps
  Platform terms), cost-guarded. At least one demo account's data should come first (our shops first).
- Context management on the customer side is not proper: the Ask conversation, the selected area, the
  shop opened from results, back navigation and follow-up questions must keep context (what the customer
  asked, where, which shop) and never reset or mix sessions.
- The customer story is incomplete: decide with the owner the 2-minute customer journey (front door ask
  → results + map → shop page → chat/stamp/rescue → passport) and make every step great.
  Start by: (1) a 5-line summary of what you see is broken (after screenshots), (2) the proposed customer
  journey, (3) ask the owner 2-3 questions, then build in small, tested, pushed steps.
