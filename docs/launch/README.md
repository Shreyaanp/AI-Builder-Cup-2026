# Chalkboard launch video (60 s)

- `chalkboard-launch.mp4`: 1080×1920 phone cut (H.264, 30 fps, 60.0 s, ~30 MB, silent).
- `chalkboard-launch-1920x1080.mp4`: 1920×1080 cut, same timing (~22 MB, silent).
- `source/`: the HyperFrames project (`hyperframes@0.8.92`, pinned). `build.mjs` holds the one
  scene list and generates `dist/portrait` and `dist/landscape` (git-ignored).
- `capture/`: the Playwright script that filmed the real screens in `source/assets/screens/`.

## Story

1. Chalkboard.
2. Snap your menu board.
3. The coach fills in your shop (review sheet).
4. Ready in minutes (self-filling shop card).
5. Sold out? One tap (the owner's own switch).
6. Print your QR code.
7. Customers scan.
8. …and ask "halal?" (instant answer).
9. Your week at a glance (weekly recap).
10. Ready for Google: "Chalkboard prepares your details. Google verifies." Chalkboard never
    publishes to Google, and the screen says so.
11. End card: chalkboard.shreyaan.work.

## Honesty

Every scene showing the shop carries a "Demo shop · fictional" label. The end card says shops
and data are fictional demo content and that Chalkboard is an independent prototype, not a
Google product.

**Real:** the screens are the real app from a local dev run with the offline coach. That covers
the seeded demo shops (`backend/scripts/seed_demo_shops.py`), three weeks of saved sales behind
the recap, the real sold-out switch, the real QR and the real Google checklist.

**Staged:** two steps are staged, because the offline fixtures can't do them:

- **The menu-photo read:** `/photos` returns a real sealed proposal prepared through the API, the
  same shape the live Gemini read produces. The board in scene 2 is an illustration, not a photo.
- **The customer's "halal?" answer:** `/ask` returns the reply the live path gives from the
  owner-confirmed facts (halal: yes; cash and PayNow), not an offline fixture answer.

## Reproduce

From the repo root (Windows paths shown; ports 3210/3310 are used so another dev server on
3200/3300 is untouched):

```powershell
npx playwright test -c docs/launch/capture/playwright.config.ts   # refreshes the screens
cd docs/launch/source
node build.mjs
$env:HYPERFRAMES_NO_TELEMETRY = '1'; $env:DO_NOT_TRACK = '1'
cd dist/portrait;  npx --yes hyperframes@0.8.92 render -o ../../../chalkboard-launch.mp4
cd ../landscape;   npx --yes hyperframes@0.8.92 render -o ../../../chalkboard-launch-1920x1080.mp4
```

Rendering needs FFmpeg on `PATH` (`C:\Users\pshre\AppData\Local\AIBuilderCupTools\ffmpeg\...`)
and uses the local Chrome. Nothing is published: `hyperframes publish` is never run, and
telemetry is switched off.

The capture backend uses its own `backend/data/launch-merchant.sqlite3` (recreated on each run).
It never uses the shared dev database: demo shops there would change `discover.spec` results.
