# Owner tabs: Shop refine, Grow (replaces Google), You (replaces Privacy) (account 3, session 4)

Branch `feat/owner-tabs` in this worktree (from origin/main). Read docs/OWNER-NOTES.md, AGENTS.md
and the new house skills (.agents/skills/content-design, progressive-disclosure, personalization,
motion-and-delight, ux-review-checklist). Ports 3537/3637 are Codex's; use WEB_PORT=3597
API_PORT=3697, RECALL_PATH=data/test-vectors. Setup `npm ci`, `uv sync --project backend`
(node: C:\Users\pshre\AppData\Local\AIBuilderCupTools\node-v24.21.0-win-x64).
Design reference (approved by the owner, 16 Oct): https://claude.ai/artifact/HMmcAECR75pfTFdQ7LbskH
(bottom row: Shop, Grow, You). **Do NOT change the theme**: keep the current Chalkboard tokens,
fonts (Google Sans Flex + Caveat), colours, component styles. Only structure, content and flow.

## Owner decisions
- **Grow replaces the Google tab** (approved): every owner tool as a card in a 2-column grid, each
  with its live one-line status: Forecast ("prep ~45 chai today"), Close the day, Suppliers
  ("milk · 3 nearby"), Rescue deals, Get on Google ("2 details missing": opens the existing Google
  guided flow), Stamps & perks, Payments & rides (placeholder card if track P is not merged yet:
  honest "coming soon" is NOT allowed; hide it until the feature exists), Connect your POS (same
  rule). Cards open the existing screens/flows; Close the day and Prep plan move here from My shop.
- **You replaces the Privacy tab** (approved): profile row (name, shop), "Verify it's you" card
  (opens the existing face-check flow; another worker is fixing that flow on feat/trust-fraud, so
  do not edit FaceDialog/face code, only link to it), Language, Look (theme setting), Coach voice,
  Your shops, Privacy & your data (the existing privacy content as a sub-page: agreement, delete
  face data, delete all my data), Help, Sign out. Settings gear content moves here.
- **Shop (was My shop) gets a light refinement** (owner: "ok, needs a little refinement"): lead with
  "this is your page" (the customer-facing preview), then menu/services with prices and inline
  edit, then hours, address, photos, what customers ask; one primary "Share page". Remove the
  tools that moved to Grow. Keep existing editing flows.
- **Coach tab: do NOT change it** in this task (the owner is still deciding the Today design).
  Keep its tab, name and page as they are.
- Business type aware labels where cheap (menu vs services), per the personalization skill.
## Done
All existing owner tests updated to the new tab names/locations (phone-shell, myshop, google,
privacy, stories), 15 locales for new strings, phone 390x844 + desktop, light + dark, axe clean,
Back behaviour intact, screenshots docs/stories/tabs-*.png, ux-review-checklist result in the PR.
Run backend tests, `npm run check`, `npm run test:qa`. Commit small (no AI trailers), push,
`gh pr create`, write docs/handoff/owner-tabs.md. Summarise.
