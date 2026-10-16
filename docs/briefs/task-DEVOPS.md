# DevOps hardening + scalable architecture evidence (Codex)

Branch `fix/devops-hardening` from origin/main; commit small (no AI trailers), push, `gh pr create`.
Read docs/OWNER-NOTES.md (16 Oct ~05:00), deployment/_, scripts/ship.ps1, .github/workflows/_.

1. **One release path:** scripts/ship.ps1 builds and deploys the image but does NOT apply the runtime
   environment (deployment/runtime-config.py is only used by .github/workflows/deploy.yml), so env
   changes (e.g. FORECAST_BACKEND, GOOGLE_TEXT_MODEL) silently did not reach production. Make ship.ps1
   apply the same runtime config as CI (never print secrets), deploy from a clean tagged commit, and
   verify health + RELEASE_COMMIT afterwards. Add a release checklist doc.
2. **Feature switches:** a small, typed feature-flag mechanism (server env + client) so unfinished
   features can be hidden at the cutoff without code removal; document how to flip one.
3. **CI speed:** cache npm/uv/Playwright browsers, keep shards balanced; do not weaken tests.
4. **Warm instance option:** document/script min-instances=1 for the judging window and back to 0
   (do not apply it yourself; the assistant applies it on Saturday).
5. **Scalability evidence:** an architecture diagram (docs/architecture.md, Mermaid) of Cloud Run,
   Firestore, Vertex Gemini/Live, TTS, Vision, BigQuery TimesFM, embeddings, GCS, Maps; and a small load
   test against a LOCAL server only (k6 or locust, free) for the read-heavy customer endpoints and coach
   stream (offline fixture), with results in docs/impact/load-test.md. Never load-test production.
   Run backend tests and `npm run check`. Report what changed and how to release.

## Owner additions (16 Oct ~05:10): small, practical scalability fixes (no big re-architecture)

6. **CDN**: serve the built frontend's static assets (JS/CSS/fonts/images) with long-lived immutable
   cache headers and through a CDN (prefer Firebase Hosting in front of Cloud Run, free tier, or Cloud
   CDN if already set up); HTML stays short-cached. Uploaded photos from GCS served with cache headers.
7. **Capacity**: check Cloud Run max-instances (believed to be 1), concurrency, CPU/memory, timeouts;
   propose safe values for "30,000 users tomorrow" with the existing budget alert; document Gemini/
   Vertex quota limits and graceful degradation (queue/try-again UI, cached answers). Apply nothing to
   production yourself; write the exact commands for the assistant.
