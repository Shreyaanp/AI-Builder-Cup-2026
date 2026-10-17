# Google AI Builder Cup submission checklist

Review date: 16 October 2026. Track: Retail & Commerce. Requirements below follow the recorded
[hackathon review](HACKATHON-REVIEW.md) and [submission plan](PLAN-V2.md); the current official
rule book was not fetched because this task prohibits external service calls. This is a release
checklist, not a declaration that every requirement is satisfied.

| Requirement                          | Status                                             | Evidence / remaining action                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live Cloud Run URL                   | **Recorded live; current reachability unverified** | [Cloud Run app](https://ogoogle-ai-176787245026.asia-south1.run.app), [customer site](https://chalkboard.shreyaan.work), [owner app](https://business.chalkboard.shreyaan.work). Earlier hosted checks are in [project memory](../PROJECT_MEMORY.md). Confirm current health, submitted revision and both customer/owner journeys before submitting. |
| Public GitHub repository             | **URL recorded; public access unverified**         | [Shreyaanp/AI-Builer-Cup-2026](https://github.com/Shreyaanp/AI-Builer-Cup-2026). Confirm signed-out access and that README, screenshots and the submitted commit are visible. No push or remote check was performed here.                                                                                                                            |
| English submission                   | **Docs ready; final media pending**                | README, architecture and service inventory are in English. Check the final video, captions and PDF deck. Multilingual product UI is separate.                                                                                                                                                                                                        |
| Google AI used in the product        | **Implemented; prior live evidence recorded**      | [Verified inventory](google-ai.md) maps actual calls/settings to code. Gemini/Live, Cloud TTS and TimesFM have historical live reports. Disabled and pending services must not be represented as live. Recheck on the submitted revision.                                                                                                            |
| Fresh code / qualifying build period | **Pending rule/date check**                        | Source and Git history are present; confirm allowed build dates, earlier-work policy, asset licences and the final submission SHA against the official rules. A fresh worktree alone does not establish eligibility.                                                                                                                                 |
| Demo video under 3 minutes           | **Pending**                                        | [Video placeholder](#demo-video). Supply the final public playback link, measure duration below 180 seconds, and check English narration/captions and signed-out access.                                                                                                                                                                             |
| Deck as PDF                          | **Pending**                                        | [Deck placeholder](#deck-pdf). Export the final English deck as PDF, add an accessible link, and check problem, impact, architecture, Google AI evidence and honest pending labels.                                                                                                                                                                  |

## Demo video

**Placeholder — final video link pending.** No final submission video or measured duration was
verified in this checkout. Existing story screenshots/recordings are inputs, not the final video.

## Deck PDF

**Placeholder — final deck PDF link pending.** No final deck PDF was verified in this checkout.
Use the [implemented architecture](architecture.md) and [verified service inventory](google-ai.md)
for its technical claims.

## Local verification

This docs task reviews checkout `fb483b2`. Tests use local fixtures and cached dependencies;
no live model, Google login, external Maps call, cloud operation or physical phone is exercised.

Verified with Node 24.21.0, Python 3.13.16 and uv 0.13.0:

| Check run for this docs change          | Result                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency setup                        | Locked npm and uv dependencies installed from local caches with offline mode. Registry downloads and a machine without caches were not tested.                                                                                                                                                                                                                         |
| README demo seed command                | Passed: six fictional Singapore shops, including the Tiong Bahru bakery, written to local SQLite.                                                                                                                                                                                                                                                                      |
| `npm run dev:backend` and `npm run dev` | Passed in a bounded foreground smoke runner with a clean environment, Python external-network blocking and unused ports (`WEB_PORT=49964`, `API_PORT=49963`). Health confirmed offline/local/SQLite; owner and customer HTML, transformed entry, API proxy and API docs returned successfully. Both owned server process trees were closed before the runner returned. |
| Offline product smoke                   | Passed: new-shop SSE reply reached `turn_complete`; a croissant search at Tiong Bahru returned the seeded bakery. This is an HTTP/transport check, not a browser journey or ASR test.                                                                                                                                                                                  |
| `npm run build`                         | Passed: TypeScript and Vite production build, 3,095 modules. Vite still warns about chunks over 500 kB.                                                                                                                                                                                                                                                                |
| Local documentation links and structure | Passed: 115 file, image and heading-anchor links; four README screenshots and five story bullets per audience. Nine external links were deliberately left uncontacted.                                                                                                                                                                                                 |
| Mermaid                                 | Static structure checked: 13 declared nodes, with every edge referencing a declared node. GitHub rendering was not exercised.                                                                                                                                                                                                                                          |

Formatting passed for all four changed docs with:

```sh
npx --no-install prettier --check README.md docs/architecture.md docs/google-ai.md docs/submission-checklist.md
```

No application code changed, so the full `npm run check`, backend suite and hosted release gates
were not rerun. Historical feature-test counts remain in [handoff reports](handoff/), separate
from checks run for this change. No commit, push, deployment or cloud-resource change was made.

## Final release review

- Fill both media placeholders and verify the links without signing in.
- Confirm the submitted public commit matches the running Cloud Run revision and settings.
- Re-run the release gates on that commit; do not infer a passing suite from these docs checks.
- Validate the owner/customer demo on a physical phone, including microphone and camera recovery.
- Reconcile any newly merged Google-service work with the inventory before recording the video.
