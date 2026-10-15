# Feature branches and impact review

Owner decision (15 Oct 2026): the codebase is large now, so every feature is built on its own
branch and reaches `main` only through a reviewed pull request. Reviews use a code knowledge
graph (graphify) so changes to UI or backend show every area they can affect, not just the
files in the diff.

## Branches

- One branch per feature: `feat/<short-name>` (for example `feat/new-shop-flow`,
  `feat/rescue-ui`), bug fixes as `fix/<short-name>`. Workers (Codex, account 2) each work on
  their own branch; nobody pushes features straight to `main`.
- Keep a branch focused on one feature so its impact report stays readable.
- Open a pull request into `main` as soon as the branch has a first commit
  (`gh pr create --fill --base main`).

## What runs on every pull request

1. **Checks** (`.github/workflows/checks.yml`): backend, frontend, browser shards, container.
2. **Review impact** (`.github/workflows/review-impact.yml`): builds the code graph
   (`scripts/build_graph.py`, graphify, code only, no LLM or keys), then `scripts/impact.py`
   comments on the pull request with:
   - the **affected areas** (graph communities) the change reaches,
   - **files outside the diff** that call, import or use the changed code (nearest first),
   - the **tests** that exercise the affected code,
   - **areas reached with no test** in the graph.

## How to review (the reviewer's checklist)

1. Read the impact comment first. Every affected area must be either (a) intentionally changed,
   (b) covered by a listed test that passed, or (c) checked by hand. Write which in the review.
2. For each "file outside the diff" at hop 1, open it and confirm the changed behaviour still
   fits how it is used (signatures, response shapes, strings, styles).
3. Areas reached with no test need a new test or a manual check before merge.
4. UI changes: compare screenshots in light and dark, phone (390×844) and desktop.
5. Merge only with green checks: `gh pr merge --squash --delete-branch` (no AI co-author lines).

## Run it locally

```
uv tool install graphifyy==0.9.89      # once
npm run graph                          # rebuild graphify-out/graph.json (git-ignored)
npm run impact                         # impact of your branch vs origin/main
npm run impact -- origin/main --head feat/rescue-ui   # any branch
```

Example: the 15 Oct Gemini schema fix changed `gemini_schema.py`; the impact report listed
`brief.py` at hop 1, which is where a later merge still used the old schema call.
