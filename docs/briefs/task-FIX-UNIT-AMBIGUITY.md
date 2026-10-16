# Fix: ambiguous item names create duplicate menu items (bug sweep finding 4)

Ports WEB_PORT=3567 API_PORT=3667, RECALL_PATH=data/test-vectors. Setup: `uv sync --project backend`
(frontend setup only if you touch src). Keep the change small and backend-only unless a UI string is
required.

## Bug

backend/app/coordinator.py `propose_products`: when a shop has the same item name in several units
(e.g. "Kaya toast" per plate AND per box) and the owner says "update kaya toast to 3.50", the
model sends unit "item" (default); `len(by_name[name]) == 1` is false and the exact (name, unit)
match fails, so `known` is None and a NEW duplicate "Kaya toast / item" is proposed.

## Fix

- If the name matches several saved items and the given unit matches none of them, do not create a
  new item: return the repairable `_invalid`/ask_owner path naming the existing units, so the coach
  asks one short question ("Kaya toast per plate or per box?").
- Same for "sold out" / availability changes with an ambiguous name.
- A genuinely new item (name not saved at all) still works as today.
- Also check the same logic for the new-shop draft path (draft products).

## Tests

backend/tests/test_coach_tools.py: ambiguous name + missing unit asks, exact unit updates the right
one, unit synonyms still resolve, new item still allowed, sold-out ambiguity asks. Run ruff, mypy,
pytest. Commit (no AI trailers), push, open the PR.
