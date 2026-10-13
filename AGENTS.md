# oGoogle AI template instructions

Read `rules.md` and `PROJECT_MEMORY.md` before changes. Keep implementation evidence separate from intentions.

For every design or UI change, read `.agents/skills/material-design-3-ui/SKILL.md`, then only the relevant references. Typography, spacing, accessibility and component semantics are required for UI review. Use `docs/REACT_RULES.md` and the official hook lint rules for React code. The vendored skill is community-authored; Google's official specifications remain authoritative.

Also apply `.agents/skills/web-interface-guidelines/SKILL.md` (Vercel rules: forms, focus, motion, content states, theming) to every UI change, and use `.agents/skills/performance`, `core-web-vitals`, `best-practices` and `web-quality-audit` for performance, PWA and security work. When rules conflict, Material 3 decides visual/component choices; the web guidelines decide web mechanics (keyboard, forms, motion properties, safe areas, performance). All are pinned copies (see each SKILL.md for source and commit).

- This is a business-information and coaching assistant, not a marketplace or health app.
- Latest backend choice is Python 3.13 + FastAPI + Google ADK, with React/TypeScript frontend. Read `docs/PYTHON_RULES.md` for backend changes. Keep dependency lockfiles and regenerate API types after schema changes.
- Keep the independent oGoogle AI identity; the Pixel health/coach reference informs pacing and hierarchy, not affiliation.
- Preserve explicit Google connection status. A frontend theme and API key never establish native Google placement or Business Profile rights.
- Keep actual account, business authority, liveness, publishing and AI execution separate. Face/liveness is deferred.
- Use generated semantic Material roles and a shared theme. Preserve text scaling, readable labels, keyboard access, safe areas and reduced motion.
- Use typed Context/reducer state with separate state/dispatch contexts. Keep transient form state local. Never put credentials or merchant data into preference storage.
- Optional PWA installation must allow uninterrupted web use. The starter manifest does not establish installation/offline readiness.
- Current task authorizes the deployment flow: one Cloud Run service for React/Python, Firebase Google sign-in, and persistent Firestore conversations in `ichiropractic`, with separate app resources. Release only after checks. Prefer existing eligible credits/free allowances; preserve the ₹500 total cash ceiling and paused budget setup. Do not enable billing, purchase credits, call paid models or change external businesses as part of this release.
- Run `npm run check` after functional changes. Record what passed and what remains unvalidated. Browser emulation is not a physical-phone test.
- For backend changes run Ruff, mypy and pytest; test disconnect cleanup and owned sessions. Offline fixtures never establish live Gemini or ASR accuracy. Local SQLite is not durable Cloud Run storage.

The user reviewed the local template and explicitly requested its initial push. Future publication still follows the user's current instruction.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
