# Project memory

Updated October 13, 2026. Confirmed decisions and evidence only; never record secrets or full conversations here.

- Initial publication completed: template commit `c79cd7fe63eb89709605e6eecab92af47bb8628d` is on GitHub `main`, confirmed against the remote commit API. GitHub Actions run `38439789071` started for that commit; no remote pass is claimed while it is running. Credentials, SQLite/session keys, recordings, dependencies and runtime outputs were excluded.

- Product: **oGoogle AI**, independent business-information coach. React/TypeScript frontend; latest choice is **Python/FastAPI + Google ADK**, superseding Express. Full UI redesign and face/liveness are deferred.
- Latest authorization: user explicitly requested initial commit/push to `Shreyaanp/AI-Builer-Cup-2026` after the local review template was delivered. Pre-publication inspection confirmed the remote is empty, the 99 source candidates contain no detected credential patterns or private database/audio files, and the CI action tags exist. No cloud deployment or paid inference is authorized by this push.
- Implemented: real ADK scripted offline model, SSE React connection with stop/error/input preservation, signed local workspace, owned SQLite ADK sessions, bounded read/propose tools and WebSocket Gemini Live adapter. Live configuration is separate. No server key copied, model call or external business write performed.
- Passed: 14 backend tests; Ruff/mypy; 20 phone-sized/desktop Chrome scenarios; frontend build/lint/hook probes; formatting. npm and pip audits found no known vulnerabilities. SQLite restart and ASGI disconnect/recovery are tested. Live tests use substituted SDK events; no ASR/provider result is claimed.
- Fixed: SSE cancellation interrupted SQLite cleanup. Bounded isolated producer and shielded cleanup passed the regression and browser stop/retry checks. Final server log scan had zero runtime error matches.
- Remaining: frontend microphone/playback, live provider evaluation, Google sign-in UI, business roles/approval/commits, inventory/product services, cloud records/session adapters, shared limits, Google publishing/native placement, deployment and actual new-starter Android/PWA validation.
- CI workflow runs checks on push/pull requests; confirm the remote result after publication. Repo origin is `Shreyaanp/AI-Builer-Cup-2026`. Preliminary manifest is not an installation/offline claim. Vite bundle-size and ADK experimental-schema warnings are recorded in the review.
