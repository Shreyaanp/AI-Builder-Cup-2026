# Shop playbook: AI-made per-shop template for hyper-personalization (Codex)

Branch `feat/shop-playbook` from origin/main (after PR #13 business profiles merges; if not merged,
base on origin/feat/business-profiles). Commit small (no AI trailers), push, `gh pr create`.
Read docs/OWNER-NOTES.md (16 Oct ~04:30), .agents/skills/personalization, docs/handoff/business-profiles.md.
Ports WEB_PORT=3697 API_PORT=3797, RECALL_PATH=data/test-vectors. Do not change the theme.

## Owner's idea

"How does the AI understand a business? Ask the user or get a general understanding of the business
with the LLM, create a template, and that's how we do hyper-personalization."

## Build

1. **Understand**: during onboarding the coach asks 2-3 extra, natural, skippable questions after the
   basics: what matters most now (more customers / less waste / save time / something else), busiest
   times, who the regulars are. Answers are recorded through the existing review boundary.
2. **Playbook** (structured, versioned, bounded; stored on the business in SQLite AND Firestore with a
   lazy migration): goals, priorities, key metrics (which pulse numbers matter for THIS shop: cups and
   busy hours for a tea stall; orders due and fittings for a tailor), watch-list (stock items, rush
   hours, festival demand), customer segments, vocabulary/units, tone/language, suggested next features.
   Built by ONE Gemini structured-output call (backend/app/gemini_schema.py helpers) from: business
   profile, onboarding answers, menu/prices, location/hours, recent sales/questions. Offline fixture
   playbook for tests. Refreshed at most weekly or when the profile/menu changes materially (cached; GCP
   credit is limited).
3. **Consumers**: an API the Today page uses (personal line topics, pulse metric choice, "needs you now"
   priorities), coach instructions (shop snapshot includes the playbook summary), Grow card ordering.
4. **Visible and editable**: "What Chalkboard knows about your shop" screen under You (plain words,
   edit or remove any item, regenerate). Honest wording.

## Done

Backend tests (generation, bounds, refresh rules, migration both stores, consumers), coach eval
scenario, 15 locales, phone + desktop, light + dark, axe clean, screenshots docs/stories/playbook-*.png,
handoff docs/handoff/shop-playbook.md. Run backend tests and `npm run check` (rerun timed-out files alone).

## Proper segmentation (owner, 16 Oct ~05:30): never ask a question that does not fit the business

Extend the business profile (PR #13) with food SUB-SEGMENTS and per-segment question rules, applied
everywhere (onboarding, question plan, customer facts, Today, coach):

- **Beverage / tea / coffee stall, juice bar**: no veg/non-veg, no halal (unless they say they sell
  meat snacks); ask milk options (dairy/plant), sugar-free, takeaway cups, hours.
- **Bakery / sweets**: ask eggless options and custom orders; no meat/halal unless stated.
- **Snack / street food**: ask veg/non-veg only if the menu suggests meat; halal only if meat AND
  regionally relevant.
- **Restaurant / meals / biryani**: ask veg/non-veg, halal (where relevant), Jain/allergens, dine-in/
  delivery, seating.
- **Butcher / meat shop**: halal/jhatka where relevant, cuts, weight units; no "vegetarian" questions.
- **Grocer / kirana**: categories, delivery, home delivery radius; no diet questions.
  Infer the segment from the owner's words, menu and photos; when unsure, ask ONE natural question
  ("Do you serve meals, or mostly tea and snacks?") instead of every diet question. Tests per segment
  proving the irrelevant questions never appear (tea stall → no veg/halal question).
