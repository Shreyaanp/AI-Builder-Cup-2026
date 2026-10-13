# oGoogle AI template instructions

Read `rules.md` and `PROJECT_MEMORY.md` before changes. Keep implementation evidence separate from intentions.

For every design or UI change, read `.agents/skills/material-design-3-ui/SKILL.md`, then only the relevant references. Typography, spacing, accessibility and component semantics are required for UI review. Use `docs/REACT_RULES.md` and the official hook lint rules for React code. The vendored skill is community-authored; Google's official specifications remain authoritative.

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
