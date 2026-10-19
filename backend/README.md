# Python backend

Python 3.13, FastAPI, Uvicorn, Google ADK, Google Gen AI SDK, Pydantic/settings, sse-starlette, SQLAlchemy/aiosqlite, Firebase Admin, Firestore SDK, itsdangerous and structlog are installed and locked. Ruff, mypy, pytest/pytest-asyncio, HTTP test clients and pip-audit support development. Use `uv sync --locked`; do not force incompatible package versions. ADK currently resolves FastAPI 0.141.1.

## Local review

From the repository root, `npm run dev:backend`; on this workstation `./start.ps1` starts both services. These launchers force offline mode. API docs: `http://127.0.0.1:3300/docs`.

`GET /api/v1/bootstrap` establishes a signed, HttpOnly development cookie. This is a private local workspace, not Google sign-in or proof of business ownership. `POST /api/v1/coach/stream` accepts a message and optional owned conversation UUID. `GET /api/v1/health` reports configured modes and unconnected Google statuses. WebSocket `/api/v1/voice` is defined in `app/main.py` and runs the Gemini Live session in `app/voice.py`.

The default `.env.example` contains no key. No configuration is required for the offline fixture. The backend saves conversation events to `data/sessions.sqlite3` and a signing key to `data/local-session.key`; both are ignored. Treat these as private local files. They are not encrypted application records or cloud memory. Use fictional data during review.

## Provider configuration, later

Copy `.env.example` to `.env`, set a server-only key and explicit available text/live model IDs, then select `COACH_MODE=gemini`. Launch from this directory with `uv run uvicorn app.main:app --host 127.0.0.1 --port 3300 --ws-max-size 32768 --ws-max-queue 8 --no-access-log`. This manual path honours settings; the review launchers deliberately remain offline. Actual model calls can consume quota/credits: confirm eligibility and the existing spending constraint before using this path. Nothing in this template enables billing or guarantees a monetary cap.

`AUTH_MODE=firebase` enables verified Google bearer identities; the frontend uses the Firebase sign-in SDK and public, dedicated browser configuration. Other shared-project providers and unverified email identities are rejected. This does not establish merchant/staff authorization. Production requires Firestore, Firebase/project/browser configuration and explicit HTTPS origins; it refuses local identity, SQLite and emulator settings.

`SESSION_BACKEND=firestore` stores ADK session events/state under the dedicated `FIRESTORE_NAMESPACE`, with transaction-backed concurrency leases shared across restarts/instances. The runtime uses its Cloud Run service identity. `GET /api/v1/conversations` and `GET /api/v1/conversations/{session_id}` return only the caller's history. In hosted mode the UI can resume a saved conversation; business card fields/photos remain browser data. Retention/deletion UX and business access policies still need implementation.

## Checks and contracts

Public preview (#153): set `PUBLIC_DEMO_ENABLED=true` to enable `/demo` on either host and
`/explore/demo` for customer browsing. The default is off. These previews reuse the tour seed in
throwaway storage, expose fixture reads only, and expire after 15 minutes or on Exit demo.
Allocation is limited to 5 per minute and 20 per hour per IP, with 128 sessions per process.
Sessions are intentionally in memory: a process restart ends them; multiple instances require
session affinity or a shared fixture cache before enabling this switch. No sign-in, merchant
publication, live AI, or durable owner records are involved.

```sh
uv run ruff check app tests scripts server.py run.py
uv run ruff format --check app tests scripts server.py run.py
uv run mypy
uv run pytest -q
uv run pip-audit --local --progress-spinner off
uv run python -m scripts.export_contract
```

After schema export, run from the repository root: `npx openapi-typescript backend/openapi.json -o src/api/generated.d.ts`. Commit both generated files with a contract change after review. Tests override model environment settings to prevent paid inference.

ADK emits an experimental function-schema warning in the fixture tests. Passing tests do not establish live provider compatibility, real speech quality, production security or submission readiness.

Firestore tests require `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` and a running emulator; they use a demo project and anonymous credentials, never production data. CI starts the emulator and runs these cases. Local tests without that explicit setting skip the emulator cases. Hosting is documented in [deployment/README.md](../deployment/README.md).

## B40: fictional demo world

From `backend/`, preview or seed local data (PowerShell examples):

```powershell
uv run python -m scripts.seed_demo_shops --dry-run
uv run python -m scripts.seed_demo_shops --sqlite data/demo-world.sqlite3
uv run python -m scripts.seed_demo_shops --sqlite data/demo-world.sqlite3 --city bengaluru --owner-uid YOUR_UID
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
uv run python -m scripts.seed_demo_shops --owner-uid YOUR_UID
```

The 28 sample shops comprise Singapore (6), Bengaluru (4: two in Indiranagar, two in
Koramangala), Delhi / Hauz Khas (3), Mumbai / Bandra (3), Kuala Lumpur / Bangsar (3),
Jakarta / Kemang (3), Tokyo / Shimokitazawa (3), and Bangkok / Ari (3).
`--city` accepts `singapore`, `bengaluru`, `delhi`, `mumbai`, `kuala-lumpur`, `jakarta`,
`tokyo`, or `bangkok`, case insensitive. Discovery keeps its geographic radius:
the default 3 km around Indiranagar includes its two shops; 10 km includes Koramangala too.
These are approximate pins with invented addresses, not real Google listings.

Each shop has 6–10 categorised items, fixed selling units, 1–2 sold-out items, local
currency/timezone, payment/delivery examples, customer facts, and seven-day opening hours.
Shop names include `(Demo)` on owner screens; the existing public `Demo shop` chip and
phone suppression remain. Every shop states that its menu, sales and customers are fictional.
Payment and delivery names describe samples; no provider is connected.

The script seeds 42 complete days ending yesterday in each shop's timezone, using the
same sealed `prepare_sales` / `save_sales` storage as approved imports. Quantities have
weekday/weekend patterns, a gentle trend and deterministic noise; revenue uses actual
item prices in currency minor units (including zero-decimal JPY/IDR). It also inserts
three labelled demo inquiry threads per shop, including two in the previous ISO week,
so the real recap calculates revenue, top sellers and customer-message counts.
No summary or forecast model result is fabricated or cached by the seed. The normal
local forecast reports `weekday_average`; item preparation reports
`same_weekday_four_weeks`. Configured provider methods retain their actual labels.
The seed itself never invokes a model or an external payment/delivery service.

By default all fixtures belong to the synthetic UID `demo-world-owner`.
Optional `--owner-uid` **adds** the supplied account as an owner of the first shop per
selected city, including Singapore. Existing real shops and memberships remain intact;
the owner's login sees complete catalogues, sales, recap and inquiries for those shops.
This grants app access to fictional records only, not external business authority.
For databases seeded by the older script, supply `--seed-owner-uid ORIGINAL_UID` to
retain that ownership. The script refuses demo IDs owned by a different seed owner.
It does not create authentication accounts or accept consent for them.

Re-running on the same day preserves IDs, revisions, sales and inquiry replies/read/closed
state. Later runs import new days and retain older sales within the normal 365-day storage
limit; existing demo threads retain their original dates. Changed demo catalogues and
sales on seeded dates are reset to the fixtures. Real shops are never reset. `--dry-run`
opens no database and needs no emulator. Without `--sqlite`, actual writes require a
running emulator, unless `--project` is explicitly supplied; `--database` and `--namespace`
select its storage. Do not use a real project for local review. No cloud seed was run for B40.
