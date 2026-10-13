# Working as two contributors

Use Node 24, Python 3.13 and uv. Run `npm ci`, `uv sync --project backend --locked`, then `npm run dev:backend` and `npm run dev` in separate terminals. Read AGENTS.md, the Material skill and React/Python rulebooks. Run frontend and backend checks in README before review.

Suggested division: one contributor owns UI/accessibility/theme, another owns Python streaming/account/data integration. Python OpenAPI is the shared contract; export it and regenerate TypeScript types together. Keep changes on short feature branches and review each other's work. Avoid editing the same provider/model file simultaneously.

The remote is `https://github.com/Shreyaanp/AI-Builer-Cup-2026.git`. The owner explicitly authorized initial publication after local review. No collaborator invitation has been sent; repository roles remain the owner's choice.

Never commit .env files, tokens, personal merchant data, recordings or private research. Backend API keys must remain server-side; a VITE_ prefix makes values public in browser bundles. Don't introduce frontend credentials.

CI runs backend/frontend/emulator/container checks on push and pull requests. Inspect the Actions result before merging follow-up work. Cloud releases require a manual **Cloud Run release** dispatch of a checked main SHA; a push does not deploy automatically. Follow deployment/README.md. Keep live-model configuration and merchant publishing authorization separate.
