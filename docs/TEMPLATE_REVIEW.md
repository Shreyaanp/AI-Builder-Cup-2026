# Local streaming review — October 13, 2026

| Check                  | Result                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Python environment     | Managed Python 3.13.16, uv0.13.0, locked dependency graph installed                                                                                                      |
| Backend static checks  | Ruff lint/format and mypy passed                                                                                                                                         |
| Backend behaviour      | 14 tests passed: configuration guards, real ADK offline streaming, identity/session isolation, limits, errors, timeout, SQLite restart and disconnect/next-turn recovery |
| Live adapter           | Substituted ADK SDK events validate input PCM, output PCM, interruption, task/queue cleanup; no Google request or microphone involved                                    |
| Frontend               | Strict TypeScript/build, zero-warning ESLint, hook enforcement and Prettier passed                                                                                       |
| Browser integration    | 20 scenarios passed across phone-sized and desktop Chrome, including stop/retry, truncated-stream recovery and split UTF-8/CRLF parsing                                  |
| Dependency advisories  | npm and pip-audit reported no known vulnerabilities at this check                                                                                                        |
| Runtime log scan       | Zero matches for server ERROR / connection-closed / SQLite operational/termination errors after final tests                                                              |
| GitHub CI / deployment | Prepared check-only workflow; neither remote CI nor cloud deployment executed                                                                                            |

The first stop test exposed SQLite cleanup interrupted by SSE task-group cancellation. A bounded independent producer and shielded cleanup resolved it. The regression sends a real ASGI disconnect against SQLite, checks lease/task cleanup and completes another ADK turn. The UI also verifies stop and retry against the running Python API.

Offline replies are scripted. Live Gemini, actual microphone capture/playback, customer/merchant account assembly, business commits/publication, native Google hosts and cloud memory remain unverified or unimplemented. Existing phone results belong to the earlier POC. Automated accessibility scans are scoped browser evidence, not full conformance.

ADK currently warns that function-schema generation is experimental. Vite reports a roughly508KB entry bundle (158KB gzip), above its500KB warning threshold. No performance certification or completed PWA installation is claimed. Review the template before initial commit/push.
