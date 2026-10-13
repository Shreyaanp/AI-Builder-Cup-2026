# Python implementation rules

Follow published guidance and executable checks, with these project-specific constraints.

- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/): create and close shared resources at application lifespan, not per request or through import-time provider calls. The app factory accepts settings/session adapters for tests.
- [Python asyncio tasks](https://docs.python.org/3.13/library/asyncio-task.html): preserve cancellation, clean up in `finally`, retain task references, cancel and await sibling tasks when a bidirectional connection ends. Never leave a producer or queue running after disconnect.
- [ADK Python streaming](https://adk.dev/live/get-started/streaming-python/): use `run_async` for text and `run_live` with `LiveRequestQueue` for bidirectional streaming. Setting a streaming flag does not connect a consumer Google app.
- [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/): validate external inputs at boundaries; our contracts forbid unexpected fields. Secrets are server settings, never browser data.
- [uv locking](https://docs.astral.sh/uv/concepts/projects/sync/): keep the lockfile, sync with `--locked`, review dependency changes rather than bypass peer/version constraints.

Keep I/O asynchronous, or offload synchronous identity/filesystem calls. Bound input, output, time and concurrency. Derive identity from a verified session/token; never accept a caller-supplied user ID. Scope all storage to the principal. An agent may prepare a proposal, but business writes require application-owned authority and exact approval.

Use separate modules for contracts, configuration, identity, transport limits and agent runtime. Do not add a framework or abstraction without a concrete need. Regenerate the TypeScript API contract when Python schemas change. Redact errors instead of passing provider messages through to clients. Do not log keys, tokens, raw recordings, transcripts or model thoughts.

Ruff checks imports/errors/async pitfalls and formatting; mypy checks typed application definitions; pytest covers behaviour, isolation, limits and cleanup. Browser tests verify the cross-language connection. These checks support review and do not certify a production system.
