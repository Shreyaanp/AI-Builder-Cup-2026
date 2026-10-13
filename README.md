# oGoogle AI — streaming review template

A React/TypeScript frontend with a Python/FastAPI backend and Google ADK. Text replies stream through SSE; the backend also provides a bidirectional WebSocket adapter for Gemini Live. The default is a labelled, scripted offline model using the real ADK runtime. No live model requests or cloud deployment have been performed for this template. oGoogle AI is an independent project.

## Review locally

```sh
npm ci
uv sync --project backend --locked
# Two terminals:
npm run dev:backend
npm run dev
```

Open **http://127.0.0.1:3200** and the API explorer at **http://127.0.0.1:3300/docs**. On this Windows workstation, `./start.ps1` starts both services using the installed runtimes; `./stop.ps1` stops only their recorded processes. Review launchers explicitly force offline/local mode, even if a model key has been configured elsewhere.

Type a note and watch the reply arrive. Stop a reply and your note is preserved. Try Hindi, an example, edit, exact-card review and dark appearance. Agent replies do not silently change business facts. Business cards/photos remain browser-session data; conversation events are stored separately in ignored local SQLite files. Refreshing clears the browser card, not the backend database.

## Stack and structure

- Official Vite React/TypeScript template, React 19.3 and strict TypeScript.
- Free MUI 9.5 + Emotion, with Google-generated Material 3 colour roles and our own theme. MUI is not an official complete M3 React implementation.
- `src/app`: shell/provider composition. `src/state`: separate business/preference read and dispatch contexts, pure reducers and typed hooks.
- `src/features`: business card and coach input. `src/design`: shared tokens, language copy and generated light/dark roles.
- `.agents/skills/material-design-3-ui`: pinned external design rulebook and license.
- `docs/REACT_RULES.md`: official React references and executable lint rules. `docs/SKILL_REVIEW.md`: findings and remaining checks.
- `backend/app`: validated contracts, identity, request limits, ADK runners, SSE and WebSocket transport. `backend/uv.lock` records compatible dependency versions.
- `src/api/generated.d.ts`: generated Python OpenAPI contracts; `src/api/stream.ts`: cancellable, bounded SSE decoder. `useCoachStream` owns the request lifetime, not global Context.
- [Backend guide](backend/README.md), [architecture and protocol](docs/AI_ARCHITECTURE.md), [Python rules](docs/PYTHON_RULES.md).

## Checks

```sh
npm run check
npm run format:check
cd backend
uv run ruff check app tests scripts run.py
uv run ruff format --check app tests scripts run.py
uv run mypy
uv run pytest -q
uv run pip-audit --local --progress-spinner off
```

Playwright uses installed Chrome on Windows and bundled Chromium elsewhere. On a new machine run `npx playwright install chromium`, or set `CHROME_PATH` to an installed browser. The checks cover lint, TypeScript/build, negative hook-rule probes and UI scenarios. The skill's upstream validator was run separately; its behavioral case documents are not counted as passed app tests.

`npm run theme:generate` regenerates semantic colours using Google's library. Its bundler runs in tooling rather than the browser. `npm run format` excludes vendored rulebook sources.

## Boundaries

ADK is connected locally; the offline model is a fixture, not Gemini inference or speech recognition. Live Gemini credentials/models, frontend microphone capture/playback, Google sign-in UI, business ownership/roles, Google publishing, public pages, inventory CRUD, forecasts and notifications remain separate work. Image selection previews a photo without uploading or analysing it.

The manifest is preliminary; no installed-PWA, Android splash or service-worker/offline guarantee is claimed. Existing physical-phone evidence belongs to the older POC. Only language/appearance persist in browser preference storage. Never add server secrets to browser environment variables. The installed Firebase/Firestore libraries do not establish cloud persistence or authorization.

## Repository and contributors

Repository: [Shreyaanp/AI-Builer-Cup-2026](https://github.com/Shreyaanp/AI-Builer-Cup-2026), branch `main`. Initial publication was explicitly authorized after local review. CONTRIBUTING.md defines two-contributor review conventions. GitHub Actions checks Python, the generated API contract and React/browser behaviour; it does not deploy cloud services.
