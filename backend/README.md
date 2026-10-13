# Python backend

Python 3.13, FastAPI, Uvicorn, Google ADK, Google Gen AI SDK, Pydantic/settings, sse-starlette, SQLAlchemy/aiosqlite, Firebase Admin, Firestore SDK, itsdangerous and structlog are installed and locked. Ruff, mypy, pytest/pytest-asyncio, HTTP test clients and pip-audit support development. Use `uv sync --locked`; do not force incompatible package versions. ADK currently resolves FastAPI 0.141.1.

## Local review

From the repository root, `npm run dev:backend`; on this workstation `./start.ps1` starts both services. These launchers force offline mode. API docs: `http://127.0.0.1:3300/docs`.

`GET /api/v1/bootstrap` establishes a signed, HttpOnly development cookie. This is a private local workspace, not Google sign-in or proof of business ownership. `POST /api/v1/coach/stream` accepts a message and optional owned conversation UUID. `GET /api/v1/health` reports configured modes and unconnected Google statuses. WebSocket `/api/v1/voice` is described in `../docs/AI_ARCHITECTURE.md`.

The default `.env.example` contains no key. No configuration is required for the offline fixture. The backend saves conversation events to `data/sessions.sqlite3` and a signing key to `data/local-session.key`; both are ignored. Treat these as private local files. They are not encrypted application records or cloud memory. Use fictional data during review.

## Provider configuration, later

Copy `.env.example` to `.env`, set a server-only key and explicit available text/live model IDs, then select `COACH_MODE=gemini`. Launch from this directory with `uv run uvicorn app.main:app --host 127.0.0.1 --port 3300 --ws-max-size 32768 --ws-max-queue 8 --no-access-log`. This manual path honours settings; the review launchers deliberately remain offline. Actual model calls can consume quota/credits: confirm eligibility and the existing spending constraint before using this path. Nothing in this template enables billing or guarantees a monetary cap.

`AUTH_MODE=firebase` enables verified Google bearer identities; the frontend uses the Firebase sign-in SDK and public, dedicated browser configuration. Other shared-project providers and unverified email identities are rejected. This does not establish merchant/staff authorization. Production requires Firestore, Firebase/project/browser configuration and explicit HTTPS origins; it refuses local identity, SQLite and emulator settings.

`SESSION_BACKEND=firestore` stores ADK session events/state under the dedicated `FIRESTORE_NAMESPACE`, with transaction-backed concurrency leases shared across restarts/instances. The runtime uses its Cloud Run service identity. `GET /api/v1/conversations` and `GET /api/v1/conversations/{session_id}` return only the caller's history. In hosted mode the UI can resume a saved conversation; business card fields/photos remain browser data. Retention/deletion UX and business access policies still need implementation.

## Checks and contracts

```sh
uv run ruff check app tests scripts server.py run.py
uv run ruff format --check app tests scripts server.py run.py
uv run mypy
uv run pytest -q
uv run pip-audit --local --progress-spinner off
uv run python -m scripts.export_contract
```

After schema export, run from the repository root: `npx openapi-typescript docs/openapi.json -o src/api/generated.d.ts`. Commit both generated files with a contract change after review. Tests override model environment settings to prevent paid inference.

ADK emits an experimental function-schema warning in the fixture tests. Passing tests do not establish live provider compatibility, real speech quality, production security or submission readiness.

Firestore tests require `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` and a running emulator; they use a demo project and anonymous credentials, never production data. CI starts the emulator and runs these cases. Local tests without that explicit setting skip the emulator cases. Hosting is documented in [deployment/README.md](../deployment/README.md).
