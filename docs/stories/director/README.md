# Track R · recording index

Baseline: cached `origin/main` at `fa60840b0a231008e068275a62171790a36cd2e9`. No remote fetch or PR lookup. All shop data in these artifacts is synthetic. These are raw browser walkthroughs, not a final promotional demo film.

## Reproduce locally

Use already-installed dependencies; this task does not authorize package downloads or external account services. The recorded run used the existing main checkout's dependency installation through an ignored local node_modules junction and its Python 3.13 environment. For a normal prepared checkout:

```powershell
$env:DIRECTOR_PYTHON = 'C:/path/to/prepared/backend/.venv/Scripts/python.exe'
$env:DIRECTOR_HOST = '127.0.0.2'
node tests/stories/director/server.mjs
```

In a second terminal:

```powershell
$env:DIRECTOR_HOST = '127.0.0.2'
node tests/stories/director/walk.mjs
```

Stop the director server with Ctrl+C, then finish the artifacts:

```powershell
node tests/stories/director/tidy.mjs --cache
node tests/stories/director/render.mjs
node tests/stories/director/verify.mjs
```

Optional story subset: `node tests/stories/director/walk.mjs s3 s5`. It refreshes those variants and merges the summary. Close the director server with Ctrl+C. No product source changes, commits, publishing, paid models, cloud mutations or supplier/customer contact are involved.

The launcher binds WEB_PORT=3537 and API_PORT=3637, creates a new isolated `.cache/director/<timestamp>/` working directory with fresh SQLite databases, and sets RECALL_PATH=`data/test-vectors` within it. It never loads `.env`: Vite uses that empty directory as envDir and Python's working directory is isolated. Python receives an explicit environment allowlist and a socket audit guard; browser HTTP and WebSocket routes permit only the local web origin. An unavailable face worker uses local port 3638. Do not run another service there. Local HTTP bootstrap is expected; real OAuth, providers, ERP and external business actions are excluded.

The recorded host is `127.0.0.2` because another worker owns `.1:3537`. The owner entry uses the app's existing `?app=business` override. Default localhost remains available by omitting DIRECTOR_HOST when the port is free. On the `.2` alias, the app's bootstrap advertises its default customer origin `.1:3200`; generated share links/QRs are inspected only, and customer checks navigate directly to `.2` routes. **The actual generated-share-link hand-off is therefore unvalidated in this alias run.** This harness limitation must not be filed as a product regression.

## Files and interpretation

For each `s1`…`s21`, open `phone-light`, `phone-dark`, `desktop-light` or `desktop-dark`:

- `walk.webm`: video from context start to close, at 390×844 or 1440×1000.
- `<step>.png`: viewport screenshot; finite CSS animation is finished for a stable still. The video records ordinary motion; stills do not prove it.
- `<step>.json`: density/spacing/target metrics, axe findings and contrast cases requiring manual review.
- `<step>-heatmap.svg`: overlay referencing the same-directory PNG. Open in a browser that permits local relative image loading.
- `run.json`: exact checkout SHA, timestamps, assertions completed, gaps and execution status.

`results.json` aggregates per-variant runs. The [scorecard](../../qa/story-scorecard.md) and [fix briefs](../../briefs/) distinguish recorded subsets from full acceptance. [STORIES.md](../../../STORIES.md) specifies every screen's loading/empty/error/offline/success intention. A matrix cell is not checked merely because another state was recorded.

[Final check results](checks.json) record command outputs and exit codes for lint, TypeScript, hook enforcement, formatting, artifact verification and AST-only graph refresh. Full `npm run check` and backend checks were not run because this track changes documentation and recording scripts, with no product/backend functional change. The recording checks do not mark the product green.

## Heatmap method

Viewport only: intersecting headings, paragraphs, list items, controls, status/alerts and MUI cards; exclude hidden, inert, zero-size and center-occluded nodes. A 6×12 grid counts box overlaps. Red means more semantic boxes, not predicted gaze. Nested elements can count twice; transparent decoration, photos and off-screen content can be underrepresented. Horizontal collections are intentionally clipped at the viewport. Metrics include elements/100k pixels, background hue bins (30° bins, chromatic threshold), fraction of positive sampled padding/gaps aligned to 4px, targets smaller than 44px, document overflow, automated contrast violations and incomplete contrast checks. The product recommendation remains 48px touch targets; the 44px report is a stricter diagnostic subset, not full target conformance.

There is no universal passing density/accent number. Use the overlay to ask whether the primary task wins attention, then check the actual screenshot. Automated contrast and target estimates do not replace keyboard, assistive-technology, large-text or physical-phone review. Eye-strain ratings are provisional human design judgments.

## Coverage limits

`walked` = the assertions in the implemented recording adapter ran; `partial` = known contract steps remain; `blocked` = this main entry/adapter cannot continue; `failed` = an execution/assertion failed and needs diagnosis. Blocked routes save an entry screenshot and video instead of fabricating a flow. Missing named entry does not prove the backend lacks the feature. The script deliberately does not read signed QR keys; an unsigned stamp is only on-phone progress. Normal-motion records have selected reduced-motion end-state checkpoints; this is not a full animation audit.

Physical camera/GPS/microphone, voice sound/accuracy, face matching, real account sign-in, all 15 languages, 200% text, 320px reflow, real provider forecasts and current open PR branches remain separate evidence requirements. Cached local branches do not establish PR status. Public documentation consulted for research is listed in [ux-2026.md](../../research/ux-2026.md); app recording runs block outbound network use.
