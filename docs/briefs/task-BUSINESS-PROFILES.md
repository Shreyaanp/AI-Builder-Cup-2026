# Business-type profiles, name first (owner, 16 Oct ~02:30) — Codex, track B

Work from origin/main in your worktree. Do not commit or push (Claude commits). Read
docs/PLAN-V2.md ("Final push plan" and "Feedback after trying it"), AGENTS.md first.
Ports WEB_PORT=3437 API_PORT=3537; RECALL_PATH=data/test-vectors.
Do NOT edit the new-shop UI (src/features/v1/NewShopFlow.tsx, newShopCopy.ts, useVoice.ts:
account 2 owns them) or customer UI (src/features/customer, discover, passport, frontdoors:
account 3). Backend + coach instructions + question plan are yours. Note: PR #3 (not yet on main)
rewrites NEW_SHOP_INSTRUCTION in backend/app/agent.py and allows unnamed new-shop drafts
(require_name at commit). Fetch origin/feat/new-shop-flow and build ON TOP of that branch's
backend (base your worktree on origin/feat/new-shop-flow), so nothing conflicts.

## Owner's words

"Every shop is not halal. A vegetarian shop, why are you asking if it is halal? My first question
is not what kind of shop I run: the NAME of the shop first, then what kind of shop. When you see
the kind of shop, create a similar profile structure in the database. It should not be the same
for everyone: this is a general onboarding platform for vendors, not specific to tea, coffee,
vegetable markets or retail."

## Build

1. Onboarding order: greet → shop NAME → what kind of business → then that type's questions.
2. A business-type profile model: classify the business (Gemini, from the owner's words, menu,
   photos) into a type with sub-attributes (food: cuisine, veg-only/non-veg/both, halal only if
   it serves meat and the region makes it relevant; tailor: services, turnaround, measurements;
   salon: services, booking/walk-in; retail/grocer: categories, delivery; services: service area,
   appointment…). The profile drives: which questions are asked (never irrelevant ones: no halal
   for a vegetarian shop), which customer facts exist, units/menu vocabulary (items vs services,
   per piece/kg/hour), and what is stored (a typed profile on the business, migrated safely for
   existing shops in SQLite AND Firestore, defaulting to today's generic behaviour).
3. get_question_plan and propose_customer_facts follow the profile; the coach instructions use it.
4. Tests: unit tests per type (tea stall, vegetarian restaurant, halal butcher, tailor, salon,
   hardware shop, home baker), the question plan never asks irrelevant facts, migrations, both
   stores. Live check with real Gemini is done by Claude afterwards.
   Run backend tests (ruff, mypy, pytest), `npm run check`. Write docs/handoff/business-profiles.md.
